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
from pathlib import Path

from .config import ConfigError, choose_backend_url, load_config
from .console import HELP
from .event_listener import EventListener
from .http_backend import HttpBackend
from .recording import ReplayError
from .real_security import real_mode_findings, timeout_warnings
from .real_mode import PreflightFailed, build_real_sensors, default_factories
from .runner import Runner, build_real_rig, build_replay_rig, build_simulated_rig
from .status_page import StatusBoard, StatusServer

log = logging.getLogger("bus_agent")

DEFAULT_BACKEND_URL = "http://localhost:3000"


def _read_commands(commands: "queue.Queue[str]", stop: threading.Event) -> None:
    for line in sys.stdin:
        text = line.strip()
        if text in ("quit", "exit"):
            stop.set()
            return
        if text:
            commands.put(text)
    # End of input is not a request to stop: under a service manager there is no terminal, and
    # the agent must keep running. Only an explicit "quit" (or Ctrl+C) stops it.
    log.info("Console input closed; the agent keeps running")


def main(argv: "list[str] | None" = None) -> int:
    parser = argparse.ArgumentParser(description="Bus agent: simulated sensors, or real sensors from a config file")
    parser.add_argument("--simulate", action="store_true", help="use simulated camera and ToF")
    parser.add_argument("--real", action="store_true", help="use the real ToF, camera and model named in --config")
    parser.add_argument("--config", help="agent configuration file (required with --real)")
    parser.add_argument("--record", help="with --real: write the ESP32 lines and perception results to this directory (never frames)")
    parser.add_argument("--replay", help="feed the agent from a recording directory instead of live sensors (reports say not live)")
    parser.add_argument("--bus-id")
    parser.add_argument("--bus-service", default="95")
    parser.add_argument("--backend", help="backend address; with --real it wins over backendUrl in the config file, so the address can follow the network")
    parser.add_argument("--no-events", action="store_true", help="poll only; no WebSocket push")
    parser.add_argument("--status-port", type=int, default=0, help="serve the local status page on this port (0 = off)")
    parser.add_argument("--status-listen", default="127.0.0.1", help="address for the status page; 0.0.0.0 exposes it on the LAN")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if sum(bool(mode) for mode in (args.simulate, args.real, args.replay)) != 1:
        parser.error("choose exactly one of --simulate, --real or --replay DIR")
    if args.record and not args.real:
        parser.error("--record is only for --real")
    settings = None
    sensors = None
    if args.real:
        if not args.config:
            parser.error("--real needs --config")
        try:
            settings = load_config(Path(args.config))
            args.backend = choose_backend_url(args.backend, settings.backend_url)
            sensors = build_real_sensors(settings, default_factories())
        except ConfigError as error:
            print(f"Configuration error: {error}", file=sys.stderr)
            return 2
        except PreflightFailed as failure:
            # Fail-safe: a bus with a missing sensor must not start half real.
            print("Refusing to start with real sensors:", file=sys.stderr)
            for problem in failure.problems:
                print(f"  - {problem}", file=sys.stderr)
            return 2
        args.bus_id, args.bus_service = settings.bus_id, settings.bus_service
    else:
        if not args.bus_id:
            parser.error("--simulate and --replay need --bus-id")
        try:
            args.backend = choose_backend_url(args.backend, DEFAULT_BACKEND_URL)
        except ConfigError as error:
            parser.error(str(error))
    log.info("Backend address for this run: %s", args.backend)

    secret = os.environ.get("DEVICE_SHARED_SECRET") or None
    if args.real:
        errors, warnings = real_mode_findings(args.backend, secret)
        for warning in [*warnings, *timeout_warnings(settings)]:
            log.warning("%s", warning)
        if errors:
            print("Refusing to start with real sensors:", file=sys.stderr)
            for problem in errors:
                print(f"  - {problem}", file=sys.stderr)
            return 2
    token = os.environ.get("OPERATOR_API_TOKEN") or None
    # Every network call runs on a worker thread so a stuck connection cannot delay the safety loop.
    backend = AsyncBackend(HttpBackend(args.backend, args.bus_id, secret=secret))
    try:
        if args.real:
            rig = build_real_rig(settings, sensors, backend, record_dir=args.record)
        elif args.replay:
            rig = build_replay_rig(args.bus_id, args.bus_service, backend, Path(args.replay))
        else:
            rig = build_simulated_rig(args.bus_id, args.bus_service, backend)
    except ReplayError as error:
        print(f"Recording error: {error}", file=sys.stderr)
        backend.stop()
        return 2
    events: "queue.Queue[dict]" = queue.Queue()
    commands: "queue.Queue[str]" = queue.Queue()
    board = StatusBoard()
    runner = Runner(rig, events, commands, board=board, controls=args.simulate, auto_calibrate=not args.real)
    status_server = None
    if args.status_port:
        code = secrets.token_hex(16)
        status_server = StatusServer(board, commands, code, args.status_listen, args.status_port, controls=args.simulate)
        status_server.start()
        # The code is printed once and never logged elsewhere; keep the #code in the link.
        print(f"Status page: http://localhost:{status_server.port}/#{code}", flush=True)

    listener = None
    if not args.no_events:
        ws_url = args.backend.replace("https://", "wss://").replace("http://", "ws://")
        listener = EventListener(ws_url, args.bus_id, events.put, token=token, secret=secret)
        listener.start()

    stop = threading.Event()
    threading.Thread(target=_read_commands, args=(commands, stop), daemon=True).start()
    log.info("%s running with %s sensors. %s", args.bus_id, "REAL" if args.real else "REPLAYED" if args.replay else "SIMULATED", HELP)
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
        if args.real:
            rig.worker.stop()
            for recorder in rig.recorders:
                recorder.close()
        backend.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
