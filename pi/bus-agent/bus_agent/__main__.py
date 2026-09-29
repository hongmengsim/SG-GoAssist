"""Run one simulated bus against a backend.

    python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000

Type commands on standard input (help for the list). The shared secret and operator token
come from DEVICE_SHARED_SECRET and OPERATOR_API_TOKEN so they never appear on a command line.
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import secrets
import sys
import threading

from .async_backend import AsyncBackend
from .console import HELP
from .event_listener import EventListener
from .http_backend import HttpBackend
from .runner import Runner, build_simulated_rig
from .status_page import StatusBoard, StatusServer

log = logging.getLogger("bus_agent")


def _read_commands(commands: "queue.Queue[str]", stop: threading.Event) -> None:
    for line in sys.stdin:
        text = line.strip()
        if text in ("quit", "exit"):
            stop.set()
            return
        if text:
            commands.put(text)
    stop.set()


def main(argv: "list[str] | None" = None) -> int:
    parser = argparse.ArgumentParser(description="Bus agent (simulated sensors only for now)")
    parser.add_argument("--simulate", action="store_true", help="use simulated camera and ToF")
    parser.add_argument("--bus-id", required=True)
    parser.add_argument("--bus-service", default="95")
    parser.add_argument("--backend", default="http://localhost:3000")
    parser.add_argument("--no-events", action="store_true", help="poll only; no WebSocket push")
    parser.add_argument("--status-port", type=int, default=0, help="serve the local status page on this port (0 = off)")
    parser.add_argument("--status-listen", default="127.0.0.1", help="address for the status page; 0.0.0.0 exposes it on the LAN")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not args.simulate:
        parser.error("real sensors are not wired in yet; run with --simulate")

    secret = os.environ.get("DEVICE_SHARED_SECRET") or None
    token = os.environ.get("OPERATOR_API_TOKEN") or None
    # Every network call runs on a worker thread so a stuck connection cannot delay the safety loop.
    backend = AsyncBackend(HttpBackend(args.backend, args.bus_id, secret=secret))
    rig = build_simulated_rig(args.bus_id, args.bus_service, backend)
    events: "queue.Queue[dict]" = queue.Queue()
    commands: "queue.Queue[str]" = queue.Queue()
    board = StatusBoard()
    runner = Runner(rig, events, commands, board=board, controls=True)
    status_server = None
    if args.status_port:
        code = secrets.token_hex(16)
        status_server = StatusServer(board, commands, code, args.status_listen, args.status_port, controls=True)
        status_server.start()
        # The code is printed once and never logged elsewhere; keep the #code in the link.
        print(f"Status page: http://localhost:{status_server.port}/#{code}", flush=True)

    listener = None
    if not args.no_events:
        ws_url = args.backend.replace("https://", "wss://").replace("http://", "ws://")
        listener = EventListener(ws_url, args.bus_id, events.put, token=token)
        listener.start()

    stop = threading.Event()
    threading.Thread(target=_read_commands, args=(commands, stop), daemon=True).start()
    log.info("%s running with SIMULATED sensors. %s", args.bus_id, HELP)
    try:
        runner.start_up(backend)
        runner.run(stop)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        if listener is not None:
            listener.stop()
        if status_server is not None:
            status_server.stop()
        backend.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
