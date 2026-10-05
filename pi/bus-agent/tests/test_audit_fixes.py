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
