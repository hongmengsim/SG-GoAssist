"""The real rig: real-sensor wiring built from fakes, and the console limits in real mode."""

import queue
import unittest

from beam_reading import FakeLineSource

from bus_agent.backend import FakeBackend
from bus_agent.config import parse_config
from bus_agent.console import apply_command
from bus_agent.real_mode import RealSensors
from bus_agent.runner import Runner, build_real_rig


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class FakeFrame:
    size = 10

    def mean(self) -> float:
        return 100.0

    def std(self) -> float:
        return 40.0


def rig(runner_output=None):
    clock = Clock()
    settings = parse_config({"busId": "AV-095-01", "busService": "95", "backendUrl": "http://x"})
    lines = FakeLineSource()
    sensors = RealSensors(lines, lambda: FakeFrame(), lambda frame: runner_output or [])
    built = build_real_rig(settings, sensors, FakeBackend(), clock=clock, start_worker=False)
    return built, lines, clock


class RealRigTests(unittest.TestCase):
    def test_everything_is_labelled_not_simulated(self) -> None:
        built, _, _ = rig()
        self.assertFalse(built.agent._simulated)
        self.assertFalse(built.agent.last_beam is not None and built.agent.last_beam.simulated)

    def test_the_beam_starts_uncalibrated_so_the_ramp_cannot_move(self) -> None:
        built, lines, clock = rig()
        for index in range(10):
            lines.push(f"{index},VL53L0X,500,VALID")
            clock.now += 0.2
            built.agent.tick()
        self.assertEqual("UNCALIBRATED", built.agent.last_beam.state)
        self.assertIn("TOF_NOT_CALIBRATED", built.agent.last_decision.reasons)

    def test_calibration_is_an_explicit_command_never_automatic(self) -> None:
        built, lines, clock = rig()
        runner = Runner(built, queue.Queue(), clock=clock, auto_calibrate=False)
        self.assertFalse(runner._auto_calibrate)
        for index in range(10):
            lines.push(f"{index},VL53L0X,500,VALID")
            clock.now += 0.2
            built.agent.tick()
        message = apply_command(built, "calibrate")
        self.assertIn("500", message)
        lines.push("11,VL53L0X,500,VALID")
        clock.now += 0.2
        built.agent.tick()
        self.assertEqual("BEAM_CLEAR", built.agent.last_beam.state)

    def test_calibrating_without_enough_readings_explains_why(self) -> None:
        built, _, _ = rig()
        self.assertIn("Wait", apply_command(built, "calibrate"))

    def test_scene_controls_are_refused_with_real_sensors(self) -> None:
        built, _, _ = rig()
        for line in ("place person", "clear", "cover on", "block on", "dropout on", "frames off"):
            with self.subTest(line=line):
                self.assertIn("real sensors", apply_command(built, line))

    def test_movement_and_halt_commands_still_work(self) -> None:
        built, _, _ = rig()
        self.assertIn("POSITIONED_AT_STOP", apply_command(built, "arrive 18331"))
        self.assertEqual("halt on", apply_command(built, "halt on"))
        self.assertTrue(built.agent._operator_halt)

    def test_status_says_real_not_simulated(self) -> None:
        built, _, _ = rig()
        self.assertNotIn("(simulated)", apply_command(built, "status"))


if __name__ == "__main__":
    unittest.main()
