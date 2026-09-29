"""The agent's local status page.

Shows the bus's movement, the simulated ramp, the Pi's current decision with reasons, the beam,
the camera's health and whether the backend link is working. In simulate mode it can also carry
a few scene controls (place an object, block the beam, cut the sensor, halt).

Guarded like the ToF demo: a random code printed at start-up must accompany every data request
and every control (header ``X-Status-Token``; the page reads it from the ``#code`` in the link).
It listens on this machine only unless told otherwise. It never carries image data.
"""

from __future__ import annotations

import hmac
import json
import queue
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

MAX_BODY_BYTES = 2048
MAX_DRAIN_BYTES = 1_048_576
PAGE = Path(__file__).with_name("status.html")

MOVEMENT_WORDS = {
    "TRAVELLING_TO_STOP": "Travelling to stop",
    "WAITING_FOR_BAY": "Waiting for bay",
    "POSITIONED_AT_STOP": "Positioned at stop",
    "DEPARTING": "Departing",
}
RAMP_WORDS = {
    "STOWED": "Stowed",
    "DEPLOYMENT_REQUESTED": "Deployment requested",
    "DEPLOYING": "Deploying",
    "DEPLOYED": "Deployed",
    "HALTED": "Halted",
}
REASON_WORDS = {
    "OBJECT_IN_ZONE": "Object in the ramp zone",
    "TOF_BLOCKED": "ToF beam blocked",
    "TOF_UNAVAILABLE": "ToF sensor unavailable",
    "TOF_NOT_CALIBRATED": "ToF not calibrated",
    "CAMERA_DEGRADED": "Camera degraded",
    "SENSORS_DISAGREE": "Camera and ToF disagree",
    "BUS_NOT_AT_BOARDING_POSITION": "Bus not at boarding position",
    "WAITING_FOR_BAY": "Waiting for the bay",
    "NO_ACCEPTED_REQUEST": "No accepted request",
    "OPERATOR_HALT": "Operator halt",
    "DEPLOYMENT_TIMEOUT": "Deployment timed out",
}


def snapshot(agent: object, beam_reading: object, controls: bool) -> dict:
    """A plain-data picture of the agent, safe to serve. Built on the agent's own thread."""
    decision = agent.last_decision  # type: ignore[attr-defined]
    decision_data = None
    if decision is not None:
        decision_data = {
            "zoneState": decision.zone_state,
            "permission": decision.permission,
            "reasons": [
                {"code": code, "text": REASON_WORDS.get(code, code.replace("_", " ").capitalize())}
                for code in decision.reasons
            ],
            "objectsInZone": [
                {"className": item.class_name, "safety": item.safety, "confidence": item.confidence}
                for item in decision.objects_in_zone
            ],
            "observedAt": None,
        }
    beam_data = None
    if beam_reading is not None:
        beam_data = {
            "state": beam_reading.state,
            "distanceMm": beam_reading.distance_mm,
            "simulated": beam_reading.simulated,
        }
    camera_data = None
    if decision is not None:
        camera_data = {
            "imageOk": decision.camera_image_ok,
            "degradedReason": decision.camera_degraded_reason,
        }
    ramp = agent.ramp  # type: ignore[attr-defined]
    return {
        "busId": agent.bus_id,  # type: ignore[attr-defined]
        "simulated": bool(agent._simulated),  # type: ignore[attr-defined]
        "movement": {
            "code": agent.movement,  # type: ignore[attr-defined]
            "text": MOVEMENT_WORDS.get(agent.movement, agent.movement),  # type: ignore[attr-defined]
        },
        "stopCode": agent.stop_code,  # type: ignore[attr-defined]
        "ramp": {
            "state": ramp.state,
            "text": RAMP_WORDS.get(ramp.state, ramp.state),
            "progress": round(ramp.progress, 2),
            "haltReasons": [
                {"code": code, "text": REASON_WORDS.get(code, code)} for code in ramp.halt_reasons
            ],
            "simulated": True,
        },
        "decision": decision_data,
        "beam": beam_data,
        "camera": camera_data,
        "acceptedRequests": len(agent._accepted),  # type: ignore[attr-defined]
        "operatorHalt": bool(agent._operator_halt),  # type: ignore[attr-defined]
        "link": dict(agent.link),  # type: ignore[attr-defined]
        "controls": bool(controls),
    }


class StatusBoard:
    """Holds the latest snapshot. The agent's thread publishes; the HTTP threads read."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: dict = {}

    def publish(self, data: dict) -> None:
        with self._lock:
            self._latest = data

    def read(self) -> dict:
        with self._lock:
            return dict(self._latest)


_STOP = re.compile(r"^[A-Za-z0-9-]{1,40}$")
_CLASS = re.compile(r"^[a-z_]{1,40}$")
_SWITCHES = ("cover", "block", "dropout", "frames", "halt")
_DEFAULT_CONFIDENCE = "0.9"


def parse_control(body: object) -> str:
    """Turns a control request into a console command line, or raises ValueError."""
    if not isinstance(body, dict):
        raise ValueError("body must be an object")
    command = body.get("command")
    value = body.get("value")
    if not isinstance(command, str):
        raise ValueError("command is required")
    if command in ("depart", "clear"):
        return command
    if command in ("arrive", "travel"):
        if not isinstance(value, str) or not _STOP.match(value):
            raise ValueError("a stop code is required")
        return f"{command} {value}"
    if command == "place":
        if not isinstance(value, str) or not _CLASS.match(value):
            raise ValueError("an object class is required")
        return f"place {value} {_DEFAULT_CONFIDENCE}"
    if command in _SWITCHES:
        if value not in ("on", "off"):
            raise ValueError("value must be on or off")
        return f"{command} {value}"
    raise ValueError("unknown command")


class StatusServer:
    def __init__(
        self,
        board: StatusBoard,
        commands: "queue.Queue[str]",
        token: str,
        host: str = "127.0.0.1",
        port: int = 8770,
        controls: bool = False,
    ) -> None:
        self.host = host
        self._board = board
        self._commands = commands
        self._token = token
        self._controls = controls
        self._httpd = ThreadingHTTPServer((host, port), self._handler())
        self.port = self._httpd.server_address[1]
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._httpd.serve_forever, name="status-page", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()

    def _handler(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:  # the code must never reach a log
                pass

            def reply(self, status: int, data: object, content_type: str = "application/json") -> None:
                body = data if isinstance(data, bytes) else json.dumps(data).encode()
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header(
                    "Content-Security-Policy",
                    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
                )
                self.end_headers()
                self.wfile.write(body)

            def authorised(self) -> bool:
                supplied = self.headers.get("X-Status-Token", "")
                return hmac.compare_digest(supplied.encode(), server._token.encode())

            def do_GET(self) -> None:
                if self.path == "/":
                    self.reply(200, PAGE.read_bytes(), "text/html; charset=utf-8")
                elif self.path == "/api/state":
                    if self.authorised():
                        self.reply(200, server._board.read())
                    else:
                        self.reply(403, {"error": "Open the complete link printed at start-up, including the # and its code."})
                else:
                    self.reply(404, {"error": "Not found"})

            def do_POST(self) -> None:
                if self.path != "/api/control":
                    self.reply(404, {"error": "Not found"})
                    return
                if not self.authorised() or not server._controls:
                    self.reply(403, {"error": "Controls need the start-up code and simulate mode."})
                    return
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    length = -1
                if not 0 <= length <= MAX_BODY_BYTES:
                    # Read (and discard) a bounded amount so the client can receive the refusal
                    # instead of a reset connection; anything larger is simply cut off.
                    if length > 0:
                        self.rfile.read(min(length, MAX_DRAIN_BYTES))
                    self.reply(413, {"error": "Request too large"})
                    return
                try:
                    line = parse_control(json.loads(self.rfile.read(length) or b"null"))
                except ValueError as error:
                    self.reply(400, {"error": str(error)})
                    return
                server._commands.put(line)
                self.reply(202, {"queued": line})

        return Handler
