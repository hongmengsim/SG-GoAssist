"""The simulated rig, the console commands and the runner's queue handling."""

import queue
import unittest

from bus_agent.backend import FakeBackend
from bus_agent.console import apply_command
from bus_agent.runner import SIMULATED_CAPABILITY_TELEMETRY, Runner, build_simulated_rig, capability_for

STOP = "18331"


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def rig():
    clock = Clock()
    backend = FakeBackend()
    built = build_simulated_rig("AV-095-01", "95", backend, clock=clock)
    return built, backend, clock


def warm(built, clock, ticks=10):
    for _ in range(ticks):
        clock.now += 0.2
        built.agent.tick()
    built.beam.calibrate()


class CapabilityTests(unittest.TestCase):
    def test_it_only_claims_what_the_simulated_bus_can_do(self) -> None:
        capability = capability_for("95")
        self.assertTrue(capability["ramp"])
        self.assertFalse(capability["externalAudio"])
        self.assertFalse(capability["visualDisplay"])
        self.assertFalse(capability["dwellControl"])
        self.assertEqual(list(SIMULATED_CAPABILITY_TELEMETRY), capability["supportedTelemetry"])
        self.assertNotIn("busId", capability)


class ConsoleTests(unittest.TestCase):
    def test_movement_commands(self) -> None:
        built, _, _ = rig()
        self.assertIn("POSITIONED_AT_STOP", apply_command(built, f"arrive {STOP}"))
        self.assertEqual("POSITIONED_AT_STOP", built.agent.movement)
        self.assertIn("DEPARTING", apply_command(built, "depart"))
        self.assertIn("TRAVELLING_TO_STOP", apply_command(built, f"travel {STOP}"))

    def test_departing_with_the_ramp_out_is_refused_with_a_message(self) -> None:
        built, _, clock = rig()
        apply_command(built, f"arrive {STOP}")
        built.agent.ramp = built.agent.ramp.__class__("DEPLOYED", 1.0)
        self.assertIn("not stowed", apply_command(built, "depart"))
        self.assertEqual("POSITIONED_AT_STOP", built.agent.movement)

    def test_scene_commands_change_what_the_sensors_report(self) -> None:
        built, _, clock = rig()
        warm(built, clock)
        apply_command(built, "place person 0.95")
        capture = built.camera.capture()
        self.assertEqual(1, len(built.camera.detect(capture.frame)))
        apply_command(built, "clear")
        self.assertEqual(0, len(built.camera.detect(capture.frame)))
        apply_command(built, "block on")
        clock.now += 0.2
        self.assertEqual("BLOCKED", built.beam.poll().state)
        apply_command(built, "block off")
        apply_command(built, "dropout on")
        clock.now += 2.0
        self.assertEqual("UNKNOWN", built.beam.poll().state)

    def test_switches_and_halt(self) -> None:
        built, _, _ = rig()
        apply_command(built, "halt on")
        apply_command(built, "cover on")
        built.agent.tick()
        self.assertIn("OPERATOR_HALT", built.agent.last_decision.reasons)
        self.assertIn("CAMERA_DEGRADED", built.agent.last_decision.reasons)

    def test_bad_commands_explain_themselves_and_change_nothing(self) -> None:
        built, _, _ = rig()
        for line in ("", "   ", "dance", "arrive", "place", "block maybe", "place person notanumber"):
            with self.subTest(line=line):
                message = apply_command(built, line)
                self.assertTrue(message)
        self.assertEqual("TRAVELLING_TO_STOP", built.agent.movement)

    def test_status_describes_the_current_state(self) -> None:
        built, _, clock = rig()
        warm(built, clock)
        text = apply_command(built, "status")
        self.assertIn("TRAVELLING_TO_STOP", text)
        self.assertIn("STOWED", text)
        self.assertIn("simulated", text.lower())


class RunnerTests(unittest.TestCase):
    def test_pushed_events_are_applied_on_the_next_step(self) -> None:
        built, backend, clock = rig()
        events: queue.Queue = queue.Queue()
        runner = Runner(built, events, clock=clock)
        events.put(
            {
                "type": "ASSIST_REQUESTED",
                "request": {"requestId": "REQ-1", "busId": "AV-095-01"},
            }
        )
        clock.now += 0.2
        runner.step()
        self.assertEqual(["REQ-1"], backend.acks)

    def test_a_backend_that_is_down_at_start_up_does_not_stop_the_runner(self) -> None:
        built, backend, clock = rig()
        backend.fail_all = True
        runner = Runner(built, queue.Queue(), clock=clock)
        clock.now += 0.2
        runner.step()  # must not raise

    def test_console_lines_are_applied_from_the_same_queue_of_commands(self) -> None:
        built, _, clock = rig()
        commands: queue.Queue = queue.Queue()
        runner = Runner(built, queue.Queue(), commands=commands, clock=clock)
        commands.put(f"arrive {STOP}")
        clock.now += 0.2
        runner.step()
        self.assertEqual("POSITIONED_AT_STOP", built.agent.movement)


if __name__ == "__main__":
    unittest.main()


class StatusPublishingTests(unittest.TestCase):
    def test_each_step_publishes_a_snapshot_for_the_status_page(self) -> None:
        from bus_agent.status_page import StatusBoard

        built, backend, clock = rig()
        board = StatusBoard()
        runner = Runner(built, queue.Queue(), board=board, clock=clock)
        self.assertEqual({"ageSeconds": None}, board.read())
        clock.now += 0.2
        runner.step()
        data = board.read()
        self.assertEqual("AV-095-01", data["busId"])
        self.assertTrue(data["simulated"])
        self.assertIsNotNone(data["decision"])
        self.assertIsNotNone(data["beam"])
