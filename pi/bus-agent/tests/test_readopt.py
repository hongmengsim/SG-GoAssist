"""A bus that restarted takes back the requests it had already confirmed (the swallowed-request bug)."""

import time
import unittest

from bus_agent.agent import AgentConfig
from bus_agent.async_backend import AsyncBackend
from bus_agent.backend import FakeBackend

from tests.test_agent import BUS, REQUEST_EVENT, STOP, World


def acknowledged(stop=STOP, request_id="REQ-OLD"):
    request = dict(REQUEST_EVENT["request"])
    request.update({"requestId": request_id, "stopCode": stop})
    return request


class ReadoptTests(unittest.TestCase):
    def test_on_arrival_the_bus_takes_back_its_acknowledged_request_for_this_stop(self) -> None:
        world = World()
        world.backend.accepted_requests = [acknowledged()]
        world.agent.arrive(STOP)
        world.tick(6)
        self.assertNotIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)
        self.assertEqual([], world.backend.acks, "it was already confirmed, so it is not confirmed again")

    def test_a_request_for_another_stop_is_not_taken_back(self) -> None:
        world = World()
        world.backend.accepted_requests = [acknowledged(stop="99999")]
        world.agent.arrive(STOP)
        world.tick(6)
        self.assertIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)

    def test_a_request_for_another_bus_is_not_taken_back(self) -> None:
        other = acknowledged()
        other["busId"] = "AV-095-02"
        world = World()
        world.backend.accepted_requests = [other]
        world.agent.arrive(STOP)
        world.tick(6)
        self.assertIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)

    def test_it_keeps_asking_until_the_backend_has_answered(self) -> None:
        class SlowStart(FakeBackend):
            asked = 0

            def pending_accepted_requests(self):
                self.asked += 1
                return None if self.asked < 3 else [acknowledged()]

        world = World(backend=SlowStart())
        world.agent.arrive(STOP)
        world.tick(15)
        self.assertNotIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)

    def test_through_the_non_blocking_backend_too(self) -> None:
        inner = FakeBackend()
        inner.accepted_requests = [acknowledged()]
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        try:
            world = World(config=AgentConfig(), backend=backend)
            world.agent.arrive(STOP)
            for _ in range(40):
                world.tick()
                time.sleep(0.01)
            self.assertNotIn("NO_ACCEPTED_REQUEST", world.agent.last_decision.reasons)
        finally:
            backend.stop()


if __name__ == "__main__":
    unittest.main()
