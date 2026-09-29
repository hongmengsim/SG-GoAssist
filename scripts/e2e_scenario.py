#!/usr/bin/env python3
"""End-to-end scenario: real backend, two simulated bus agents, one passenger, one operator.

    npm run e2e:scenario            (builds nothing: run `npm run build` first)

It starts the backend on a free port with a device secret and bus-only acknowledgement
(GOASSIST_AUTO_ACK=off), runs Bus 1 (AV-095-01) and Bus 2 (AV-095-02) as simulated agents,
and walks the agreed sequence, asserting each step through the backend's own endpoints:

  1. Both buses register. Bus 1 takes the bay; Bus 2 waits in the queue.
  2. A request for a bus that does not exist is never acknowledged by the backend itself.
  3. An unsafe object in the ramp zone keeps Bus 1's ramp stowed; once removed the bus, not
     the backend, acknowledges and the ramp deploys.
  4. An unsafe object appearing mid-deployment halts the ramp; removing it lets it finish.
  5. A ToF sensor dropout halts; recovery clears it.
  6. Completing the case while a person is on the ramp is refused; after they leave the ramp
     retracts and the case completes.
  7. Bus 1 departs. Bus 2, waiting, did not deploy. The controller grants the bay; only then
     does Bus 2 enter and deploy.
  8. The audit trail records the sequence in order.

Everything is simulated: no camera, ESP32, Pi or physical ramp is involved. Output is plain
text (PASS or FAIL per step), never colour. Exit code 0 only if every step held.
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pi" / "bus-agent"))

from bus_agent.async_backend import AsyncBackend  # noqa: E402
from bus_agent.event_listener import EventListener  # noqa: E402
from bus_agent.http_backend import HttpBackend  # noqa: E402
from bus_agent.runner import Runner, build_simulated_rig  # noqa: E402

STOP = "18331"
BUS_1 = "AV-095-01"
BUS_2 = "AV-095-02"
NO_AGENT_BUS = "AV-191-03"  # exists in the backend's bus list, but no agent is running for it
SECRET = "e2e-device-secret"


class ScenarioFailure(AssertionError):
    pass


def say(text: str) -> None:
    print(text, flush=True)


def passed(step: str) -> None:
    say(f"PASS  {step}")


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Api:
    """Passenger and operator calls (no device signature needed)."""

    def __init__(self, base: str) -> None:
        self.base = base

    def call(self, method: str, path: str, body: object = None) -> tuple:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(
            self.base + path, data=data, method=method, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def get(self, path: str) -> dict:
        status, body = self.call("GET", path)
        if status != 200:
            raise ScenarioFailure(f"GET {path} returned {status}: {body}")
        return body

    def get_or_none(self, path: str) -> "dict | None":
        status, body = self.call("GET", path)
        return body if status == 200 else None


def wait_until(condition, seconds: float, message: str):
    end = time.monotonic() + seconds
    last = None
    while time.monotonic() < end:
        try:
            last = condition()
        except (ScenarioFailure, KeyError, TypeError):
            last = None
        if last:
            return last
        time.sleep(0.1)
    raise ScenarioFailure(f"timed out after {seconds:.0f}s waiting for: {message}")


def hold(condition, seconds: float, message: str) -> None:
    """The condition must stay true for the whole period."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if not condition():
            raise ScenarioFailure(f"did not hold: {message}")
        time.sleep(0.1)


class Backend:
    def __init__(self) -> None:
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.data = tempfile.mkdtemp(prefix="goassist-e2e-")
        self.log_path = Path(self.data) / "backend.log"
        self.process: "subprocess.Popen | None" = None

    def start(self) -> None:
        entry = ROOT / "backend" / "dist" / "server.js"
        if not entry.exists():
            raise SystemExit("backend/dist/server.js is missing: run `npm run build` first")
        env = dict(
            os.environ,
            PORT=str(self.port),
            GOASSIST_AUTO_ACK="off",
            DEVICE_SHARED_SECRET=SECRET,
            GOASSIST_DATA_DIR=self.data,
        )
        env.pop("OPERATOR_API_TOKEN", None)
        log = open(self.log_path, "wb")  # noqa: SIM115 - closed with the process
        self.process = subprocess.Popen(
            ["node", str(entry)], cwd=str(ROOT / "backend"), env=env, stdout=log, stderr=subprocess.STDOUT
        )
        wait_until(lambda: Api(self.base).get_or_none("/health"), 20, "the backend to answer /health")

    def stop(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
        shutil.rmtree(self.data, ignore_errors=True)


class Bus:
    """One simulated bus agent running on its own thread, driven by console commands."""

    def __init__(self, bus_id: str, base: str) -> None:
        self.bus_id = bus_id
        # A signed client of its own for the scenario's checks, and the non-blocking one the agent uses.
        self.backend = HttpBackend(base, bus_id, secret=SECRET)
        self.agent_backend = AsyncBackend(HttpBackend(base, bus_id, secret=SECRET))
        self.rig = build_simulated_rig(bus_id, "95", self.agent_backend)
        self.events: "queue.Queue[dict]" = queue.Queue()
        self.commands: "queue.Queue[str]" = queue.Queue()
        self.runner = Runner(self.rig, self.events, self.commands)
        self.listener = EventListener(base.replace("http://", "ws://"), bus_id, self.events.put)
        self.stop_flag = threading.Event()
        self.thread = threading.Thread(target=self._run, name=bus_id, daemon=True)

    def _run(self) -> None:
        self.runner.start_up(self.agent_backend)
        self.runner.run(self.stop_flag)

    def start(self) -> None:
        self.listener.start()
        self.thread.start()

    def stop(self) -> None:
        self.stop_flag.set()
        self.listener.stop()
        self.thread.join(timeout=10)
        self.agent_backend.stop()

    def do(self, line: str) -> None:
        self.commands.put(line)

    @property
    def ramp(self) -> str:
        return self.rig.agent.ramp.state


class Scenario:
    def __init__(self, api: Api, bus1: Bus, bus2: Bus) -> None:
        self.api = api
        self.bus1 = bus1
        self.bus2 = bus2
        self.caseless: list = []

    # ---- reading the backend -----------------------------------------------------------

    def bus_status(self, bus: str) -> "dict | None":
        return self.api.get_or_none(f"/api/operations/vehicles/{bus}/status")

    def bay(self) -> dict:
        return self.api.get(f"/api/operations/bays/{STOP}")

    def ramp(self, bus: str) -> "dict | None":
        return self.api.get_or_none(f"/api/operations/vehicles/{bus}/ramp-simulation")

    def decision(self, bus: str) -> "dict | None":
        return self.api.get_or_none(f"/api/operations/vehicles/{bus}/safety-decision")

    def request_status(self, request_id: str) -> str:
        return self.api.get(f"/api/assistance/{request_id}")["status"]

    def pending_commands(self, bus: str, kind: str) -> list:
        # The pending list is a device endpoint, so ask it the way the bus does: signed.
        backend = (self.bus1 if bus == BUS_1 else self.bus2).backend
        return [c for c in backend.pending_actuator_commands() if c["command"] == kind]

    def case_of(self, request_id: str) -> dict:
        case_id = self.api.get(f"/api/assistance/{request_id}")["caseId"]
        return self.api.get(f"/api/operations/cases/{case_id}")

    def new_request(self, bus: str, service: str = "95") -> str:
        status, body = self.api.call(
            "POST",
            "/api/assistance/request",
            {
                "sessionId": f"e2e-{bus}",
                "busService": service,
                "busId": bus,
                "boardingStop": "18301",
                "stopCode": STOP,
                "assistanceTypes": ["WHEELCHAIR_RAMP"],
                "source": "MOBILE_APP",
                "boardingOrAlighting": "BOARDING",
            },
        )
        if status not in (200, 201):
            raise ScenarioFailure(f"creating a request for {bus} returned {status}: {body}")
        return body["requestId"]

    # ---- the steps ---------------------------------------------------------------------

    def step_1_register_and_queue(self) -> None:
        capabilities = wait_until(
            lambda: (lambda c: c if {BUS_1, BUS_2} <= {x["busId"] for x in c} else None)(
                self.api.get("/api/operations/vehicles/capabilities")["capabilities"]
            ),
            20,
            "both buses to register their capabilities",
        )
        assert all(c["ramp"] for c in capabilities if c["busId"] in (BUS_1, BUS_2))
        passed("both buses registered as ramp-capable")

        self.bus1.do(f"arrive {STOP}")
        wait_until(lambda: self.bay()["occupantBusId"] == BUS_1, 10, "Bus 1 to occupy the bay")
        self.bus2.do(f"arrive {STOP}")
        wait_until(
            lambda: (self.bus_status(BUS_2) or {}).get("movement") == "WAITING_FOR_BAY",
            10,
            "Bus 2 to report WAITING_FOR_BAY (its entry was refused)",
        )
        wait_until(lambda: self.bay()["waitingBusIds"] == [BUS_2], 5, "Bus 2 to be queued")
        passed("Bus 1 occupies the bay; Bus 2 is refused entry and waits in the queue")

    def step_2_nothing_confirms_without_a_bus(self) -> None:
        request_id = self.new_request(NO_AGENT_BUS, "191")
        hold(
            lambda: self.request_status(request_id) == "SENDING",
            3,
            "a request for a bus that is not running stays SENDING",
        )
        self.api.call("POST", f"/api/assistance/{request_id}/cancel", {})
        passed("a request for a bus with no agent is never acknowledged by the backend")

        forged, _ = self.api.call(
            "POST", "/api/assistance/simulator/command", {"requestId": request_id, "command": "ACKNOWLEDGE"}
        )
        assert forged == 403, f"the simulator route must refuse ACKNOWLEDGE, got {forged}"
        passed("the simulator route refuses to acknowledge on a bus's behalf")

    def step_3_unsafe_object_blocks_then_bus_acknowledges(self) -> str:
        self.bus1.do("place person 0.95")
        wait_until(
            lambda: (self.decision(BUS_1) or {}).get("permission") == "HALT",
            10,
            "Bus 1's gate to halt on the unsafe object",
        )
        request_id = self.new_request(BUS_1)
        wait_until(
            lambda: self.request_status(request_id) == "ACKNOWLEDGED",
            10,
            "Bus 1 to acknowledge its request",
        )
        passed("the request is acknowledged by the bus, after the bus received it")
        hold(
            lambda: (self.ramp(BUS_1) or {}).get("state") in (None, "STOWED"),
            5,
            "the ramp stays stowed while a person is in the zone",
        )
        assert not self.pending_commands(BUS_1, "DEPLOY_RAMP"), "no deploy command while the path is blocked"
        decision = self.decision(BUS_1)
        assert "OBJECT_IN_ZONE" in decision["reasons"], decision
        passed("a person in the zone: Pi decision HALT (OBJECT_IN_ZONE), no deploy command, ramp stowed")
        return request_id

    def step_4_deploy_with_a_mid_deployment_halt(self) -> None:
        self.bus1.do("clear")
        wait_until(lambda: (self.ramp(BUS_1) or {}).get("state") == "DEPLOYING", 20, "Bus 1's ramp to start deploying")
        self.bus1.do("place person 0.9")
        halted = wait_until(
            lambda: (lambda r: r if r and r["state"] == "HALTED" else None)(self.ramp(BUS_1)),
            10,
            "the ramp to halt when a person appears mid-deployment",
        )
        assert "OBJECT_IN_ZONE" in halted.get("haltReasons", []), halted
        hold(lambda: self.bus1.ramp == "HALTED", 3, "no progress while halted")
        passed("mid-deployment obstruction halts the simulated ramp and records why")
        self.bus1.do("clear")
        wait_until(lambda: (self.ramp(BUS_1) or {}).get("state") == "DEPLOYED", 30, "the ramp to finish after the zone clears")
        passed("the ramp resumes and finishes once the zone is clear")

    def step_5_sensor_dropout(self) -> None:
        self.bus1.do("dropout on")
        wait_until(
            lambda: "TOF_UNAVAILABLE" in ((self.decision(BUS_1) or {}).get("reasons") or []),
            15,
            "the gate to halt on a ToF dropout",
        )
        assert self.decision(BUS_1)["permission"] == "HALT"
        passed("a ToF sensor dropout halts (TOF_UNAVAILABLE)")
        self.bus1.do("dropout off")
        wait_until(lambda: (self.decision(BUS_1) or {}).get("zoneState") == "CLEAR", 15, "the sensor to recover")
        passed("the sensor recovers and the zone reads clear again")

    def step_6_retract_only_when_the_ramp_is_clear(self, request_id: str) -> None:
        case = self.case_of(request_id)
        self.bus1.do("place person 0.95")
        wait_until(lambda: (self.decision(BUS_1) or {}).get("permission") == "HALT", 10, "a person on the ramp to halt the gate")
        status, _ = self.api.call("POST", f"/api/operations/cases/{case['caseId']}/operator", {"action": "COMPLETE"})
        assert status == 200, f"operator COMPLETE returned {status}"
        time.sleep(2)
        assert not self.pending_commands(BUS_1, "RETRACT_RAMP"), "no retract command while a person is on the ramp"
        assert self.ramp(BUS_1)["state"] == "DEPLOYED"
        passed("completing while a person is on the ramp does not retract it")

        self.bus1.do("clear")
        wait_until(lambda: (self.decision(BUS_1) or {}).get("zoneState") == "CLEAR", 10, "the ramp zone to read clear")
        self.api.call("POST", f"/api/operations/cases/{case['caseId']}/operator", {"action": "RETRY"})
        wait_until(lambda: (self.ramp(BUS_1) or {}).get("state") == "STOWED", 20, "the ramp to be stowed after the person leaves")
        wait_until(
            lambda: self.api.get(f"/api/operations/cases/{case['caseId']}")["state"] == "COMPLETED",
            20,
            "the case to complete once the ramp is stowed",
        )
        passed("after the person leaves the ramp retracts and the case completes")

    def step_7_bay_release_and_grant(self) -> None:
        assert self.ramp(BUS_2)["state"] == "STOWED" if self.ramp(BUS_2) else True
        request_id = self.new_request(BUS_2)
        wait_until(lambda: self.request_status(request_id) == "ACKNOWLEDGED", 10, "Bus 2 to acknowledge while waiting")
        reasons = wait_until(lambda: (self.decision(BUS_2) or {}).get("reasons"), 10, "Bus 2's decision")
        assert "WAITING_FOR_BAY" in reasons, reasons
        assert (self.ramp(BUS_2) or {}).get("state", "STOWED") == "STOWED"
        passed("Bus 2 acknowledged while waiting but its ramp stays stowed (WAITING_FOR_BAY)")

        self.bus1.do("depart")
        wait_until(lambda: (self.bus_status(BUS_1) or {}).get("movement") == "DEPARTING", 10, "Bus 1 to depart")
        bay = wait_until(lambda: (lambda b: b if b["occupantBusId"] is None else None)(self.bay()), 10, "the bay to be released")
        assert bay["grantedBusId"] is None, bay
        hold(lambda: (self.ramp(BUS_2) or {}).get("state", "STOWED") == "STOWED", 3, "Bus 2 does not move when Bus 1 leaves")
        passed("Bus 1 departs; the bay is released but nobody is granted it and Bus 2 does not deploy")

        status, granted = self.api.call("POST", f"/api/operations/bays/{STOP}/proceed", {})
        assert status == 200 and granted["grantedBusId"] == BUS_2, (status, granted)
        wait_until(lambda: self.bay()["occupantBusId"] == BUS_2, 10, "Bus 2 to enter the bay after the grant")
        wait_until(lambda: (self.ramp(BUS_2) or {}).get("state") == "DEPLOYED", 40, "Bus 2's ramp to deploy")
        passed("the controller grants the bay; Bus 2 enters, then deploys")

    def step_8_audit(self) -> None:
        events = self.api.get("/api/operations/audit?limit=500")["events"]
        events.reverse()  # oldest first
        types = [e["eventType"] for e in events]

        def first(predicate) -> int:
            for index, event in enumerate(events):
                if predicate(event):
                    return index
            raise ScenarioFailure("an expected audit event is missing")

        granted = first(lambda e: e["eventType"] == "BAY_ENTRY_GRANTED")
        bus2_moved = first(
            lambda e: e["eventType"] == "RAMP_SIMULATION_CHANGED"
            and e.get("busId") == BUS_2
            and e["detail"].get("state") in ("DEPLOYING", "DEPLOYED")
        )
        assert granted < bus2_moved, "Bus 2's ramp moved before the bay grant"
        first(lambda e: e["eventType"] == "ASSISTANCE_COMPLETED_RAMP_STOWED")
        first(lambda e: e["eventType"] == "RAMP_SAFETY_CHANGED" and e.get("busId") == BUS_1)
        assert types.count("BAY_ENTRY_GRANTED") == 1, "exactly one grant"
        passed(f"audit trail holds the sequence in order ({len(events)} events)")


def main() -> int:
    backend = Backend()
    buses: list = []
    try:
        say(f"starting the backend on port {backend.port} (bus-only acknowledgement, signed devices)")
        backend.start()
        api = Api(backend.base)
        bus1, bus2 = Bus(BUS_1, backend.base), Bus(BUS_2, backend.base)
        buses = [bus1, bus2]
        for bus in buses:
            bus.start()
        scenario = Scenario(api, bus1, bus2)
        scenario.step_1_register_and_queue()
        scenario.step_2_nothing_confirms_without_a_bus()
        request_id = scenario.step_3_unsafe_object_blocks_then_bus_acknowledges()
        scenario.step_4_deploy_with_a_mid_deployment_halt()
        scenario.step_5_sensor_dropout()
        scenario.step_6_retract_only_when_the_ramp_is_clear(request_id)
        scenario.step_7_bay_release_and_grant()
        scenario.step_8_audit()
        say("RESULT: every step held (all sensors and the ramp simulated)")
        return 0
    except (ScenarioFailure, AssertionError) as failure:
        say(f"FAIL  {failure}")
        if backend.log_path.exists():
            tail = backend.log_path.read_text(errors="replace").splitlines()[-15:]
            say("---- backend log (last lines) ----")
            say("\n".join(tail))
        return 1
    finally:
        for bus in buses:
            bus.stop()
        backend.stop()


if __name__ == "__main__":
    raise SystemExit(main())
