"""Listens for messages the backend pushes to this bus (WebSocket), on a background thread.

It subscribes with the operator-style scoped subscription for this bus id, so it receives
only this bus's requests and bay changes. Messages are handed to ``sink`` on the listener's
thread; the agent runner puts them on a queue and applies them on the main loop.

With a device secret (DEVICE_SHARED_SECRET) it subscribes as the device: a signed
SUBSCRIBE_DEVICE for its own bus, so no operator token is needed on the Pi. Without a secret
(development) it falls back to the operator-style subscription scoped to its bus.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Callable, Optional

from websockets.exceptions import WebSocketException
from .signing import sign_body
from websockets.sync.client import connect

log = logging.getLogger(__name__)

FORWARDED_TYPES = frozenset({"ASSIST_REQUESTED", "BAY_STATUS"})


class EventListener:
    def __init__(
        self,
        url: str,
        bus_id: str,
        sink: Callable[[dict], None],
        token: Optional[str] = None,
        reconnect_seconds: float = 2.0,
        secret: Optional[str] = None,
    ) -> None:
        self._secret = secret
        self._url = url
        self._bus_id = bus_id
        self._sink = sink
        self._token = token
        self._reconnect_seconds = reconnect_seconds
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.last_error: Optional[str] = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="bus-events", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _subscription(self) -> str:
        if self._secret:
            # Prove which bus this is with the device secret; no operator token is needed.
            timestamp = str(int(time.time() * 1000))
            return json.dumps(
                {
                    "type": "SUBSCRIBE_DEVICE",
                    "busId": self._bus_id,
                    "deviceId": self._bus_id,
                    "timestamp": timestamp,
                    "signature": sign_body(self._secret, self._bus_id, timestamp, b"SUBSCRIBE_DEVICE"),
                }
            )
        message: dict = {"type": "SUBSCRIBE_OPERATIONS", "buses": [self._bus_id]}
        if self._token:
            message["token"] = self._token
        return json.dumps(message)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._listen_once()
            except (OSError, WebSocketException) as error:
                self.last_error = f"connection lost: {error}"
                log.warning("Event connection lost (%s); reconnecting", error)
            self._stop.wait(self._reconnect_seconds)

    def _listen_once(self) -> None:
        with connect(self._url, open_timeout=5) as connection:
            connection.send(self._subscription())
            while not self._stop.is_set():
                try:
                    raw = connection.recv(timeout=0.5)
                except TimeoutError:
                    continue
                self._handle(raw)

    def _handle(self, raw: object) -> None:
        try:
            message = json.loads(raw)
        except (TypeError, ValueError):
            log.warning("Ignored a message that is not JSON")
            return
        kind = message.get("type") if isinstance(message, dict) else None
        if kind in FORWARDED_TYPES:
            self._sink(message)
        elif kind in ("AUTH_REQUIRED", "INVALID_OPERATIONS_SCOPE", "INVALID_DEVICE_SUBSCRIPTION"):
            self.last_error = f"subscription refused: {kind}"
            log.error("Backend refused the event subscription: %s", kind)
