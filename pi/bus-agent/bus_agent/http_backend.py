"""The real backend over HTTP, using only the standard library.

Requests to the device endpoints are signed with the shared secret (see signing.py). A GET
has no body, and the backend then signs an empty JSON object, so that is what is signed here.
"""

from __future__ import annotations

import http.client
import json
import time
import urllib.error
import urllib.request
from typing import Callable, Optional
from urllib.parse import quote, urlencode

from .backend import KINDS, BackendError, BackendRefused, BackendRejected
from .signing import response_is_genuine, signed_headers

Transport = Callable[[str, str, dict, Optional[bytes], float], tuple]

_PATHS = {
    "bus-status": "status",
    "ramp-simulation": "ramp-simulation",
    "safety-decision": "safety-decision",
    "help-required": "help-required",
    "telemetry": "telemetry",
}
_EMPTY_OBJECT = b"{}"
_REJECTED_FOR_GOOD = frozenset({400, 404, 422})


def urllib_transport(
    method: str, url: str, headers: dict, body: Optional[bytes], timeout: float
) -> tuple:
    """Returns (status, body bytes, response headers with lower-case names). HTTP error statuses are
    returned, not raised."""
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return response.status, response.read(), {k.lower(): v for k, v in response.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, error.read(), {k.lower(): v for k, v in error.headers.items()}


class HttpBackend:
    def __init__(
        self,
        base_url: str,
        bus_id: str,
        secret: Optional[str] = None,
        timeout: float = 5.0,
        transport: Transport = urllib_transport,
        now_ms: Optional[Callable[[], int]] = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._bus_id = bus_id
        self._secret = secret
        self._timeout = timeout
        self._transport = transport
        self._now_ms = now_ms or (lambda: int(time.time() * 1000))

    # ---- Backend protocol ---------------------------------------------------------------

    def post(self, kind: str, body: dict) -> str:
        if kind not in KINDS:
            raise ValueError(f"unknown report kind {kind}")
        result = self._call("POST", self._vehicle_path(_PATHS[kind]), body)
        return str(result.get("outcome", "CHANGED")) if isinstance(result, dict) else "CHANGED"

    def ack_request(self, request_id: str) -> None:
        self._call("POST", self._vehicle_path("assist-ack"), {"requestId": request_id})

    def pending_requests(self) -> list:
        return self._list(self._call("GET", self._vehicle_path("requests")), "requests")

    def pending_accepted_requests(self) -> Optional[list]:
        """Requests this bus already confirmed whose case is still open."""
        result = self._call("GET", self._vehicle_path("requests") + "?status=ACKNOWLEDGED")
        return self._list(result, "requests")

    def pending_actuator_commands(self) -> list:
        query = urlencode({"busId": self._bus_id})
        result = self._call("GET", f"/api/operations/actuators/pending?{query}")
        return self._list(result, "commands")

    def pending_operator_halt(self) -> Optional[dict]:
        result = self._call("GET", self._vehicle_path("operator-halt"))
        if not isinstance(result, dict) or not isinstance(result.get("halted"), bool):
            raise BackendError("unexpected response: no halted flag")
        return result

    def report_actuator(self, command_id: str, body: dict) -> None:
        self._call("POST", f"/api/operations/actuators/{quote(command_id, safe='')}/status", body)

    # ---- not part of the protocol: done once at start-up ---------------------------------

    def register_capability(self, capability: dict) -> None:
        self._call("PUT", self._vehicle_path("capabilities"), capability)

    # ---- internals ------------------------------------------------------------------------

    def _vehicle_path(self, suffix: str) -> str:
        return f"/api/operations/vehicles/{quote(self._bus_id, safe='')}/{suffix}"

    @staticmethod
    def _list(result: object, key: str) -> list:
        items = result.get(key) if isinstance(result, dict) else None
        if not isinstance(items, list):
            raise BackendError(f"unexpected response: no list named {key}")
        return items

    def _call(self, method: str, path: str, body: Optional[dict] = None) -> object:
        payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers = {"Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        headers.update(
            signed_headers(
                self._secret,
                self._bus_id,
                payload if payload is not None else _EMPTY_OBJECT,
                now_ms=self._now_ms(),
                method=method,
                path=path,
            )
        )
        try:
            reply = self._transport(method, self._base + path, headers, payload, self._timeout)
        except (OSError, TimeoutError, http.client.HTTPException) as error:
            raise BackendError(f"{method} {path} failed: {error}") from error
        status, raw = reply[0], reply[1]
        reply_headers = reply[2] if len(reply) > 2 else {}
        self._check_answer(method, path, headers, status, raw, reply_headers)
        return self._interpret(method, path, status, raw)

    def _check_answer(self, method: str, path: str, sent: dict, status: int, raw: bytes, received: dict) -> None:
        """With a secret, only an answer the backend signed for this very request is believed.

        Otherwise anyone on the network could send a forged "not halted" and release an operator
        halt. Errors other than a bay refusal (409) are never acted on as good news, so they need
        no signature."""
        if not self._secret or not (status < 400 or status == 409):
            return
        if not response_is_genuine(
            self._secret, sent.get("x-signature", ""), status, raw, received.get("x-response-signature")
        ):
            raise BackendError(f"{method} {path}: the answer is not signed by the backend")

    @staticmethod
    def _interpret(method: str, path: str, status: int, raw: bytes) -> object:
        try:
            decoded = json.loads(raw) if raw else {}
        except ValueError as error:
            raise BackendError(f"{method} {path}: response is not JSON") from error
        if 200 <= status < 300:
            return decoded
        message = decoded.get("error") if isinstance(decoded, dict) else None
        text = f"{method} {path} returned {status}: {message or 'no detail'}"
        if status == 409:
            raise BackendRefused(message or text)
        if status in _REJECTED_FOR_GOOD:
            # The report itself is wrong or no longer applies; sending it again cannot help.
            raise BackendRejected(message or text)
        raise BackendError(text)
