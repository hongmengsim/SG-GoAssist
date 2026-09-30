"""A backend wrapper that never makes the caller wait for the network.

The agent's safety loop reads the sensors, decides, and moves the simulated ramp. If a network
call inside that loop blocks (a stuck connection can take seconds per call), the decision the
ramp acts on goes stale. This wrapper moves every network call to one worker thread:

* reports (status, decision, ramp, telemetry) keep only the latest of each kind, since only the
  latest matters; a failed one is retried by the worker;
* acknowledgements and actuator reports are queued and retried until delivered (an
  acknowledgement the backend refuses is dropped, not retried forever);
* polls return the last answer at once and refresh in the background;
* ``post_now`` waits for one answer, but only up to a timeout, for the few actions that need the
  backend's verdict before the agent can proceed (entering the bay).

After a failed delivery ``post`` raises BackendError, so the agent's status page shows the link
as down until a delivery works again. Safety never depends on any of this.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from .backend import Backend, BackendError, BackendRefused

log = logging.getLogger(__name__)

MAX_QUEUED_ACKS = 200
MAX_QUEUED_REPORTS = 200


@dataclass
class _Now:
    kind: str
    body: dict
    done: threading.Event = field(default_factory=threading.Event)
    outcome: str = ""
    error: Optional[Exception] = None
    abandoned: bool = False


class AsyncBackend:
    def __init__(self, inner: Backend, retry_seconds: float = 1.0, poll_seconds: float = 1.0) -> None:
        self._inner = inner
        self._retry = retry_seconds
        self._poll = poll_seconds
        self._cond = threading.Condition()
        self._stopped = False
        self._posts: dict[str, dict] = {}
        self._acks: deque[str] = deque()
        self._reports: dict[str, dict] = {}
        self._now: deque[_Now] = deque()
        self._capability: Optional[dict] = None
        self._requests: list = []
        self._commands: list = []
        self._want_requests = False
        self._want_commands = False
        self._want_halt = False
        self._halt: Optional[dict] = None
        # Bumped when a push tells the agent something newer than any halt read in flight.
        self._halt_epoch = 0
        self._last_poll = {"requests": 0.0, "commands": 0.0, "halt": 0.0}
        self.last_error: Optional[str] = None
        self._thread = threading.Thread(target=self._run, name="backend-io", daemon=True)
        self._thread.start()

    @property
    def running(self) -> bool:
        return self._thread.is_alive()

    def stop(self) -> None:
        with self._cond:
            self._stopped = True
            self._cond.notify_all()
        self._thread.join(timeout=2)

    # ---- Backend protocol (never blocks) ------------------------------------------------------

    def post(self, kind: str, body: dict) -> str:
        with self._cond:
            self._posts[kind] = body
            self._cond.notify_all()
            error = self.last_error
        if error is not None:
            raise BackendError(error)
        return "QUEUED"

    def post_now(self, kind: str, body: dict, timeout: float = 2.0) -> str:
        job = _Now(kind, body)
        with self._cond:
            self._now.append(job)
            self._cond.notify_all()
        if not job.done.wait(timeout):
            job.abandoned = True
            raise BackendError(f"{kind} did not get an answer within {timeout:.1f}s")
        if job.error is not None:
            raise job.error
        return job.outcome

    def ack_request(self, request_id: str) -> None:
        with self._cond:
            if len(self._acks) < MAX_QUEUED_ACKS and request_id not in self._acks:
                self._acks.append(request_id)
            self._cond.notify_all()

    def report_actuator(self, command_id: str, body: dict) -> None:
        with self._cond:
            if command_id in self._reports or len(self._reports) < MAX_QUEUED_REPORTS:
                self._reports[command_id] = body
            self._cond.notify_all()

    def pending_requests(self) -> list:
        with self._cond:
            self._want_requests = True
            self._cond.notify_all()
            return list(self._requests)

    def pending_actuator_commands(self) -> list:
        with self._cond:
            self._want_commands = True
            self._cond.notify_all()
            return list(self._commands)

    def pending_operator_halt(self) -> Optional[dict]:
        with self._cond:
            self._want_halt = True
            self._cond.notify_all()
            return None if self._halt is None else dict(self._halt)

    def invalidate_halt(self) -> None:
        """A pushed halt event is newer than any read that started before it.

        Forgets the cached halt, throws away a read that is in flight, and asks for a fresh one,
        so an answer that is 0 to 10 s old can never undo what the push just said.
        """
        with self._cond:
            self._halt_epoch += 1
            self._halt = None
            self._want_halt = True
            self._last_poll["halt"] = 0.0
            self._cond.notify_all()

    def register_capability(self, capability: dict) -> None:
        with self._cond:
            self._capability = capability
            self._cond.notify_all()

    # ---- worker -------------------------------------------------------------------------------

    def _run(self) -> None:
        while True:
            with self._cond:
                while not self._stopped and not self._has_work():
                    self._cond.wait(self._retry)
                if self._stopped:
                    return
            failed = self._do_one_round()
            if failed:
                with self._cond:
                    if not self._stopped:
                        self._cond.wait(self._retry)

    def _has_work(self) -> bool:
        now = time.monotonic()
        return bool(
            self._now
            or self._capability is not None
            or self._acks
            or self._reports
            or self._posts
            or (self._want_requests and now - self._last_poll["requests"] >= self._poll)
            or (self._want_commands and now - self._last_poll["commands"] >= self._poll)
            or (self._want_halt and now - self._last_poll["halt"] >= self._poll)
        )

    def _succeeded(self) -> None:
        with self._cond:
            self.last_error = None

    def _failed(self, error: Exception) -> None:
        with self._cond:
            self.last_error = str(error)

    def _do_one_round(self) -> bool:
        """Runs each kind of pending work once. Returns True if anything failed."""
        failed = False
        failed |= self._run_now_jobs()
        failed |= self._send_capability()
        failed |= self._send_acks()
        failed |= self._send_reports()
        failed |= self._send_posts()
        failed |= self._refresh_polls()
        return failed

    def _run_now_jobs(self) -> bool:
        failed = False
        while True:
            with self._cond:
                if not self._now:
                    return failed
                job = self._now.popleft()
            if job.abandoned:
                continue
            try:
                job.outcome = self._inner.post(job.kind, job.body)
                self._succeeded()
            except BackendRefused as error:
                job.error = error  # a verdict, not a link failure
            except BackendError as error:
                job.error = error
                self._failed(error)
                failed = True
            job.done.set()

    def _send_capability(self) -> bool:
        with self._cond:
            capability = self._capability
        register = getattr(self._inner, "register_capability", None)
        if capability is None or register is None:
            with self._cond:
                self._capability = None
            return False
        try:
            register(capability)
        except BackendRefused as error:
            log.warning("The backend refused the capability: %s", error)
        except BackendError as error:
            self._failed(error)
            return True
        with self._cond:
            if self._capability is capability:
                self._capability = None
        self._succeeded()
        return False

    def _send_acks(self) -> bool:
        while True:
            with self._cond:
                if not self._acks:
                    return False
                request_id = self._acks[0]
            try:
                self._inner.ack_request(request_id)
            except BackendRefused as error:
                log.warning("Acknowledgement of %s refused, dropping it: %s", request_id, error)
            except BackendError as error:
                self._failed(error)
                return True
            with self._cond:
                if self._acks and self._acks[0] == request_id:
                    self._acks.popleft()
            self._succeeded()

    def _send_reports(self) -> bool:
        with self._cond:
            pending = list(self._reports.items())
        for command_id, body in pending:
            try:
                self._inner.report_actuator(command_id, body)
            except BackendRefused as error:
                log.warning("Actuator report for %s refused, dropping it: %s", command_id, error)
            except BackendError as error:
                self._failed(error)
                return True
            with self._cond:
                if self._reports.get(command_id) is body:
                    del self._reports[command_id]
            self._succeeded()
        return False

    def _send_posts(self) -> bool:
        with self._cond:
            pending = list(self._posts.items())
        for kind, body in pending:
            try:
                self._inner.post(kind, body)
            except BackendRefused as error:
                log.warning("The backend refused a %s report, dropping it: %s", kind, error)
            except BackendError as error:
                self._failed(error)
                return True
            with self._cond:
                if self._posts.get(kind) is body:
                    del self._posts[kind]
            self._succeeded()
        return False

    def _refresh_polls(self) -> bool:
        failed = False
        for name, fetch, want_attr, cache_attr in (
            ("requests", self._inner.pending_requests, "_want_requests", "_requests"),
            ("commands", self._inner.pending_actuator_commands, "_want_commands", "_commands"),
            ("halt", self._inner.pending_operator_halt, "_want_halt", "_halt"),
        ):
            with self._cond:
                wanted = getattr(self, want_attr)
                due = time.monotonic() - self._last_poll[name] >= self._poll
            if not (wanted and due):
                continue
            with self._cond:
                setattr(self, want_attr, False)
                self._last_poll[name] = time.monotonic()
                epoch = self._halt_epoch
            try:
                items = fetch()
            except BackendError as error:
                self._failed(error)
                failed = True
                continue
            with self._cond:
                if name == "halt" and epoch != self._halt_epoch:
                    continue  # a push overtook this read; the next one will be fresh
                setattr(self, cache_attr, items if name == "halt" else list(items))
            self._succeeded()
        return failed
