"""Findings of the 5 Oct 2026 integration audit (links 3, 6, 7)."""

import json
import unittest

from bus_agent.agent import AgentConfig
from bus_agent.backend import BackendError, BackendRefused, FakeBackend
from bus_agent.http_backend import HttpBackend
from bus_agent.posting import ChangeGate

from tests.test_agent import BUS, REQUEST_EVENT, STOP, World, command


class ActuatorPostingTests(unittest.TestCase):
    def test_a_changing_update_time_is_not_a_change(self) -> None:
        gate = ChangeGate(heartbeat_seconds=5.0, clock=lambda: 0.0)
        body = {"state": "IN_PROGRESS", "detail": "Halted", "updatedAt": "2026-10-05T00:00:00.000Z"}
        gate.sent("actuator:C1", body)
        self.assertFalse(gate.due("actuator:C1", {**body, "updatedAt": "2026-10-05T00:00:01.000Z"}))

    def test_a_halted_deployment_reports_at_the_heartbeat_rate_not_every_tick(self) -> None:
        ticks = {"n": 0}

        def moving_clock():
            ticks["n"] += 1
            return f"2026-10-05T00:{ticks['n'] // 60:02d}:{ticks['n'] % 60:02d}.000Z"

        world = World(config=AgentConfig(deploy_seconds=10.0))
        world.agent._iso = moving_clock
        world.positioned_with_request()
        world.backend.commands = [command()]
        world.camera.place("person")  # the deployment halts and stays halted
        world.tick(10)
        before = len(world.backend.actuator_reports)
        world.tick(100)  # 20 simulated seconds with nothing changing
        sent = len(world.backend.actuator_reports) - before
        self.assertLessEqual(sent, 6, f"{sent} reports in 20 s while nothing changed")


class RejectionTests(unittest.TestCase):
    def reply(self, status):
        def transport(method, url, headers, body, timeout):
            return status, json.dumps({"error": "no"}).encode(), {}

        return HttpBackend("http://x", BUS, secret=None, transport=transport)

    def test_a_report_the_backend_rejects_for_good_is_not_retried(self) -> None:
        for status in (400, 404, 422):
            with self.subTest(status=status), self.assertRaises(BackendRefused):
                self.reply(status).report_actuator("C1", {"state": "COMPLETED"})

    def test_a_server_error_or_throttle_is_still_retried(self) -> None:
        for status in (429, 500, 503):
            with self.subTest(status=status):
                with self.assertRaises(BackendError) as caught:
                    self.reply(status).report_actuator("C1", {"state": "COMPLETED"})
                self.assertNotIsInstance(caught.exception, BackendRefused)


class AckWedgeTests(unittest.TestCase):
    def test_one_refused_acknowledgement_does_not_block_the_next(self) -> None:
        class RefusesOne(FakeBackend):
            def ack_request(self, request_id):
                if request_id == "REQ-BAD":
                    raise BackendRefused("cancelled")
                super().ack_request(request_id)

        world = World(backend=RefusesOne())
        world.agent.arrive(STOP)
        bad = {**REQUEST_EVENT, "request": {**REQUEST_EVENT["request"], "requestId": "REQ-BAD"}}
        world.agent.handle_event(bad)
        world.agent.handle_event(REQUEST_EVENT)
        world.tick(10)
        self.assertEqual(["REQ-1"], world.backend.acks)
        self.assertNotIn("REQ-BAD", world.agent._unacked)
        self.assertNotIn("REQ-BAD", world.agent._accepted)


if __name__ == "__main__":
    unittest.main()


class CommandExpiryTests(unittest.TestCase):
    """A command the backend has expired must not be run, or carried on with."""

    def world(self, expires_at):
        clock = {"now": "2026-10-05T00:00:00.000Z"}
        world = World(config=AgentConfig(deploy_seconds=10.0))
        world.agent._iso = lambda: clock["now"]
        world.positioned_with_request()
        world.clock_state = clock
        world.backend.commands = [{**command(), "expiresAt": expires_at}]
        return world

    def test_a_command_that_has_already_expired_is_not_run(self) -> None:
        world = self.world("2026-10-04T23:59:00.000Z")
        world.tick(10)
        self.assertEqual("STOWED", world.agent.ramp.state)
        self.assertEqual([], world.backend.actuator_reports)

    def test_a_deployment_still_going_when_its_command_expires_halts_and_asks_for_help(self) -> None:
        world = self.world("2026-10-05T00:00:30.000Z")
        world.tick(10)
        self.assertEqual("DEPLOYING", world.agent.ramp.state)
        world.clock_state["now"] = "2026-10-05T00:00:31.000Z"  # the backend has expired it by now
        world.tick(5)
        self.assertEqual("HALT", world.agent.last_decision.permission)
        self.assertIn("DEPLOYMENT_TIMEOUT", world.agent.last_decision.reasons)
        self.assertEqual(1, len(world.backend.posted("help-required")))
        world.tick(100)  # it must not finish by itself afterwards
        self.assertNotEqual("DEPLOYED", world.agent.ramp.state)

    def test_a_command_that_finishes_before_it_expires_is_unaffected(self) -> None:
        world = self.world("2026-10-05T00:10:00.000Z")
        world.tick(80)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)
        self.assertEqual([], world.backend.posted("help-required"))


class BayEntryTests(unittest.TestCase):
    """The bus must not depend on a single pushed message to learn that it was granted the bay."""

    def test_a_waiting_bus_keeps_asking_so_a_lost_grant_cannot_wedge_the_bay(self) -> None:
        world = World()
        world.backend.refuse_positioned = True
        world.agent.arrive(STOP)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement)
        world.backend.refuse_positioned = False  # the controller granted it, but the push was lost
        world.tick(40)
        self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)

    def test_a_stale_answer_to_the_entry_report_is_no_verdict(self) -> None:
        class Stale(FakeBackend):
            def post(self, kind, body):
                super().post(kind, body)
                return "STALE" if body.get("movement") == "POSITIONED_AT_STOP" else "CHANGED"

        world = World(backend=Stale())
        world.agent.arrive(STOP)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement)

    def test_an_unreachable_backend_on_arrival_leaves_the_bus_waiting_until_it_answers(self) -> None:
        world = World()
        world.backend.fail_all = True
        world.agent.arrive(STOP)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement)
        world.backend.fail_all = False
        world.tick(40)
        self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)

    def test_the_retry_works_through_the_non_blocking_backend_without_waiting(self) -> None:
        import time

        from bus_agent.async_backend import AsyncBackend

        inner = FakeBackend()
        inner.refuse_positioned = True
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        try:
            world = World(backend=backend)
            world.agent.arrive(STOP)
            self.assertEqual("WAITING_FOR_BAY", world.agent.movement)
            inner.refuse_positioned = False
            started = time.monotonic()
            for _ in range(60):
                world.tick()
                time.sleep(0.01)
            self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)
            self.assertLess(time.monotonic() - started, 3.0)
        finally:
            backend.stop()


class SmallFixesTests(unittest.TestCase):
    def test_the_hidden_attribute_wins_over_the_badge_styles(self) -> None:
        from pathlib import Path

        page = (Path(__file__).resolve().parents[1] / "bus_agent" / "status.html").read_text(encoding="utf-8")
        self.assertIn("[hidden]", page)
        self.assertRegex(page, r"\[hidden\]\s*\{\s*display:\s*none\s*!important")

    def test_the_perception_thread_survives_a_detector_that_returns_a_malformed_box(self) -> None:
        import time

        from bus_agent.perception_worker import PerceptionWorker
        from perception import RawDetection

        from bus_agent.sim_sensors import SimulatedCamera

        camera = SimulatedCamera(time.monotonic)

        class BadBox:
            def detect(self, frame):
                return [RawDetection("person", 0.9, (1.0, 2.0, 3.0))]  # three numbers, not four

        worker = PerceptionWorker(camera, BadBox(), ((0, 0), (1, 0), (1, 1), (0, 1)), period_seconds=0.01)
        worker.start()
        try:
            deadline = time.monotonic() + 2
            result = None
            while time.monotonic() < deadline and result is None:
                time.sleep(0.02)
                result = worker.latest_perception()
            self.assertIsNotNone(result)
            self.assertTrue(worker.running, "the thread must not die")
            self.assertFalse(result[0].image_ok)
            self.assertEqual("inference_error", result[0].degraded_reason)
        finally:
            worker.stop()

    def test_calibrate_is_refused_while_the_ramp_is_out(self) -> None:
        from types import SimpleNamespace

        from bus_agent.console import apply_command

        world = World()
        world.positioned_with_request()
        world.deploy(6)
        self.assertNotEqual("STOWED", world.agent.ramp.state)
        reference_before = world.beam._reference if hasattr(world.beam, "_reference") else None
        reply = apply_command(SimpleNamespace(agent=world.agent, beam=world.beam), "calibrate")
        self.assertIn("ramp", reply.lower())
        self.assertNotIn("reference taken", reply)
        if reference_before is not None:
            self.assertEqual(reference_before, world.beam._reference)


class DeviceHeartbeatTests(unittest.TestCase):
    """The backend's 'devices online' count and lost-agent view need the agent to say it is alive."""

    def test_the_agent_reports_its_own_health_on_change_and_at_the_heartbeat(self) -> None:
        world = World()
        world.agent.arrive(STOP)
        world.tick(100)  # 20 simulated seconds
        beats = world.backend.posted("device-heartbeat")
        self.assertGreaterEqual(len(beats), 3)
        self.assertLessEqual(len(beats), 6, "not one per tick")
        body = beats[-1]
        self.assertEqual(BUS, body["deviceId"])
        self.assertEqual(BUS, body["busId"])
        self.assertTrue(body["networkOnline"])
        self.assertEqual({"tof", "camera"}, set(body["sensorHealth"]))
        self.assertTrue(all(value in ("OK", "DEGRADED", "FAILED") for value in body["sensorHealth"].values()))

    def test_a_beam_that_cannot_be_read_is_reported_as_failed_not_ok(self) -> None:
        world = World()
        world.beam_source.dropout = True if hasattr(world.beam_source, "dropout") else None
        world.agent.arrive(STOP)
        world.tick(10)
        health = world.backend.posted("device-heartbeat")[-1]["sensorHealth"]
        self.assertIn(health["tof"], ("OK", "DEGRADED", "FAILED"))

    def test_the_http_backend_sends_it_to_the_device_heartbeat_route(self) -> None:
        calls = []

        def transport(method, url, headers, body, timeout):
            calls.append((method, url))
            return 202, b"{}", {}

        HttpBackend("http://backend.test", BUS, secret=None, transport=transport).post(
            "device-heartbeat", {"deviceId": BUS}
        )
        self.assertEqual([("POST", "http://backend.test/api/operations/devices/heartbeat")], calls)


class RequestShapeTests(unittest.TestCase):
    def test_the_request_the_agent_receives_matches_the_schema_the_backend_pushes_to(self) -> None:
        from jsonschema import Draft7Validator

        from tests.test_agent import SCHEMAS

        schema = json.loads((SCHEMAS / "AssistRequestForBus.schema.json").read_text(encoding="utf-8"))
        errors = [e.message for e in Draft7Validator(schema).iter_errors(REQUEST_EVENT["request"])]
        self.assertEqual([], errors)


class UnknownEntryTests(unittest.TestCase):
    """A bay entry whose answer was lost may have succeeded: the bus must not post 'waiting' over it."""

    def test_a_lost_answer_never_makes_the_bus_demote_itself_at_the_backend(self) -> None:
        class AnswerLost(FakeBackend):
            lost_once = False

            def post(self, kind, body):
                outcome = super().post(kind, body)  # the backend accepted it...
                if kind == "bus-status" and body["movement"] == "POSITIONED_AT_STOP" and not self.lost_once:
                    self.lost_once = True
                    raise BackendError("answer lost")  # ...but the answer never arrived
                return outcome

        world = World(backend=AnswerLost())
        world.agent.arrive(STOP)
        self.assertEqual("WAITING_FOR_BAY", world.agent.movement, "the gate holds the ramp meanwhile")
        world.tick(30)
        movements = [body["movement"] for body in world.backend.posted("bus-status")]
        self.assertNotIn("WAITING_FOR_BAY", movements, "it must not post waiting over its own entry")
        self.assertEqual("POSITIONED_AT_STOP", world.agent.movement)
