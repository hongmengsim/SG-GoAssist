"""P-H3, P-M1, P-M2, P-M5: the agent must fail toward halting, not toward running or dying."""

import math
import time
import unittest

from bus_agent.agent import WAITING, AgentConfig
from bus_agent.async_backend import AsyncBackend
from bus_agent.backend import FakeBackend
from bus_agent.sensors_real import ModelDetector

from tests.test_agent import BUS, STOP, World, command
from tests.test_async_backend import BlockingBackend


class ArrivalTimeoutTests(unittest.TestCase):
    def test_an_entry_that_gets_no_answer_leaves_the_bus_waiting_not_positioned(self) -> None:
        inner = BlockingBackend()
        backend = AsyncBackend(inner, retry_seconds=0.02, poll_seconds=0.0)
        self.addCleanup(inner.gate.set)
        self.addCleanup(backend.stop)
        world = World(config=AgentConfig(entry_timeout_seconds=0.1), backend=backend)
        world.agent.arrive(STOP)
        self.assertEqual(WAITING, world.agent.movement)
        world.tick()
        self.assertIn("WAITING_FOR_BAY", world.agent.last_decision.reasons)


class UnknownHaltTests(unittest.TestCase):
    def test_until_the_halt_has_been_read_once_the_bus_counts_as_halted(self) -> None:
        class Unread(FakeBackend):
            def pending_operator_halt(self):
                return None  # not answered yet

        world = World(backend=Unread())
        world.positioned_with_request()
        world.deploy(10)
        self.assertIn("OPERATOR_HALT", world.agent.last_decision.reasons)
        self.assertNotEqual("DEPLOYED", world.agent.ramp.state)

    def test_a_successful_read_of_no_halt_releases_it(self) -> None:
        world = World()
        world.backend.operator_halt = {"halted": False}
        world.positioned_with_request()
        world.deploy(60)
        self.assertNotIn("OPERATOR_HALT", world.agent.last_decision.reasons)
        self.assertEqual("DEPLOYED", world.agent.ramp.state)


class TickSurvivesTests(unittest.TestCase):
    def test_a_camera_that_raises_halts_the_ramp_and_the_loop_carries_on(self) -> None:
        world = World()
        world.backend.operator_halt = {"halted": False}
        world.positioned_with_request()
        world.deploy(4)

        def broken(*args, **kwargs):
            raise RuntimeError("camera unplugged")

        world.camera.capture = broken
        world.tick(3)  # must not raise
        self.assertEqual("HALT", world.agent.last_decision.permission)
        self.assertIn("CAMERA_DEGRADED", world.agent.last_decision.reasons)

    def test_a_malformed_item_from_the_backend_is_ignored(self) -> None:
        world = World()
        world.positioned_with_request()
        world.backend.commands = ["not a dict", command()]
        world.backend.requests = [None, 7]
        world.tick(3)  # must not raise
        self.assertIn("CMD-1", [command_id for command_id, _ in world.backend.actuator_reports])


class NanConfidenceTests(unittest.TestCase):
    def test_a_nan_confidence_is_kept_so_the_pipeline_can_treat_it_as_unsafe(self) -> None:
        detector = ModelDetector(lambda frame: [("person", float("nan"), (0, 0, 1, 1))])
        [item] = detector.detect(object())
        self.assertTrue(math.isnan(item.confidence))


if __name__ == "__main__":
    unittest.main()
