import unittest
from dataclasses import dataclass

from perception import (
    Policy,
    RawDetection,
    StubDetector,
    analyse,
    check_image_health,
)

POLYGON = [(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)]
NOW = "2026-09-30T00:00:00.000Z"


@dataclass
class FakeFrame:
    """Stands in for a numpy image: only the statistics the health check reads."""

    mean_value: float = 100.0
    std_value: float = 40.0
    size: int = 640 * 480

    def mean(self) -> float:
        return self.mean_value

    def std(self) -> float:
        return self.std_value


def run(frame, detections, policy=None):
    kwargs = {} if policy is None else {"policy": policy}
    return analyse(frame, StubDetector(detections), POLYGON, clock=lambda: NOW, **kwargs)


def raw(name, confidence=0.9, box=(0.5, 0.5, 0.1, 0.1)):
    return RawDetection(class_name=name, confidence=confidence, box_norm=box)


class HealthTests(unittest.TestCase):
    def test_a_normal_frame_is_healthy(self) -> None:
        self.assertEqual((True, None), check_image_health(FakeFrame()))

    def test_bad_frames_are_reported_with_a_reason(self) -> None:
        cases = [
            ("no_frame", None),
            ("no_frame", FakeFrame(size=0)),
            ("too_dark", FakeFrame(mean_value=2.0)),
            ("overexposed", FakeFrame(mean_value=252.0)),
            ("low_contrast_or_blocked", FakeFrame(std_value=1.0)),
        ]
        for reason, frame in cases:
            with self.subTest(reason=reason):
                ok, why = check_image_health(frame)
                self.assertFalse(ok)
                self.assertEqual(reason, why)

    def test_a_frame_whose_statistics_fail_is_not_healthy(self) -> None:
        class Broken(FakeFrame):
            def mean(self) -> float:
                raise ValueError("bad frame")

        self.assertEqual((False, "no_frame"), check_image_health(Broken()))

    def test_nan_statistics_are_not_healthy(self) -> None:
        self.assertFalse(check_image_health(FakeFrame(mean_value=float("nan")))[0])


class AnalyseTests(unittest.TestCase):
    def test_an_empty_healthy_frame_reports_an_empty_list_not_none(self) -> None:
        result = run(FakeFrame(), [])
        self.assertTrue(result.image_ok)
        self.assertIsNone(result.degraded_reason)
        self.assertEqual((), result.objects)
        self.assertEqual(NOW, result.observed_at)

    def test_each_object_gets_a_verdict_and_a_zone_flag(self) -> None:
        detections = [
            raw("person", 0.9, (0.5, 0.5, 0.2, 0.4)),
            raw("leaf", 0.97, (0.1, 0.1, 0.05, 0.05)),
        ]
        person, leaf = run(FakeFrame(), detections).objects
        self.assertEqual(("person", "UNSAFE", True), (person.class_name, person.safety, person.in_zone))
        self.assertEqual(("leaf", "SAFE", False), (leaf.class_name, leaf.safety, leaf.in_zone))

    def test_an_object_overlapping_only_the_edge_is_in_the_zone(self) -> None:
        result = run(FakeFrame(), [raw("bicycle", 0.8, (0.2, 0.5, 0.2, 0.2))])
        self.assertTrue(result.objects[0].in_zone)

    def test_an_unmapped_class_is_kept_and_unsafe(self) -> None:
        result = run(FakeFrame(), [raw("teddy bear")])
        self.assertEqual("UNSAFE", result.objects[0].safety)

    def test_a_low_confidence_leaf_is_unsafe(self) -> None:
        result = run(FakeFrame(), [raw("leaf", 0.6)])
        self.assertEqual("UNSAFE", result.objects[0].safety)

    def test_a_custom_policy_is_used(self) -> None:
        policy = Policy(safe_classes=frozenset({"bottle"}), min_safe_confidence=0.5)
        result = run(FakeFrame(), [raw("bottle", 0.6)], policy)
        self.assertEqual("SAFE", result.objects[0].safety)

    def test_an_unhealthy_frame_reports_no_objects_and_a_reason(self) -> None:
        result = run(FakeFrame(mean_value=1.0), [raw("person")])
        self.assertFalse(result.image_ok)
        self.assertEqual("too_dark", result.degraded_reason)
        self.assertIsNone(result.objects, "an untrusted frame must never read as empty")

    def test_a_missing_frame_reports_no_objects(self) -> None:
        result = run(None, [raw("person")])
        self.assertFalse(result.image_ok)
        self.assertIsNone(result.objects)

    def test_a_detector_that_fails_never_reads_as_empty(self) -> None:
        class Failing:
            def detect(self, frame):
                raise RuntimeError("model crashed")

        result = analyse(FakeFrame(), Failing(), POLYGON, clock=lambda: NOW)
        self.assertFalse(result.image_ok)
        self.assertEqual("inference_error", result.degraded_reason)
        self.assertIsNone(result.objects)

    def test_a_detection_with_bad_numbers_is_kept_as_unsafe_in_zone(self) -> None:
        bad = raw("leaf", 0.99, (float("nan"), 0.5, 0.1, 0.1))
        result = run(FakeFrame(), [bad])
        self.assertEqual("UNSAFE", result.objects[0].safety)
        self.assertTrue(result.objects[0].in_zone)

    def test_a_degenerate_zone_puts_everything_in_the_zone(self) -> None:
        result = analyse(FakeFrame(), StubDetector([raw("leaf", 0.99, (0.9, 0.9, 0.01, 0.01))]),
                         [(0.0, 0.0)], clock=lambda: NOW)
        self.assertTrue(result.objects[0].in_zone)

    def test_the_result_can_be_read_by_the_safety_gate_after_a_simple_conversion(self) -> None:
        result = run(FakeFrame(), [raw("person")])
        item = result.objects[0]
        self.assertEqual({"class_name", "safety", "confidence", "in_zone", "box_norm"},
                         set(item.__dataclass_fields__))


if __name__ == "__main__":
    unittest.main()
