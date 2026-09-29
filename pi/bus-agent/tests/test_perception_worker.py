"""The perception worker: capture and detection run off the safety loop; the agent reads the latest."""

import threading
import time
import unittest

from perception import StubDetector, analyse

from bus_agent.perception_worker import PerceptionWorker
from bus_agent.sim_sensors import Capture, SimFrame, SimulatedCamera
from tests.test_agent import REQUEST_EVENT, STOP, World

POLYGON = [(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)]


def wait_for(condition, seconds=3.0) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if condition():
            return True
        time.sleep(0.01)
    return False


class WorkerTests(unittest.TestCase):
    def make(self, camera, detector):
        worker = PerceptionWorker(camera, detector, POLYGON, period_seconds=0.01)
        self.addCleanup(worker.stop)
        return worker

    def test_it_publishes_the_latest_result_with_its_capture_time(self) -> None:
        camera = SimulatedCamera(time.monotonic)
        worker = self.make(camera, camera)
        self.assertIsNone(worker.latest_perception())
        worker.start()
        self.assertTrue(wait_for(lambda: worker.latest_perception() is not None))
        result, captured_at = worker.latest_perception()
        self.assertTrue(result.image_ok)
        self.assertEqual((), result.objects)
        self.assertLessEqual(captured_at, time.monotonic())

    def test_a_detection_appears_in_a_later_result(self) -> None:
        camera = SimulatedCamera(time.monotonic)
        worker = self.make(camera, camera)
        worker.start()
        camera.place("person")

        def has_object() -> bool:
            latest = worker.latest_perception()
            return latest is not None and bool(latest[0].objects)

        self.assertTrue(wait_for(has_object))
        self.assertEqual("UNSAFE", worker.latest_perception()[0].objects[0].safety)

    def test_a_slow_detector_never_blocks_the_reader(self) -> None:
        release = threading.Event()

        class Slow:
            def detect(self, frame):
                release.wait(5)
                return []

        worker = self.make(SimulatedCamera(time.monotonic), Slow())
        worker.start()
        started = time.monotonic()
        for _ in range(100):
            worker.latest_perception()
        self.assertLess(time.monotonic() - started, 0.2)
        release.set()

    def test_a_missing_frame_is_published_as_unavailable(self) -> None:
        class NoFrames:
            simulated = False

            def capture(self):
                return Capture(None, time.monotonic())

        worker = self.make(NoFrames(), StubDetector([]))
        worker.start()
        self.assertTrue(wait_for(lambda: worker.latest_perception() is not None))
        result, _ = worker.latest_perception()
        self.assertFalse(result.image_ok)
        self.assertIsNone(result.objects)

    def test_a_camera_that_raises_does_not_kill_the_worker(self) -> None:
        state = {"n": 0}

        class Flaky:
            simulated = False

            def capture(self):
                state["n"] += 1
                if state["n"] < 3:
                    raise OSError("glitch")
                return Capture(SimFrame(), time.monotonic())

        worker = self.make(Flaky(), StubDetector([]))
        worker.start()

        def recovered() -> bool:
            latest = worker.latest_perception()
            return latest is not None and latest[0].image_ok

        self.assertTrue(wait_for(recovered))

    def test_it_reports_the_simulated_flag_of_its_camera(self) -> None:
        self.assertTrue(self.make(SimulatedCamera(time.monotonic), StubDetector([])).simulated)

    def test_stop_ends_the_thread(self) -> None:
        worker = self.make(SimulatedCamera(time.monotonic), StubDetector([]))
        worker.start()
        worker.stop()
        self.assertFalse(worker.running)


class Fixed:
    """Stands in for a worker whose result the test sets by hand."""

    simulated = True
    result = None

    def latest_perception(self):
        return self.result


class AgentWithWorkerTests(unittest.TestCase):
    def test_the_agent_decides_from_the_latest_result_and_its_age(self) -> None:
        world = World()
        fixed = Fixed()
        world.agent._camera = fixed
        world.agent.arrive(STOP)
        world.agent.handle_event(REQUEST_EVENT)
        for _ in range(4):
            fixed.result = (analyse(SimFrame(), world.camera, POLYGON, clock=lambda: "t"), world.clock())
            world.tick()
        self.assertEqual("CONTINUE", world.agent.last_decision.permission)
        world.now += 3.0  # the worker stopped producing: the newest result ages and the gate halts
        world.agent.tick()
        self.assertIn("CAMERA_DEGRADED", world.agent.last_decision.reasons)

    def test_no_result_yet_is_a_halt_not_a_pass(self) -> None:
        world = World()
        world.agent._camera = Fixed()
        world.agent.arrive(STOP)
        world.tick()
        self.assertEqual("HALT", world.agent.last_decision.permission)
        self.assertIn("CAMERA_DEGRADED", world.agent.last_decision.reasons)


if __name__ == "__main__":
    unittest.main()
