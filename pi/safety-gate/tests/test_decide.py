"""Behaviour of the ramp safety gate. Pure logic: no hardware, network or model."""

import itertools
import math
import unittest

from safety_gate import (
    BeamInput,
    BusContext,
    CameraInput,
    DetectedObject,
    GateConfig,
    decide,
)

GOOD_CAMERA = CameraInput(image_ok=True, degraded_reason=None, age_seconds=0.2, objects=())
CLEAR_BEAM = BeamInput(state="BEAM_CLEAR", distance_mm=800)
READY = BusContext(movement="POSITIONED_AT_STOP", has_accepted_request=True)


def camera(objects=(), **overrides):
    values = dict(image_ok=True, degraded_reason=None, age_seconds=0.2, objects=tuple(objects))
    values.update(overrides)
    return CameraInput(**values)


def obj(class_name="person", safety="UNSAFE", confidence=0.9, in_zone=True):
    return DetectedObject(class_name=class_name, safety=safety, confidence=confidence, in_zone=in_zone)


class ContinueTests(unittest.TestCase):
    def test_everything_clear_and_ready_continues(self):
        decision = decide(GOOD_CAMERA, CLEAR_BEAM, READY)
        self.assertEqual("CLEAR", decision.zone_state)
        self.assertEqual("CONTINUE", decision.permission)
        self.assertEqual((), decision.reasons)

    def test_an_object_outside_the_zone_does_not_halt(self):
        decision = decide(camera([obj(in_zone=False)]), CLEAR_BEAM, READY)
        self.assertEqual("CONTINUE", decision.permission)

    def test_a_safe_object_alone_in_the_zone_with_a_clear_beam_continues(self):
        leaf = obj("leaf", safety="SAFE", confidence=0.97)
        decision = decide(camera([leaf]), CLEAR_BEAM, READY)
        self.assertEqual("CONTINUE", decision.permission)
        self.assertEqual("leaf", decision.objects_in_zone[0].class_name)


class ObjectTests(unittest.TestCase):
    def test_one_unsafe_object_halts_even_when_the_beam_is_clear(self):
        decision = decide(camera([obj()]), CLEAR_BEAM, READY)
        self.assertEqual("OCCUPIED", decision.zone_state)
        self.assertEqual("HALT", decision.permission)
        self.assertIn("OBJECT_IN_ZONE", decision.reasons)

    def test_a_safe_object_never_hides_an_unsafe_one(self):
        objects = [obj("leaf", "SAFE"), obj("person", "UNSAFE")]
        decision = decide(camera(objects), CLEAR_BEAM, READY)
        self.assertEqual("HALT", decision.permission)
        self.assertIn("OBJECT_IN_ZONE", decision.reasons)

    def test_a_missing_or_unknown_verdict_counts_as_unsafe(self):
        for verdict in ("", "safe", "MAYBE", None):
            with self.subTest(verdict=verdict):
                decision = decide(camera([obj(safety=verdict)]), CLEAR_BEAM, READY)
                self.assertEqual("HALT", decision.permission)

    def test_an_unsafe_object_is_reported_even_if_the_camera_is_degraded(self):
        decision = decide(camera([obj()], degraded_reason="LOW_LIGHT"), CLEAR_BEAM, READY)
        self.assertEqual("OCCUPIED", decision.zone_state)
        self.assertIn("OBJECT_IN_ZONE", decision.reasons)
        self.assertIn("CAMERA_DEGRADED", decision.reasons)

    def test_out_of_range_confidence_is_clamped_for_the_report(self):
        for raw, expected in ((5.0, 1.0), (-1.0, 0.0), (math.nan, 0.0)):
            with self.subTest(raw=raw):
                decision = decide(camera([obj(confidence=raw)]), CLEAR_BEAM, READY)
                self.assertEqual(expected, decision.objects_in_zone[0].confidence)


class BeamTests(unittest.TestCase):
    def test_every_beam_state_other_than_clear_halts(self):
        expected = {
            "BLOCKED": "TOF_BLOCKED",
            "UNCALIBRATED": "TOF_NOT_CALIBRATED",
            "UNKNOWN": "TOF_UNAVAILABLE",
            "CHECKING": "TOF_UNAVAILABLE",
            "SOMETHING_NEW": "TOF_UNAVAILABLE",
            None: "TOF_UNAVAILABLE",
        }
        for state, reason in expected.items():
            with self.subTest(state=state):
                decision = decide(GOOD_CAMERA, BeamInput(state=state), READY)
                self.assertEqual("HALT", decision.permission)
                self.assertIn(reason, decision.reasons)
                self.assertNotEqual("CLEAR", decision.zone_state)

    def test_a_blocked_beam_with_a_healthy_empty_camera_is_a_disagreement(self):
        decision = decide(GOOD_CAMERA, BeamInput(state="BLOCKED", distance_mm=200), READY)
        self.assertEqual("UNCERTAIN", decision.zone_state)
        self.assertIn("SENSORS_DISAGREE", decision.reasons)
        self.assertIn("TOF_BLOCKED", decision.reasons)

    def test_a_blocked_beam_with_no_usable_camera_is_occupied(self):
        decision = decide(None, BeamInput(state="BLOCKED"), READY)
        self.assertEqual("OCCUPIED", decision.zone_state)

    def test_a_blocked_beam_and_an_unsafe_object_agree(self):
        decision = decide(camera([obj()]), BeamInput(state="BLOCKED"), READY)
        self.assertEqual("OCCUPIED", decision.zone_state)
        self.assertNotIn("SENSORS_DISAGREE", decision.reasons)

    def test_the_simulated_flag_is_carried_into_the_decision(self):
        decision = decide(GOOD_CAMERA, BeamInput(state="BEAM_CLEAR", simulated=True), READY)
        self.assertTrue(decision.simulated)
        self.assertTrue(decision.beam.simulated)


class CameraTests(unittest.TestCase):
    def test_no_camera_halts_as_degraded(self):
        decision = decide(None, CLEAR_BEAM, READY)
        self.assertEqual("UNCERTAIN", decision.zone_state)
        self.assertEqual("HALT", decision.permission)
        self.assertIn("CAMERA_DEGRADED", decision.reasons)
        self.assertFalse(decision.camera_image_ok)

    def test_an_unhealthy_camera_halts(self):
        cases = [
            camera(image_ok=False),
            camera(degraded_reason="COVERED"),
            camera(age_seconds=None),
            camera(age_seconds=5.0),
            camera(age_seconds=-1.0),
            camera(age_seconds=math.nan),
            CameraInput(image_ok=True, degraded_reason=None, age_seconds=0.1, objects=None),
        ]
        for index, case in enumerate(cases):
            with self.subTest(case=index):
                decision = decide(case, CLEAR_BEAM, READY)
                self.assertEqual("HALT", decision.permission)
                self.assertIn("CAMERA_DEGRADED", decision.reasons)
                self.assertEqual("UNCERTAIN", decision.zone_state)

    def test_the_freshness_limit_is_configurable(self):
        stale = camera(age_seconds=2.0)
        self.assertEqual("HALT", decide(stale, CLEAR_BEAM, READY).permission)
        relaxed = GateConfig(max_camera_age_seconds=3.0)
        self.assertEqual("CONTINUE", decide(stale, CLEAR_BEAM, READY, relaxed).permission)

    def test_the_degraded_reason_is_reported(self):
        decision = decide(camera(degraded_reason="COVERED"), CLEAR_BEAM, READY)
        self.assertEqual("COVERED", decision.camera_degraded_reason)


class ContextTests(unittest.TestCase):
    def test_a_bus_that_is_not_positioned_halts(self):
        for movement in ("TRAVELLING_TO_STOP", "DEPARTING", "UNKNOWN", None):
            with self.subTest(movement=movement):
                context = BusContext(movement=movement, has_accepted_request=True)
                decision = decide(GOOD_CAMERA, CLEAR_BEAM, context)
                self.assertEqual("HALT", decision.permission)
                self.assertIn("BUS_NOT_AT_BOARDING_POSITION", decision.reasons)

    def test_a_bus_waiting_for_the_bay_halts_with_that_reason(self):
        context = BusContext(movement="WAITING_FOR_BAY", has_accepted_request=True)
        decision = decide(GOOD_CAMERA, CLEAR_BEAM, context)
        self.assertIn("WAITING_FOR_BAY", decision.reasons)
        self.assertNotIn("BUS_NOT_AT_BOARDING_POSITION", decision.reasons)

    def test_no_accepted_request_halts(self):
        context = BusContext(movement="POSITIONED_AT_STOP", has_accepted_request=False)
        decision = decide(GOOD_CAMERA, CLEAR_BEAM, context)
        self.assertEqual("HALT", decision.permission)
        self.assertIn("NO_ACCEPTED_REQUEST", decision.reasons)
        self.assertEqual("CLEAR", decision.zone_state)

    def test_an_operator_halt_overrides_a_clear_zone(self):
        context = BusContext("POSITIONED_AT_STOP", True, operator_halt=True)
        decision = decide(GOOD_CAMERA, CLEAR_BEAM, context)
        self.assertEqual("HALT", decision.permission)
        self.assertIn("OPERATOR_HALT", decision.reasons)

    def test_a_truthy_but_not_true_request_flag_does_not_count(self):
        context = BusContext("POSITIONED_AT_STOP", has_accepted_request="yes")
        self.assertEqual("HALT", decide(GOOD_CAMERA, CLEAR_BEAM, context).permission)

    def test_reasons_are_listed_in_a_stable_order_without_repeats(self):
        context = BusContext("TRAVELLING_TO_STOP", False, operator_halt=True)
        decision = decide(None, BeamInput(state="UNKNOWN"), context)
        self.assertEqual(len(decision.reasons), len(set(decision.reasons)))
        self.assertEqual(decision.reasons, decide(None, BeamInput(state="UNKNOWN"), context).reasons)


class ReportTests(unittest.TestCase):
    def test_the_report_uses_the_contract_field_names(self):
        decision = decide(camera([obj(confidence=0.93)]), BeamInput("BLOCKED", 340, True), READY)
        report = decision.to_report("2026-09-30T00:00:00.000Z")
        self.assertEqual("OCCUPIED", report["zoneState"])
        self.assertEqual("HALT", report["permission"])
        self.assertEqual({"state": "BLOCKED", "distanceMm": 340, "simulated": True}, report["tof"])
        self.assertEqual({"imageOk": True}, report["camera"])
        self.assertEqual("person", report["objectsInZone"][0]["className"])
        self.assertEqual("UNSAFE", report["objectsInZone"][0]["safety"])
        self.assertTrue(report["simulated"])
        self.assertNotIn("busId", report)

    def test_the_report_omits_optional_fields_that_are_absent(self):
        report = decide(GOOD_CAMERA, CLEAR_BEAM, READY).to_report("2026-09-30T00:00:00.000Z")
        self.assertNotIn("degradedReason", report["camera"])
        self.assertEqual([], report["reasons"])


class ExhaustiveTests(unittest.TestCase):
    """Every combination of the inputs that matter obeys the safety invariants."""

    BEAMS = ["BEAM_CLEAR", "BLOCKED", "CHECKING", "UNCALIBRATED", "UNKNOWN", None, "??"]
    CAMERAS = {
        "none": None,
        "good_empty": camera(),
        "good_unsafe": camera([obj()]),
        "good_safe_only": camera([obj("leaf", "SAFE", 0.99)]),
        "degraded": camera(degraded_reason="COVERED"),
        "stale": camera(age_seconds=9.0),
        "no_objects": CameraInput(True, None, 0.1, None),
        "image_bad": camera(image_ok=False),
    }
    MOVEMENTS = ["POSITIONED_AT_STOP", "WAITING_FOR_BAY", "TRAVELLING_TO_STOP", "DEPARTING", None]

    def all_cases(self):
        return itertools.product(
            self.BEAMS, self.CAMERAS.items(), self.MOVEMENTS, [True, False], [False, True]
        )

    def test_continue_only_when_everything_is_good(self):
        for beam, (name, cam), movement, request, halt in self.all_cases():
            decision = decide(cam, BeamInput(state=beam), BusContext(movement, request, halt))
            everything_good = (
                beam == "BEAM_CLEAR"
                and name in ("good_empty", "good_safe_only")
                and movement == "POSITIONED_AT_STOP"
                and request
                and not halt
            )
            with self.subTest(beam=beam, camera=name, movement=movement, request=request, halt=halt):
                self.assertEqual(everything_good, decision.permission == "CONTINUE")

    def test_continue_means_clear_with_no_reasons_and_halt_always_has_a_reason(self):
        for beam, (name, cam), movement, request, halt in self.all_cases():
            decision = decide(cam, BeamInput(state=beam), BusContext(movement, request, halt))
            with self.subTest(beam=beam, camera=name, movement=movement, request=request, halt=halt):
                if decision.permission == "CONTINUE":
                    self.assertEqual("CLEAR", decision.zone_state)
                    self.assertEqual((), decision.reasons)
                else:
                    self.assertEqual("HALT", decision.permission)
                    self.assertTrue(decision.reasons)

    def test_a_clear_zone_needs_a_clear_beam_and_a_healthy_camera(self):
        for beam, (name, cam), movement, request, halt in self.all_cases():
            decision = decide(cam, BeamInput(state=beam), BusContext(movement, request, halt))
            if decision.zone_state == "CLEAR":
                with self.subTest(beam=beam, camera=name):
                    self.assertEqual("BEAM_CLEAR", beam)
                    self.assertIn(name, ("good_empty", "good_safe_only"))


if __name__ == "__main__":
    unittest.main()
