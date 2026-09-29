"""What the agent needs from the backend, and a fake for tests and simulation."""

from __future__ import annotations

from typing import Optional, Protocol

# Endpoint suffixes under /api/operations/vehicles/:busId/ for each kind of report.
KINDS = ("bus-status", "ramp-simulation", "safety-decision", "help-required", "telemetry")


class BackendError(Exception):
    """The backend could not be reached or failed; the agent retries on a later tick."""


class BackendRefused(BackendError):
    """The backend understood the report and refused it (HTTP 409), for example a bay entry."""


class Backend(Protocol):
    def post(self, kind: str, body: dict) -> str:
        """Send one report; returns the backend's outcome (CHANGED, HEARTBEAT or STALE)."""
        ...

    def ack_request(self, request_id: str) -> None: ...

    def pending_requests(self) -> list: ...

    def pending_actuator_commands(self) -> list: ...

    def pending_operator_halt(self) -> Optional[dict]:
        """The operator halt on this bus, or None if it could not be read."""
        ...

    def report_actuator(self, command_id: str, body: dict) -> None: ...


class FakeBackend:
    """Records everything the agent sends and returns what a test scripts."""

    def __init__(self) -> None:
        self.posts: list[tuple[str, dict]] = []
        self.acks: list[str] = []
        self.actuator_reports: list[tuple[str, dict]] = []
        self.requests: list[dict] = []
        self.commands: list[dict] = []
        self.operator_halt: Optional[dict] = None
        self.fail_all = False
        self.refuse_positioned = False

    def _check(self) -> None:
        if self.fail_all:
            raise BackendError("backend unreachable")

    def post(self, kind: str, body: dict) -> str:
        self._check()
        if kind not in KINDS:
            raise ValueError(f"unknown report kind {kind}")
        if kind == "bus-status" and self.refuse_positioned and body.get("movement") == "POSITIONED_AT_STOP":
            raise BackendRefused("Bay is occupied")
        self.posts.append((kind, body))
        return "CHANGED"

    def ack_request(self, request_id: str) -> None:
        self._check()
        self.acks.append(request_id)

    def pending_requests(self) -> list:
        self._check()
        return list(self.requests)

    def pending_actuator_commands(self) -> list:
        self._check()
        return list(self.commands)

    def pending_operator_halt(self) -> Optional[dict]:
        self._check()
        return self.operator_halt

    def report_actuator(self, command_id: str, body: dict) -> None:
        self._check()
        self.actuator_reports.append((command_id, body))

    def posted(self, kind: str) -> list[dict]:
        return [body for posted_kind, body in self.posts if posted_kind == kind]
