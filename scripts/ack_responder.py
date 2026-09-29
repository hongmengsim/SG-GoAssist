#!/usr/bin/env python3
"""A bus that only acknowledges requests, for checking the passenger app without the backend's
own timer acknowledgement (GOASSIST_AUTO_ACK=off).

    python scripts/ack_responder.py --bus-id AV-095-01 --backend http://localhost:3000

It listens for requests addressed to its bus (WebSocket push, with a slow pull as a fallback) and
acknowledges each one through the bus-only endpoint. It sends no status, telemetry or decisions,
so a test that plays the bus's other signals itself is not disturbed. Runs until interrupted.
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import signal
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pi" / "bus-agent"))

from bus_agent.backend import BackendError  # noqa: E402
from bus_agent.event_listener import EventListener  # noqa: E402
from bus_agent.http_backend import HttpBackend  # noqa: E402

log = logging.getLogger("ack_responder")
PULL_SECONDS = 2.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bus-id", required=True)
    parser.add_argument("--backend", default="http://localhost:3000")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    backend = HttpBackend(
        args.backend, args.bus_id, secret=os.environ.get("DEVICE_SHARED_SECRET") or None
    )
    events: "queue.Queue[dict]" = queue.Queue()
    listener = EventListener(
        args.backend.replace("http://", "ws://").replace("https://", "wss://"),
        args.bus_id,
        events.put,
        token=os.environ.get("OPERATOR_API_TOKEN") or None,
        secret=os.environ.get("DEVICE_SHARED_SECRET") or None,
    )
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    acknowledged: set[str] = set()

    def acknowledge(request: dict) -> None:
        request_id = request.get("requestId")
        if request.get("busId") != args.bus_id or not isinstance(request_id, str):
            return
        if request_id in acknowledged:
            return
        try:
            backend.ack_request(request_id)
        except BackendError as error:
            log.warning("Could not acknowledge %s yet: %s", request_id, error)
            return
        acknowledged.add(request_id)
        log.info("Acknowledged %s", request_id)

    listener.start()
    log.info("%s is acknowledging requests (no other signals are sent)", args.bus_id)
    try:
        while not stop.is_set():
            try:
                message = events.get(timeout=PULL_SECONDS)
            except queue.Empty:
                message = None
            if message and message.get("type") == "ASSIST_REQUESTED":
                acknowledge(message.get("request") or {})
            try:
                for request in backend.pending_requests():
                    acknowledge(request)
            except BackendError as error:
                log.warning("Pull failed: %s", error)
    finally:
        listener.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
