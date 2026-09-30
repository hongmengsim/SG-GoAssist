"""P-H1: a halt poll that started before a pushed halt must never undo it."""

import threading
import time
import unittest

from bus_agent.agent import AgentConfig, BusAgent
from bus_agent.async_backend import AsyncBackend
from bus_agent.backend import FakeBackend

from tests.test_agent import BUS, World


class SlowHaltBackend(FakeBackend):
    """The first halt read is slow and answers 'not halted'; later reads say 'halted'."""

    def __init__(self) -> None:
        super().__init__()
        self.first_started = threading.Event()
        self.release_first = threading.Event()
        self.calls = 0

    def pending_operator_halt(self):
        self.calls += 1
        if self.calls == 1:
            self.first_started.set()
            self.release_first.wait(5)
            return {"halted": False}
        return {"halted": True}


class StaleHaltPollTests(unittest.TestCase):
    def test_a_poll_that_started_before_a_push_is_discarded(self) -> None:
        inner = SlowHaltBackend()
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        self.addCleanup(backend.stop)
        backend.pending_operator_halt()  # asks for a halt read
        self.assertTrue(inner.first_started.wait(2))
        backend.invalidate_halt()  # a push arrived while the read was in flight
        inner.release_first.set()
        seen = []
        end = time.monotonic() + 0.4
        while time.monotonic() < end:
            seen.append(backend.pending_operator_halt())
            time.sleep(0.01)
        self.assertNotIn({"halted": False}, seen, "the stale answer must never be shown")

    def test_a_pushed_halt_asks_the_backend_to_forget_its_cached_halt(self) -> None:
        class Spy(FakeBackend):
            invalidated = 0

            def invalidate_halt(self) -> None:
                self.invalidated += 1

        world = World(backend=Spy())
        world.agent.handle_event(
            {"type": "OPERATOR_HALT", "halt": {"busId": BUS, "halted": True}}
        )
        self.assertEqual(1, world.backend.invalidated)


if __name__ == "__main__":
    unittest.main()
