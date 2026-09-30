"""The bus agent core: one simulated bus driven by real or simulated sensors.

Each tick reads the beam and the camera, asks the safety gate whether the ramp may move,
steps the simulated ramp, and posts reports to the backend on change plus a slow heartbeat.
The gate decides locally: if the backend is unreachable the ramp still halts on an obstruction.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Callable, Optional

from beam_reading import BeamReader
from perception import DEFAULT_POLICY, PerceptionResult, Policy, analyse
from safety_gate import BeamInput, BusContext, CameraInput, Decision, GateConfig, decide
from safety_gate.models import BACKEND_LINK_LOST, CAMERA_DEGRADED, DEPLOYMENT_TIMEOUT, REASON_ORDER

from . import ramp as ramp_sim
from .adapters import beam_input, camera_input
from .backend import Backend, BackendError, BackendRefused, BackendTimeout
from .posting import DEFAULT_HEARTBEAT_SECONDS, ChangeGate

log = logging.getLogger(__name__)

TRAVELLING = "TRAVELLING_TO_STOP"
WAITING = "WAITING_FOR_BAY"
POSITIONED = "POSITIONED_AT_STOP"
DEPARTING = "DEPARTING"

# ASSUMPTION: a placeholder rectangle for the ramp-sweep zone in normalised image coordinates,
# to be replaced by the polygon measured on the real camera view.
DEFAULT_RAMP_POLYGON = ((0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75))

MAX_UNACKED_REQUESTS = 50
# A stalled loop must not let the ramp jump ahead: one tick never counts as more than this.
MAX_TICK_SECONDS = 1.0
MAX_REMEMBERED_COMMANDS = 200

_RAMP_POSITION = {
    ramp_sim.STOWED: "STOWED",
    ramp_sim.DEPLOYED: "DEPLOYED",
    ramp_sim.DEPLOYMENT_REQUESTED: "DEPLOYING",
    ramp_sim.DEPLOYING: "DEPLOYING",
    ramp_sim.HALTED: "DEPLOYING",
}


class DepartureBlocked(Exception):
    """A bus must not leave with its ramp out."""


@dataclass(frozen=True)
class AgentConfig:
    heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS
    # ASSUMPTIONS (placeholders, not agreed values): how often to look for actuator commands
    # and for requests the push may have missed.
    command_poll_seconds: float = 1.0
    request_poll_seconds: float = 5.0
    deploy_seconds: float = ramp_sim.DEFAULT_DEPLOY_SECONDS
    # ASSUMPTION: how long to wait for the backend's verdict on entering the bay (placeholder).
    entry_timeout_seconds: float = 2.0
    # Off (None) until the team agrees values. A deployment that has not finished this long after
    # it started raises help-required and halts; a backend that has not answered for this long
    # halts the ramp.
    deployment_timeout_seconds: Optional[float] = None
    link_loss_halt_seconds: Optional[float] = None
    ramp_polygon: tuple = DEFAULT_RAMP_POLYGON


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class BusAgent:
    def __init__(
        self,
        bus_id: str,
        bus_service: str,
        backend: Backend,
        camera: object,
        detector: object,
        beam_reader: BeamReader,
        clock: Callable[[], float] = time.monotonic,
        iso_clock: Callable[[], str] = _utc_now,
        config: AgentConfig = AgentConfig(),
        policy: Policy = DEFAULT_POLICY,
        gate_config: GateConfig = GateConfig(),
    ) -> None:
        self.bus_id = bus_id
        self.bus_service = bus_service
        self._backend = backend
        self._camera = camera
        self._detector = detector
        self._beam = beam_reader
        self._clock = clock
        self._iso = iso_clock
        self._config = config
        self._policy = policy
        self._gate_config = gate_config
        self._gate = ChangeGate(config.heartbeat_seconds, clock)

        self.movement = TRAVELLING
        self.stop_code: Optional[str] = None
        self.ramp = ramp_sim.RampSim()
        self.last_decision: Optional[Decision] = None
        self._operator_halt = False
        # Until the halt state has been read once (or pushed), it is unknown, and unknown counts as
        # halted: a Pi that restarts during an operator halt must not deploy before it has asked.
        self._halt_known = False
        self._accepted: dict[str, dict] = {}
        self._unacked: dict[str, dict] = {}
        self._commands: dict[str, dict] = {}
        self._active_command: Optional[str] = None
        self._last_tick: Optional[float] = None
        self._next_command_poll = 0.0
        self._next_request_poll = 0.0
        self._simulated = bool(getattr(camera, "simulated", False))
        # Whether the last report reached the backend, for the local status page.
        self.link: dict = {"ok": True, "error": None}
        self.last_beam = None  # the latest BeamReading, for the status page
        self._deploy_started: Optional[float] = None
        self._help_raised = False
        # Since when each direction (sending, polling) has been failing; None while it works.
        self._failing_since: dict[str, Optional[float]] = {"post": None, "poll": None}

    # ---- controls the scenario, the status page and the backend link call -------------------

    def arrive(self, stop_code: str) -> None:
        """Reach the stop: take the bay if the backend allows it, otherwise wait for it."""
        self.stop_code = stop_code
        self.movement = POSITIONED
        try:
            self._post_now("bus-status", self._bus_status_body())
        except BackendRefused as refusal:
            log.info("Bay entry refused (%s); waiting for the bay", refusal)
            self.movement = WAITING
            self._post_safely("bus-status", self._bus_status_body())
        except BackendTimeout:
            # No verdict yet: wait for the bay until it is granted (the push moves us on), rather
            # than acting as if it were ours.
            log.warning("No answer on bay entry; waiting for the bay")
            self.movement = WAITING
            self._post_safely("bus-status", self._bus_status_body())
        except BackendError:
            log.warning("Backend unreachable on arrival; will report on the next tick")

    def depart(self) -> None:
        if self.ramp.state != ramp_sim.STOWED:
            raise DepartureBlocked("the ramp is not stowed")
        self.movement = DEPARTING
        self._accepted.clear()
        self._post_safely("bus-status", self._bus_status_body())

    def start_travel(self, stop_code: Optional[str] = None) -> None:
        self.movement = TRAVELLING
        self.stop_code = stop_code
        self._post_safely("bus-status", self._bus_status_body())

    def set_operator_halt(self, halted: bool) -> None:
        self._operator_halt = bool(halted)
        self._halt_known = True

    def handle_event(self, message: dict) -> None:
        """A message pushed by the backend for this bus."""
        if not isinstance(message, dict):
            log.warning("Ignoring a pushed message that is not an object")
            return
        kind = message.get("type")
        if kind == "ASSIST_REQUESTED":
            self._on_request(message.get("request") or {})
        elif kind == "BAY_STATUS":
            self._on_bay(message.get("bay") or {})
        elif kind == "OPERATOR_HALT":
            halt = message.get("halt") or {}
            if halt.get("busId") == self.bus_id and isinstance(halt.get("halted"), bool):
                if halt["halted"]:
                    self.set_operator_halt(True)
                else:
                    # A push is not authenticated, so it can start a halt but never end one. The
                    # release is taken from the next signed read, which is asked for at once.
                    self._next_request_poll = 0.0
                # Any halt read that started before this push is older than it.
                invalidate = getattr(self._backend, "invalidate_halt", None)
                if invalidate is not None:
                    invalidate()

    # ---- the loop ---------------------------------------------------------------------------

    def tick(self) -> None:
        """One pass of the loop. Nothing that goes wrong inside may end the loop; a failure halts
        the ramp instead (the safe direction) and the next tick tries again."""
        try:
            self._tick()
        except Exception:  # noqa: BLE001 - a fail-stop agent cannot report its own halt
            log.exception("The agent tick failed; halting the ramp")
            self.ramp = ramp_sim.step(self.ramp, "HALT", (CAMERA_DEGRADED,), 0.0, self._config.deploy_seconds)

    def _tick(self) -> None:
        now = self._clock()
        dt = 0.0 if self._last_tick is None else min(MAX_TICK_SECONDS, max(0.0, now - self._last_tick))
        self._last_tick = now

        decision = self._add_time_and_link_reasons(self._decide(now), now)
        self.last_decision = decision
        self._poll_backend(now)
        self._retry_acks()
        self.ramp = ramp_sim.step(
            self.ramp, decision.permission, decision.reasons, dt, self._config.deploy_seconds
        )
        self._report_actuator()
        self._raise_timeout_help(decision, now)
        self._post_reports(decision)

    # ---- decision ---------------------------------------------------------------------------

    def _decide(self, now: float) -> Decision:
        try:
            reading = self._beam.poll()
        except Exception:  # noqa: BLE001 - an unreadable beam is unknown, and unknown halts
            log.exception("The beam could not be read")
            beam = BeamInput("UNKNOWN", None, self._simulated)
        else:
            self.last_beam = reading
            beam = beam_input(reading)
        try:
            camera = self._camera_input(now)
        except Exception:  # noqa: BLE001 - an unreadable camera is degraded, and degraded halts
            log.exception("The camera could not be read")
            camera = CameraInput(False, "camera_error", None, None, self._simulated)
        context = BusContext(
            movement=self.movement,
            has_accepted_request=bool(self._accepted),
            operator_halt=self._operator_halt or not self._halt_known,
        )
        return decide(camera, beam, context, self._gate_config)

    def _camera_input(self, now: float) -> CameraInput:
        latest = getattr(self._camera, "latest_perception", None)
        if latest is not None:
            # A worker thread runs the camera and detector; read its newest result and its age.
            newest = latest()
            if newest is None:
                result, age = PerceptionResult(None, False, "no_frame", self._iso()), float("inf")
            else:
                result, captured_at = newest
                age = max(0.0, now - captured_at)
        else:
            capture = self._camera.capture()
            result = analyse(
                capture.frame,
                self._detector,
                self._config.ramp_polygon,
                self._policy,
                clock=self._iso,
            )
            age = max(0.0, now - capture.captured_at)
        return camera_input(result, age, self._simulated)

    # ---- timeout and link loss (R1; both off unless configured) ------------------------------------

    def _note_ok(self, direction: str) -> None:
        self._failing_since[direction] = None

    def _note_failed(self, direction: str) -> None:
        if self._failing_since[direction] is None:
            self._failing_since[direction] = self._clock()

    def _deployment_timed_out(self, now: float) -> bool:
        limit = self._config.deployment_timeout_seconds
        return (
            limit is not None
            and self._deploy_started is not None
            and self.ramp.state not in (ramp_sim.DEPLOYED, ramp_sim.STOWED)
            and now - self._deploy_started > limit
        )

    def _link_lost(self, now: float) -> bool:
        limit = self._config.link_loss_halt_seconds
        if limit is None:
            return False
        # A non-blocking backend answers from a cache and queues sends, so its own worker knows
        # whether the link works (and whether the worker is alive at all).
        probe = getattr(self._backend, "link_problem_seconds", None)
        if probe is not None:
            return probe() > limit
        return any(
            since is not None and now - since > limit for since in self._failing_since.values()
        )

    def _add_time_and_link_reasons(self, decision: Decision, now: float) -> Decision:
        """These can only add a halt, never take one away."""
        extra = []
        if self._deployment_timed_out(now):
            extra.append(DEPLOYMENT_TIMEOUT)
        if self._link_lost(now):
            extra.append(BACKEND_LINK_LOST)
        if not extra:
            return decision
        reasons = tuple(r for r in REASON_ORDER if r in set(decision.reasons) | set(extra))
        return replace(decision, permission="HALT", reasons=reasons)

    def _raise_timeout_help(self, decision: Decision, now: float) -> None:
        if DEPLOYMENT_TIMEOUT not in decision.reasons or self._help_raised:
            return
        self._help_raised = True
        detail = f"Deployment not finished after {self._config.deployment_timeout_seconds:g} s"
        if self.ramp.halt_reasons:
            detail += f"; halted: {', '.join(self.ramp.halt_reasons)}"
        self._post_safely(
            "help-required",
            {"reason": "DEPLOYMENT_TIMEOUT", "state": self.ramp.state, "detail": detail, "observedAt": self._iso()},
        )
        if self._active_command is not None:
            self._send_actuator(self._commands[self._active_command], "FAILED", "Deployment timed out")
            self._active_command = None

    # ---- requests and commands --------------------------------------------------------------

    def _on_request(self, request: dict) -> None:
        request_id = request.get("requestId")
        if request.get("busId") != self.bus_id or not isinstance(request_id, str):
            return
        if request_id in self._accepted or request_id in self._unacked:
            return
        if len(self._unacked) >= MAX_UNACKED_REQUESTS:
            log.warning("Too many unacknowledged requests; ignoring %s", request_id)
            return
        self._unacked[request_id] = request
        self._retry_acks()

    def _retry_acks(self) -> None:
        for request_id, request in list(self._unacked.items()):
            try:
                self._backend.ack_request(request_id)
            except BackendError as error:
                log.warning("Could not acknowledge %s yet: %s", request_id, error)
                return
            self._accepted[request_id] = request
            del self._unacked[request_id]

    def _poll_backend(self, now: float) -> None:
        if now >= self._next_request_poll:
            self._next_request_poll = now + self._config.request_poll_seconds
            self._pull(self._backend.pending_requests, self._on_request)
            self._pull_halt()
        if now >= self._next_command_poll:
            self._next_command_poll = now + self._config.command_poll_seconds
            self._pull(self._backend.pending_actuator_commands, self._on_command)

    def _pull(self, fetch: Callable[[], list], handle: Callable[[dict], None]) -> None:
        try:
            items = fetch()
        except BackendError as error:
            log.warning("Backend poll failed: %s", error)
            self._note_failed("poll")
            return
        self._note_ok("poll")
        for item in items:
            if isinstance(item, dict):
                handle(item)
            else:
                log.warning("Ignoring a backend item that is not an object")

    def _pull_halt(self) -> None:
        """Adopt the backend's operator-halt state. A failed read changes nothing (never releases)."""
        try:
            halt = self._backend.pending_operator_halt()
        except BackendError as error:
            log.warning("Could not read the operator halt: %s", error)
            self._note_failed("poll")
            return
        self._note_ok("poll")
        if isinstance(halt, dict) and isinstance(halt.get("halted"), bool):
            self.set_operator_halt(halt["halted"])

    def _on_command(self, command: dict) -> None:
        command_id = command.get("commandId")
        if not isinstance(command_id, str) or command.get("busId") != self.bus_id:
            return
        if command_id in self._commands:
            return
        if len(self._commands) >= MAX_REMEMBERED_COMMANDS:
            self._commands.pop(next(iter(self._commands)))
        self._commands[command_id] = command
        kind = command.get("command")
        if kind == "DEPLOY_RAMP":
            self.ramp = ramp_sim.request_deployment(self.ramp)
            self._deploy_started = self._clock()
            self._help_raised = False
            self._active_command = command_id
            self._send_actuator(command, "ACCEPTED", "Deployment requested (simulated ramp)")
        elif kind == "RETRACT_RAMP":
            self.ramp = ramp_sim.stow(self.ramp)
            self._active_command = None
            self._send_actuator(command, "COMPLETED", "Ramp stowed (simulated ramp)")
        else:
            self._send_actuator(command, "FAILED", f"{kind} is not supported by this bus agent")

    def _report_actuator(self) -> None:
        if self._active_command is None:
            return
        command = self._commands[self._active_command]
        if self.ramp.state == ramp_sim.DEPLOYED:
            self._send_actuator(command, "COMPLETED", "Ramp deployed (simulated ramp)")
            self._active_command = None
        elif self.ramp.state == ramp_sim.HALTED:
            reasons = ", ".join(self.ramp.halt_reasons) or "halted"
            self._send_actuator(command, "IN_PROGRESS", f"Halted: {reasons}")
        elif self.ramp.state == ramp_sim.DEPLOYING:
            self._send_actuator(command, "IN_PROGRESS", "Deploying (simulated ramp)")

    def _send_actuator(self, command: dict, state: str, detail: str) -> None:
        body = {
            "caseId": command.get("caseId", ""),
            "busId": self.bus_id,
            "state": state,
            "detail": detail,
            "rampPosition": _RAMP_POSITION[self.ramp.state],
            "updatedAt": self._iso(),
        }
        key = f"actuator:{command['commandId']}"
        if not self._gate.due(key, body):
            return
        try:
            self._backend.report_actuator(command["commandId"], body)
        except BackendError as error:
            log.warning("Could not report actuator status: %s", error)
            self._note_failed("post")
            return
        self._gate.sent(key, body)

    # ---- bay --------------------------------------------------------------------------------

    def _on_bay(self, bay: dict) -> None:
        if (
            self.movement == WAITING
            and bay.get("stopCode") == self.stop_code
            and bay.get("grantedBusId") == self.bus_id
        ):
            self.movement = POSITIONED
            try:
                self._post_now("bus-status", self._bus_status_body())
            except BackendError as error:
                log.warning("Granted the bay but could not enter it yet: %s", error)
                self.movement = WAITING

    # ---- reports ----------------------------------------------------------------------------

    def _post_reports(self, decision: Decision) -> None:
        now_iso = self._iso()
        self._post_safely("bus-status", self._bus_status_body())
        self._post_safely("safety-decision", decision.to_report(now_iso))
        self._post_safely("ramp-simulation", self._ramp_body())
        self._post_safely("telemetry", self._telemetry_body(decision))

    def _bus_status_body(self) -> dict:
        body: dict = {
            "busService": self.bus_service,
            "movement": self.movement,
            "simulated": self._simulated,
            "observedAt": self._iso(),
        }
        if self.stop_code is not None:
            body["stopCode"] = self.stop_code
        return body

    def _ramp_body(self) -> dict:
        body: dict = {"state": self.ramp.state, "simulated": True, "observedAt": self._iso()}
        if self.ramp.halt_reasons:
            body["haltReasons"] = list(self.ramp.halt_reasons)
        return body

    def _telemetry_body(self, decision: Decision) -> dict:
        # Vehicle interlocks are simulated: a positioned bus counts as stopped, braked and
        # with its door open. The path is clear only when the gate says CONTINUE.
        positioned = self.movement == POSITIONED
        body: dict = {
            "vehicleStopped": positioned,
            "parkingBrakeActive": positioned,
            "doorOpen": positioned,
            "deploymentPathClear": decision.permission == "CONTINUE",
            "rampPosition": _RAMP_POSITION[self.ramp.state],
            "networkOnline": True,
            "observedAt": self._iso(),
        }
        if self.stop_code is not None:
            body["stopCode"] = self.stop_code
        return body

    def _post(self, kind: str, body: dict) -> None:
        self._backend.post(kind, body)
        self._gate.sent(kind, body)
        self._note_ok("post")
        self.link = {"ok": True, "error": None}

    def _post_now(self, kind: str, body: dict) -> None:
        """A post whose answer decides what the bus does next (entering the bay).

        With a non-blocking backend this waits only up to ``entry_timeout_seconds``; otherwise it
        is an ordinary post.
        """
        wait_for_answer = getattr(self._backend, "post_now", None)
        if wait_for_answer is None:
            self._post(kind, body)
            return
        wait_for_answer(kind, body, timeout=self._config.entry_timeout_seconds)
        self._gate.sent(kind, body)
        self.link = {"ok": True, "error": None}

    def _post_safely(self, kind: str, body: dict) -> None:
        """Post when due; a failure is logged and retried on a later tick, never raised."""
        if not self._gate.due(kind, body):
            return
        try:
            self._post(kind, body)
        except BackendError as error:
            log.warning("Could not post %s: %s", kind, error)
            self._note_failed("post")
            self.link = {"ok": False, "error": str(error)}
