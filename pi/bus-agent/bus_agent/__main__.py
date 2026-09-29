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
import sys
import threading

from .console import HELP
from .event_listener import EventListener
from .http_backend import HttpBackend
from .runner import Runner, build_simulated_rig

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
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not args.simulate:
        parser.error("real sensors are not wired in yet; run with --simulate")

    secret = os.environ.get("DEVICE_SHARED_SECRET") or None
    token = os.environ.get("OPERATOR_API_TOKEN") or None
    backend = HttpBackend(args.backend, args.bus_id, secret=secret)
    rig = build_simulated_rig(args.bus_id, args.bus_service, backend)
    events: "queue.Queue[dict]" = queue.Queue()
    commands: "queue.Queue[str]" = queue.Queue()
    runner = Runner(rig, events, commands)

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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
