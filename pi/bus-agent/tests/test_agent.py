"""The bus agent against a fake backend and simulated sensors. No hardware, network or model."""

import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator

from beam_reading import BeamReader, SimulatedBeamSource
from bus_agent.agent import AgentConfig, BusAgent, DepartureBlocked
from bus_agent.backend import FakeBackend
from bus_agent.sim_sensors import SimulatedCamera

SCHEMAS = Path(__file__).resolve().parents[3] / "contracts" / "schema"
STOP = "18331"
BUS = "AV-095-01"
TICK = 0.2

REQUEST_EVENT = {
    "type": "ASSIST_REQUESTED",
    "request": {
        "requestId": "REQ-1",
        "busId": BUS,
        "busService": "95",
        "boardingStop": "18301",
        "stopCode": STOP,
        "assistanceTypes": ["WHEELCHAIR_RAMP"],
        "boardingOrAlighting": "BOARDING",
        "createdAt": "2026-09-30T00:00:00.000Z",
    },
    "timestamp": "2026-09-30T00:00:00.000Z",
}


def command(command_id="CMD-1", kind="DEPLOY_RAMP"):
    return {
        "commandId": command_id,
        "caseId": "CASE-1",
        "busId": BUS,
        "stopCode": STOP,
        "command": kind,
        "idempotencyKey": command_id,
        "issuedAt": "2026-09-30T00:00:00.000Z",
        "expiresAt": "2026-09-30T01:00:00.000Z",
    }


class World:
    """One agent with simulated sensors and a fake clock that advances 0.2 s per tick."""

    def __init__(self, bus_id=BUS, config=None, backend=None) -> None:
        self.now = 100.0
        self.clock = lambda: self.now
        self.backend = backend if backend is not None else FakeBackend()
        self.camera = SimulatedCamera(self.clock)
        self.beam_source = SimulatedBeamSource(reference_mm=500)
        self.beam = BeamReader(self.beam_source, clock=self.clock, simulated=True)
        self.agent = BusAgent(
            bus_id=bus_id,
            bus_service="95",
            backend=self.backend,
            camera=self.camera,
            detector=self.camera,
            beam_reader=self.beam,
            clock=self.clock,
            iso_clock=lambda: "2026-09-30T00:00:00.000Z",
            config=config or AgentConfig(),
        )
        for _ in range(10):  # let the beam collect its calibration readings
            self.tick()
        self.beam.calibrate()

    def tick(self, times=1) -> None:
        for _ in range(times):
            self.now += TICK
            self.agent.tick()

    def positioned_with_request(self) -> None:
        self.agent.arrive(STOP)
        self.agent.handle_event(REQUEST_EVENT)
        self.tick(4)  # beam needs three good readings to read clear

    def deploy(self, ticks=10) -> None:
        self.backend.commands = [command()]
        self.tick(ticks)

    def statuses(self) -> list:
        return [body["state"] for _, body in self.backend.actuator_reports]


class ContractTests(unittest.TestCase):
    def test_every_report_the_agent_posts_validates_against_the_schemas(self) -> None:
        world = World()
        world.positioned_with_request()
        world.camera.place("person")
        world.deploy()
        world.camera.clear_objects()
        world.tick(30)
        names = {
            "bus-status": "BusStatusReport",
            "ramp-simulation": "RampSimulationReport",
            "safety-decision": "RampSafetyReport",
            "telemetry": "SafetyTelemetryReport",
        }
        seen = set()
        for kind, body in world.backend.posts:
            validator = Draft7Validator(
                json.loads((SCHEMAS / f"{names[kind]}.schema.json").read_text(encoding="utf-8"))
            )
            errors = [error.message for error in validator.iter_errors(body)]
            self.assertEqual([], errors, f"{kind}: {body}")
            seen.add(kind)
        self.assertEqual(set(names), seen)

    def test_everything_is_labelled_simulated(self) -> None:
        world = World()
        world.positioned_with_request()
        self.assertTrue(all(body["simulated"] for body in world.backend.posted("bus-status")))
        self.assertTrue(all(body["simulated"] for body in world.backend.posted("ramp-simulation")))
        self.assertTrue(all(body["simulated"] for body in world.backend.posted("safety-decision")))


class RequestTests(unittest.TestCase):
    def test_a_request_for_this_bus_is_acknowledged_by_the_bus(self) -> None:
        world = World()
        world.agent.handle_event(REQUEST_EVENT)
        world.tick()
        self.assertEqual(["REQ-1"], world.backend.acks)

    def test_a_request_for_another_bus_is_ignored(self) -> None:
        world = World()
        other = json.loads(json.dumps(REQUEST_EVENT))
        other["request"]["busId"] = "AV-095-02"
        world.agent.handle_event(other)
        world.tick()
        self.assertEqual([], world.backend.acks)

    def test_an_unacknowledged_request_is_retried_when_the_backend_returns(self) -> None:
        world = World()
        world.backend.fail_all = True
        world.agent.handle_event(REQUEST_EVENT)
        world.tick(3)
        world.backend.fail_all = False
        world.tick(3)
        self.assertEqual(["REQ-1"], world.backend.acks)

    def test_a_request_found_by_pulling_is_acknowledged_once(self) -> None:
        world = World()
        world.backend.requests = [REQUEST_EVENT["request"]]
        world.tick(40)
        self.assertEqual(["REQ-1"], world.backend.acks)

    def test_the_same_request_pushed_twice_is_acknowledged_once(self) -> None:
        world = World()
        world.agent.handle_event(REQUEST_EVENT)
        world.agent.handle_event(REQUEST_EVENT)
        world.tick(3)
        self.assertEqual(["REQ-1"], world.backend.acks)


class DeploymentTests(unittest.TestCase):
    def test_a_deploy_command_with_everything_clear_completes(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(30)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)
        self.assertIn("ACCEPTED", world.statuses())
        self.assertEqual("COMPLETED", world.statuses()[-1])
        self.assertEqual("DEPLOYED", world.backend.actuator_reports[-1][1]["rampPosition"])

    def test_telemetry_says_the_path_is_clear_only_when_the_gate_continues(self) -> None:
        world = World()
        world.positioned_with_request()
        self.assertTrue(world.backend.posted("telemetry")[-1]["deploymentPathClear"])
        world.camera.place("person")
        world.tick()
        self.assertFalse(world.backend.posted("telemetry")[-1]["deploymentPathClear"])

    def test_an_unsafe_object_halts_the_ramp_and_it_resumes_when_removed(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(6)
        world.camera.place("person")
        world.tick(3)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertEqual("HALT", world.agent.last_decision.permission)
        self.assertIn("OBJECT_IN_ZONE", world.agent.last_decision.reasons)
        stuck = world.agent.ramp.progress
        world.tick(10)
        self.assertEqual(stuck, world.agent.ramp.progress, "no progress while halted")
        world.camera.clear_objects()
        world.tick(40)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)

    def test_a_blocked_beam_halts_even_with_an_empty_camera(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(4)
        world.beam_source.set_blocked(True)
        world.tick(2)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertIn("SENSORS_DISAGREE", world.agent.last_decision.reasons)

    def test_a_sensor_dropout_halts(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(4)
        world.beam_source.set_dropout(True)
        world.tick(8)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertIn("TOF_UNAVAILABLE", world.agent.last_decision.reasons)

    def test_a_beam_source_that_fails_halts_and_never_stops_the_tick(self) -> None:
        # An unplugged ESP32 raises OSError from the serial read. The tick must survive it and halt.
        world = World()
        world.positioned_with_request()
        world.deploy(4)

        def unplugged():
            raise OSError(5, "Input/output error")

        world.beam_source.read_lines = unplugged
        world.tick(8)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertIn("TOF_UNAVAILABLE", world.agent.last_decision.reasons)

    def test_a_covered_or_missing_camera_halts(self) -> None:
        for fault in ("cover", "stop"):
            with self.subTest(fault=fault):
                world = World()
                world.positioned_with_request()
                world.deploy(4)
                if fault == "cover":
                    world.camera.cover_lens(True)
                else:
                    world.camera.stop_frames(True)
                world.tick(2)
                self.assertEqual("HALTED", world.agent.ramp.state)
                self.assertIn("CAMERA_DEGRADED", world.agent.last_decision.reasons)

    def test_without_an_accepted_request_the_ramp_never_moves(self) -> None:
        world = World()
        world.agent.arrive(STOP)
        world.deploy(20)
        self.assertNotEqual("DEPLOYED", world.agent.ramp.state)
        self.assertIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)

    def test_an_operator_halt_stops_the_ramp(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(4)
        world.agent.set_operator_halt(True)
        world.tick(2)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertIn("OPERATOR_HALT", world.agent.last_decision.reasons)

    def test_a_command_delivered_twice_is_handled_once(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.commands = [command(), command()]
        world.tick(30)
        self.assertEqual(1, world.statuses().count("ACCEPTED"))
        world.tick(10)
        self.assertEqual(1, world.statuses().count("COMPLETED"))

    def test_an_unsupported_command_is_reported_failed_not_completed(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.commands = [command("CMD-9", "PLAY_EXTERNAL_AUDIO")]
        world.tick(3)
        self.assertEqual(["FAILED"], world.statuses())

    def test_the_local_decision_still_halts_the_ramp_when_the_backend_is_down(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(4)
        world.backend.fail_all = True
        world.camera.place("person")
        world.tick(3)
        self.assertEqual("HALTED", world.agent.ramp.state)


class MovementTests(unittest.TestCase):
    def test_arriving_at_a_free_bay_reports_positioned(self) -> None:
        world = World()
        world.agent.arrive(STOP)
        self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)
        self.assertEqual("POSITIONED_AT_STOP", world.backend.posted("bus-status")[-1]["movement"])

    def test_a_refused_entry_becomes_waiting_for_the_bay_until_granted(self) -> None:
        world = World(bus_id="AV-095-02")
        world.backend.refuse_positioned = True
        world.agent.arrive(STOP)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement)
        world.backend.refuse_positioned = False
        other_bus_granted = {"type": "BAY_STATUS", "bay": {"stopCode": STOP, "grantedBusId": "AV-095-01"}}
        world.agent.handle_event(other_bus_granted)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement)
        granted = {"type": "BAY_STATUS", "bay": {"stopCode": STOP, "grantedBusId": "AV-095-02"}}
        world.agent.handle_event(granted)
        self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)

    def test_a_waiting_bus_never_deploys(self) -> None:
        world = World(bus_id="AV-095-02")
        world.backend.refuse_positioned = True
        world.agent.arrive(STOP)
        world.agent.handle_event({**REQUEST_EVENT, "request": {**REQUEST_EVENT["request"], "busId": "AV-095-02"}})
        world.backend.commands = [command()]
        world.tick(30)
        self.assertNotEqual("DEPLOYED", world.agent.ramp.state)
        self.assertIn("WAITING_FOR_BAY", world.agent.last_decision.reasons)

    def test_a_deployed_ramp_blocks_departure_until_retracted(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(30)
        with self.assertRaises(DepartureBlocked):
            world.agent.depart()
        world.backend.commands = [command("CMD-2", "RETRACT_RAMP")]
        world.tick(2)
        self.assertEqual("STOWED", world.agent.ramp.state)
        world.agent.depart()
        self.assertEqual("DEPARTING", world.agent.movement)

    def test_departing_ends_the_accepted_requests(self) -> None:
        world = World()
        world.positioned_with_request()
        world.agent.depart()
        world.tick()
        self.assertIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)


class PostingTests(unittest.TestCase):
    def test_nothing_is_reposted_every_tick_when_nothing_changes(self) -> None:
        world = World()
        world.positioned_with_request()
        world.tick(2)
        before = len(world.backend.posts)
        world.tick(10)  # two seconds, ten ticks
        kinds = [kind for kind, _ in world.backend.posts[before:]]
        for kind in set(kinds):
            self.assertLessEqual(kinds.count(kind), 1, f"{kind} was posted more than once")
        self.assertLessEqual(len(kinds), 4, "far fewer posts than ticks x kinds")

    def test_a_heartbeat_is_sent_after_the_interval(self) -> None:
        world = World()
        world.positioned_with_request()
        world.tick(2)
        before = len(world.backend.posts)
        world.tick(30)  # six seconds
        self.assertGreater(len(world.backend.posts), before)

    def test_a_failed_post_is_retried(self) -> None:
        world = World()
        world.backend.fail_all = True
        world.agent.arrive(STOP)
        world.tick(3)
        moves = [b["movement"] for b in world.backend.posted("bus-status")]
        self.assertNotIn("POSITIONED_AT_STOP", moves)
        world.backend.fail_all = False
        world.tick(1)
        moves = [b["movement"] for b in world.backend.posted("bus-status")]
        self.assertIn("POSITIONED_AT_STOP", moves)


class OperatorHaltTests(unittest.TestCase):
    def halt_event(self, bus=BUS, halted=True):
        return {
            "type": "OPERATOR_HALT",
            "halt": {"busId": bus, "halted": halted, "setAt": "2026-09-30T00:00:00.000Z"},
            "timestamp": "2026-09-30T00:00:00.000Z",
        }

    def test_a_pushed_halt_stops_the_ramp_and_release_lets_it_continue(self) -> None:
        world = World()
        world.positioned_with_request()
        world.deploy(4)
        world.agent.handle_event(self.halt_event())
        world.tick(2)
        self.assertEqual("HALTED", world.agent.ramp.state)
        self.assertIn("OPERATOR_HALT", world.agent.last_decision.reasons)
        world.agent.handle_event(self.halt_event(halted=False))
        world.tick(40)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)

    def test_a_halt_for_another_bus_is_ignored(self) -> None:
        world = World()
        world.positioned_with_request()
        world.agent.handle_event(self.halt_event(bus="AV-095-02"))
        world.tick()
        self.assertNotIn("OPERATOR_HALT", world.agent.last_decision.reasons)

    def test_a_halt_set_while_the_bus_was_offline_is_found_by_the_poll(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.operator_halt = {"halted": True}
        world.tick(40)  # longer than the request poll interval
        self.assertIn("OPERATOR_HALT", world.agent.last_decision.reasons)

    def test_a_failed_poll_never_releases_a_halt(self) -> None:
        world = World()
        world.positioned_with_request()
        world.agent.handle_event(self.halt_event())
        world.backend.fail_all = True
        world.tick(40)
        self.assertIn("OPERATOR_HALT", world.agent.last_decision.reasons)

    def test_the_poll_can_release_a_halt_the_backend_no_longer_holds(self) -> None:
        world = World()
        world.positioned_with_request()
        world.agent.handle_event(self.halt_event())
        world.backend.operator_halt = {"halted": False}
        world.tick(40)
        self.assertNotIn("OPERATOR_HALT", world.agent.last_decision.reasons)


class TimeoutAndLinkTests(unittest.TestCase):
    """R1: a stalled deployment and a lost backend link. Both are off unless configured, because
    the values have not been agreed and are not invented here."""

    def start_deploying_with_a_person(self, config):
        world = World(config=config)
        world.positioned_with_request()
        world.backend.commands = [command()]
        world.tick(2)
        world.camera.place("person")
        world.tick(2)
        return world

    def test_with_no_timeout_configured_a_stalled_deployment_is_never_reported(self) -> None:
        world = self.start_deploying_with_a_person(AgentConfig())
        world.tick(200)  # forty seconds
        self.assertEqual([], world.backend.posted("help-required"))
        self.assertNotIn("DEPLOYMENT_TIMEOUT", world.agent.last_decision.reasons)

    def test_a_configured_timeout_raises_help_once_halts_and_fails_the_command(self) -> None:
        world = self.start_deploying_with_a_person(AgentConfig(deployment_timeout_seconds=5.0))
        self.assertEqual([], world.backend.posted("help-required"))
        world.tick(40)  # eight seconds
        [help_body] = world.backend.posted("help-required")
        self.assertEqual("DEPLOYMENT_TIMEOUT", help_body["reason"])
        self.assertIn(help_body["state"], ("HALTED", "DEPLOYING"))
        self.assertIn("DEPLOYMENT_TIMEOUT", world.agent.last_decision.reasons)
        self.assertEqual("HALT", world.agent.last_decision.permission)
        self.assertEqual("FAILED", world.statuses()[-1])
        world.tick(40)
        self.assertEqual(1, len(world.backend.posted("help-required")), "raised once, not repeatedly")

    def test_a_deployment_that_finishes_in_time_never_times_out(self) -> None:
        world = World(config=AgentConfig(deployment_timeout_seconds=30.0))
        world.positioned_with_request()
        world.deploy(40)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)
        world.tick(200)
        self.assertEqual([], world.backend.posted("help-required"))
        self.assertNotIn("DEPLOYMENT_TIMEOUT", world.agent.last_decision.reasons)

    def test_a_lost_link_halts_a_deployment_only_when_configured(self) -> None:
        # A slow deployment, so the outage is still going on while the ramp is moving.
        world = World(config=AgentConfig(link_loss_halt_seconds=3.0, deploy_seconds=10.0))
        world.positioned_with_request()
        world.deploy(4)
        self.assertEqual("DEPLOYING", world.agent.ramp.state)
        world.backend.fail_all = True
        world.tick(25)  # five seconds without reaching the backend
        self.assertIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)
        self.assertEqual("HALTED", world.agent.ramp.state)
        world.backend.fail_all = False
        world.tick(40)
        self.assertNotIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)

    def test_link_loss_is_seen_through_the_non_blocking_backend_too(self) -> None:
        import time

        from bus_agent.async_backend import AsyncBackend
        from bus_agent.backend import FakeBackend

        inner = FakeBackend()
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        try:
            # The worker measures real time, so this test waits in real time.
            world = World(config=AgentConfig(link_loss_halt_seconds=0.3), backend=backend)
            world.agent.arrive(STOP)
            inner.fail_all = True
            for _ in range(60):
                world.tick()
                time.sleep(0.01)  # let the worker notice the failures
            self.assertIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)
            inner.fail_all = False
            for _ in range(60):
                world.tick()
                time.sleep(0.01)
            self.assertNotIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)
        finally:
            backend.stop()

    def test_without_the_setting_a_lost_link_adds_no_reason(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.fail_all = True
        world.tick(200)
        self.assertNotIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)

    def test_a_healthy_quiet_backend_never_counts_as_lost(self) -> None:
        world = World(config=AgentConfig(link_loss_halt_seconds=3.0))
        world.positioned_with_request()
        world.tick(250)  # fifty seconds with nothing changing
        self.assertNotIn("BACKEND_LINK_LOST", world.agent.last_decision.reasons)

    def test_the_new_reasons_still_make_valid_reports(self) -> None:
        world = self.start_deploying_with_a_person(AgentConfig(deployment_timeout_seconds=3.0, link_loss_halt_seconds=3.0))
        world.backend.fail_all = True
        world.tick(30)
        world.backend.fail_all = False
        world.tick(10)
        validator = Draft7Validator(
            json.loads((SCHEMAS / "RampSafetyReport.schema.json").read_text(encoding="utf-8"))
        )
        reasons = set()
        for body in world.backend.posted("safety-decision"):
            self.assertEqual([], [e.message for e in validator.iter_errors(body)], body)
            reasons.update(body["reasons"])
        self.assertIn("DEPLOYMENT_TIMEOUT", reasons)
        self.assertIn("BACKEND_LINK_LOST", reasons)


class LoopTimingTests(unittest.TestCase):
    def test_a_long_gap_between_ticks_cannot_make_the_ramp_jump(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.commands = [command()]
        world.tick(3)
        self.assertEqual("DEPLOYING", world.agent.ramp.state)
        world.now += 30.0  # the loop was stalled for half a minute
        world.agent.tick()
        self.assertNotEqual("DEPLOYED", world.agent.ramp.state)
        self.assertLessEqual(world.agent.ramp.progress, 0.6)

    def test_a_stuck_backend_does_not_slow_the_safety_loop_or_stale_its_decision(self) -> None:
        import threading
        import time

        from bus_agent.async_backend import AsyncBackend
        from bus_agent.backend import FakeBackend

        class Stuck(FakeBackend):
            def __init__(self) -> None:
                super().__init__()
                self.release = threading.Event()

            def post(self, kind, body):
                self.release.wait(5)
                return super().post(kind, body)

            def pending_requests(self):
                self.release.wait(5)
                return []

            def pending_actuator_commands(self):
                self.release.wait(5)
                return []

        inner = Stuck()
        backend = AsyncBackend(inner, retry_seconds=0.05)
        try:
            world = World(backend=backend)
            world.agent.arrive(STOP)
            world.camera.place("person")
            started = time.monotonic()
            world.tick(50)
            elapsed = time.monotonic() - started
            self.assertLess(elapsed, 1.0, "50 ticks must not wait for the network")
            self.assertEqual("HALT", world.agent.last_decision.permission)
            self.assertIn("OBJECT_IN_ZONE", world.agent.last_decision.reasons)
        finally:
            inner.release.set()
            backend.stop()


if __name__ == "__main__":
    unittest.main()
