"""The marker lasers: on while the ramp is out or moving, and for a short while after it is stowed."""

import unittest

from bus_agent import ramp as ramp_sim
from bus_agent.lasers import LaserMarker

TICK = 0.2
HOLD = 4.0
FIRMWARE_TIMEOUT = 2.0  # the ESP32 turns the lasers off after about this long without a command


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class Sink:
    """Stands in for the ESP32's serial port: records what was sent and can fail like an unplugged one."""

    def __init__(self, clock: Clock) -> None:
        self.clock = clock
        self.sent: list = []
        self.failing = False

    def send(self, command: str) -> None:
        if self.failing:
            raise OSError(5, "Input/output error")
        self.sent.append((self.clock.now, command))

    def commands(self) -> list:
        return [command for _, command in self.sent]


def make():
    clock = Clock()
    sink = Sink(clock)
    return LaserMarker(sink.send, clock=clock, hold_seconds=HOLD), sink, clock


def run(marker: LaserMarker, clock: Clock, state: str, seconds: float) -> None:
    for _ in range(round(seconds / TICK)):
        clock.now += TICK
        marker.update(state)


class WhenTheyAreOn(unittest.TestCase):
    def test_nothing_is_sent_while_the_ramp_is_stowed(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.STOWED, 5)
        self.assertEqual([], sink.sent)

    def test_they_come_on_at_once_when_a_deployment_is_requested(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYMENT_REQUESTED, TICK)
        self.assertEqual(["LASERS ON"], sink.commands())

    def test_they_stay_on_while_deploying_fully_deployed_and_halted(self) -> None:
        for state in (ramp_sim.DEPLOYING, ramp_sim.DEPLOYED, ramp_sim.HALTED):
            with self.subTest(state=state):
                marker, sink, clock = make()
                run(marker, clock, state, 5)
                self.assertTrue(sink.sent)
                self.assertEqual({"LASERS ON"}, set(sink.commands()))

    def test_an_unknown_state_counts_as_out_because_marking_the_zone_is_the_safe_side(self) -> None:
        for state in ("SOMETHING_NEW", None, ""):
            with self.subTest(state=state):
                marker, sink, clock = make()
                run(marker, clock, state, TICK)
                self.assertEqual(["LASERS ON"], sink.commands())


class HowOften(unittest.TestCase):
    def test_the_command_is_refreshed_inside_the_firmware_watchdog_but_not_every_tick(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYED, 10)
        times = [moment for moment, _ in sink.sent]
        gaps = [later - earlier for earlier, later in zip(times, times[1:])]
        self.assertLess(max(gaps), FIRMWARE_TIMEOUT / 2, "must stay well inside the ESP32's 2 s watchdog")
        self.assertGreater(min(gaps), TICK * 1.5, "must not send on every tick")


class RetractionStandIn(unittest.TestCase):
    """The simulated ramp retracts in one tick, so the lasers stay on for a while as a stand-in."""

    def test_they_stay_on_for_the_hold_after_a_stow_then_go_off_once(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYED, 2)
        stowed_at = clock.now
        run(marker, clock, ramp_sim.STOWED, HOLD - 1)
        self.assertNotIn("LASERS OFF", sink.commands(), "still inside the hold")
        run(marker, clock, ramp_sim.STOWED, 3)
        self.assertEqual(1, sink.commands().count("LASERS OFF"))
        off_at = next(moment for moment, command in sink.sent if command == "LASERS OFF")
        self.assertAlmostEqual(HOLD, off_at - stowed_at, delta=0.5)

    def test_nothing_more_is_sent_after_they_are_off(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYED, 1)
        run(marker, clock, ramp_sim.STOWED, HOLD + 1)
        count = len(sink.sent)
        run(marker, clock, ramp_sim.STOWED, 5)
        self.assertEqual(count, len(sink.sent))

    def test_a_new_deployment_during_the_hold_keeps_them_on_without_turning_them_off(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYED, 1)
        run(marker, clock, ramp_sim.STOWED, 2)
        run(marker, clock, ramp_sim.DEPLOYMENT_REQUESTED, 6)
        self.assertNotIn("LASERS OFF", sink.commands())


class WhenThePortFails(unittest.TestCase):
    def test_a_failing_port_is_never_an_exception(self) -> None:
        marker, sink, clock = make()
        sink.failing = True
        run(marker, clock, ramp_sim.DEPLOYING, 3)  # must not raise
        self.assertEqual([], sink.sent)

    def test_the_failure_is_logged_once_not_on_every_attempt(self) -> None:
        marker, sink, clock = make()
        sink.failing = True
        with self.assertLogs("bus_agent.lasers", level="WARNING") as logs:
            run(marker, clock, ramp_sim.DEPLOYING, 5)
        self.assertEqual(1, len(logs.records))

    def test_it_recovers_by_itself_when_the_port_works_again(self) -> None:
        marker, sink, clock = make()
        sink.failing = True
        with self.assertLogs("bus_agent.lasers", level="WARNING"):
            run(marker, clock, ramp_sim.DEPLOYING, 2)
        sink.failing = False
        run(marker, clock, ramp_sim.DEPLOYING, 2)
        self.assertIn("LASERS ON", sink.commands())

    def test_a_failed_off_is_not_retried_forever_the_firmware_turns_them_off_by_itself(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYED, 1)
        sink.failing = True
        with self.assertLogs("bus_agent.lasers", level="WARNING"):
            run(marker, clock, ramp_sim.STOWED, HOLD + 2)
        sink.failing = False
        before = len(sink.sent)
        run(marker, clock, ramp_sim.STOWED, 3)
        self.assertEqual(before, len(sink.sent))


class Shutdown(unittest.TestCase):
    def test_closing_turns_them_off_if_they_were_on(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYING, 1)
        marker.close()
        self.assertEqual("LASERS OFF", sink.commands()[-1])

    def test_closing_sends_nothing_if_they_were_never_on(self) -> None:
        marker, sink, clock = make()
        marker.close()
        self.assertEqual([], sink.sent)

    def test_closing_never_raises_on_a_dead_port(self) -> None:
        marker, sink, clock = make()
        run(marker, clock, ramp_sim.DEPLOYING, 1)
        sink.failing = True
        with self.assertLogs("bus_agent.lasers", level="WARNING"):
            marker.close()


if __name__ == "__main__":
    unittest.main()
