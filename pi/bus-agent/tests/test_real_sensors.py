"""Real-sensor adapters, tested with fakes. The hardware-facing grabbers and the model loader are
thin and are NOT exercised here; they are checked on a Pi (see docs/runbooks/hardware-bring-up.md).
"""

import math
import unittest

from bus_agent.sensors_real import (
    ModelDetector,
    RealCamera,
    SensorUnavailable,
    map_class_name,
    open_serial_line_source,
)


class Clock:
    now = 10.0

    def __call__(self) -> float:
        return self.now


class FakeFrame:
    size = 100

    def mean(self) -> float:
        return 100.0

    def std(self) -> float:
        return 40.0


class RealCameraTests(unittest.TestCase):
    def test_it_wraps_each_grab_with_the_time_it_was_taken(self) -> None:
        clock = Clock()
        frame = FakeFrame()
        camera = RealCamera(lambda: frame, clock)
        capture = camera.capture()
        self.assertIs(frame, capture.frame)
        self.assertEqual(10.0, capture.captured_at)
        self.assertFalse(camera.simulated)

    def test_a_failed_grab_is_no_frame_never_a_stale_one(self) -> None:
        state = {"fail": False}

        def grab():
            if state["fail"]:
                raise OSError("camera unplugged")
            return FakeFrame()

        camera = RealCamera(grab, Clock())
        self.assertIsNotNone(camera.capture().frame)
        state["fail"] = True
        capture = camera.capture()
        self.assertIsNone(capture.frame)
        self.assertIn("unplugged", camera.last_error)
        state["fail"] = False
        camera.capture()
        self.assertIsNone(camera.last_error)

    def test_a_grabber_returning_nothing_is_no_frame(self) -> None:
        self.assertIsNone(RealCamera(lambda: None, Clock()).capture().frame)

    def test_close_is_passed_to_the_grabber(self) -> None:
        closed = []

        class Grabber:
            def __call__(self):
                return FakeFrame()

            def close(self):
                closed.append(True)

        RealCamera(Grabber(), Clock()).close()
        self.assertEqual([True], closed)


class ModelDetectorTests(unittest.TestCase):
    def detect(self, outputs, **kwargs):
        detector = ModelDetector(lambda frame: outputs, **kwargs)
        return detector.detect(FakeFrame())

    def test_normalised_corner_boxes_become_centre_boxes(self) -> None:
        [item] = self.detect([("person", 0.9, (0.2, 0.3, 0.4, 0.7))])
        self.assertEqual("person", item.class_name)
        self.assertEqual(0.9, item.confidence)
        cx, cy, w, h = item.box_norm
        self.assertAlmostEqual(0.3, cx)
        self.assertAlmostEqual(0.5, cy)
        self.assertAlmostEqual(0.2, w)
        self.assertAlmostEqual(0.4, h)

    def test_detections_below_the_confidence_floor_are_dropped(self) -> None:
        kept = self.detect([("person", 0.2, (0, 0, 1, 1)), ("box", 0.5, (0, 0, 1, 1))], min_confidence=0.3)
        self.assertEqual(["box"], [item.class_name for item in kept])

    def test_coco_names_are_mapped_to_the_ramp_classes_and_unknown_names_pass_through(self) -> None:
        self.assertEqual("bag_or_box", map_class_name("handbag"))
        self.assertEqual("bag_or_box", map_class_name("suitcase"))
        self.assertEqual("teddy bear", map_class_name("teddy bear"))
        self.assertEqual("person", map_class_name("person"))

    def test_a_broken_box_is_passed_on_for_the_pipeline_to_treat_as_unsafe(self) -> None:
        [item] = self.detect([("leaf", 0.99, (float("nan"), 0.1, 0.5, 0.5))])
        self.assertEqual("leaf", item.class_name)
        self.assertTrue(math.isnan(item.box_norm[0]), "NaN is preserved so it cannot pass as valid")

    def test_a_runner_that_fails_raises_so_the_frame_reads_as_unavailable(self) -> None:
        def broken(frame):
            raise RuntimeError("model crashed")

        with self.assertRaises(RuntimeError):
            ModelDetector(broken).detect(FakeFrame())

    def test_a_box_outside_the_image_is_clamped_not_dropped(self) -> None:
        [item] = self.detect([("person", 0.9, (-0.2, 0.1, 1.3, 0.9))])
        cx, cy, w, h = item.box_norm
        self.assertAlmostEqual(0.5, cx)
        self.assertAlmostEqual(1.0, w)


class SerialOpeningTests(unittest.TestCase):
    def test_it_opens_the_port_without_blocking_reads(self) -> None:
        calls = []

        class Port:
            in_waiting = 0

            def read(self, n):
                return b""

        def opener(port, baud, timeout):
            calls.append((port, baud, timeout))
            return Port()

        source = open_serial_line_source("/dev/ttyUSB0", opener=opener)
        self.assertEqual([("/dev/ttyUSB0", 115200, 0)], calls)
        self.assertEqual([], source.read_lines())

    def test_a_port_that_cannot_be_opened_is_a_clear_sensor_error(self) -> None:
        def opener(port, baud, timeout):
            raise OSError("permission denied")

        with self.assertRaisesRegex(SensorUnavailable, "ttyUSB0.*permission denied"):
            open_serial_line_source("/dev/ttyUSB0", opener=opener)


if __name__ == "__main__":
    unittest.main()
