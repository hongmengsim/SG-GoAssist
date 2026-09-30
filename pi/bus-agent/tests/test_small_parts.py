"""Ramp state machine, request signing and the on-change posting policy."""

import unittest

from bus_agent.posting import ChangeGate
from bus_agent.ramp import RampSim, request_deployment, step, stow
from bus_agent.signing import sign_body, signed_headers

CONTINUE = "CONTINUE"
HALT = "HALT"
SECONDS = 4.0


class RampTests(unittest.TestCase):
    def test_it_starts_stowed(self) -> None:
        self.assertEqual("STOWED", RampSim().state)

    def test_a_deployment_can_only_be_requested_from_stowed(self) -> None:
        requested = request_deployment(RampSim())
        self.assertEqual("DEPLOYMENT_REQUESTED", requested.state)
        self.assertEqual(requested, request_deployment(requested))

    def test_a_request_with_permission_deploys_over_time(self) -> None:
        ramp = request_deployment(RampSim())
        ramp = step(ramp, CONTINUE, (), 1.0, SECONDS)
        self.assertEqual("DEPLOYING", ramp.state)
        self.assertAlmostEqual(0.25, ramp.progress)
        for _ in range(3):
            ramp = step(ramp, CONTINUE, (), 1.0, SECONDS)
        self.assertEqual("DEPLOYED", ramp.state)
        self.assertEqual(1.0, ramp.progress)

    def test_a_halt_before_starting_holds_the_ramp_with_the_reasons(self) -> None:
        ramp = step(request_deployment(RampSim()), HALT, ("OBJECT_IN_ZONE",), 1.0, SECONDS)
        self.assertEqual("HALTED", ramp.state)
        self.assertEqual(("OBJECT_IN_ZONE",), ramp.halt_reasons)
        self.assertEqual(0.0, ramp.progress)

    def test_a_halt_mid_deployment_stops_progress_and_it_resumes_when_clear(self) -> None:
        ramp = step(request_deployment(RampSim()), CONTINUE, (), 2.0, SECONDS)
        halted = step(ramp, HALT, ("TOF_BLOCKED",), 5.0, SECONDS)
        self.assertEqual("HALTED", halted.state)
        self.assertAlmostEqual(0.5, halted.progress)
        resumed = step(halted, CONTINUE, (), 1.0, SECONDS)
        self.assertEqual("DEPLOYING", resumed.state)
        self.assertAlmostEqual(0.75, resumed.progress)
        self.assertEqual((), resumed.halt_reasons)

    def test_a_deployed_or_stowed_ramp_ignores_the_gate(self) -> None:
        deployed = RampSim("DEPLOYED", 1.0)
        self.assertEqual(deployed, step(deployed, HALT, ("OBJECT_IN_ZONE",), 1.0, SECONDS))
        stowed = RampSim()
        self.assertEqual(stowed, step(stowed, CONTINUE, (), 1.0, SECONDS))

    def test_stow_returns_any_state_to_stowed(self) -> None:
        for state in ("DEPLOYMENT_REQUESTED", "DEPLOYING", "DEPLOYED", "HALTED"):
            with self.subTest(state=state):
                self.assertEqual(RampSim(), stow(RampSim(state, 0.5, ("X",))))

    def test_steps_do_not_change_the_ramp_they_were_given(self) -> None:
        ramp = request_deployment(RampSim())
        step(ramp, CONTINUE, (), 1.0, SECONDS)
        self.assertEqual("DEPLOYMENT_REQUESTED", ramp.state)

    def test_a_bad_step_size_or_duration_never_advances_the_ramp(self) -> None:
        ramp = request_deployment(RampSim())
        for dt, seconds in ((-1.0, SECONDS), (float("nan"), SECONDS), (1.0, 0.0), (1.0, float("nan"))):
            with self.subTest(dt=dt, seconds=seconds):
                self.assertNotEqual("DEPLOYED", step(ramp, CONTINUE, (), dt, seconds).state)


class SigningTests(unittest.TestCase):
    def test_it_matches_the_backends_signature(self) -> None:
        # Computed with Node's crypto for the same inputs, the way backend/src/routes/auth.ts does.
        signature = sign_body("test-secret", "AV-095-01", "1800000000000", b'{"a":1}')
        self.assertEqual("3504562de6d878f1d72e1f42f89660730f8524c4fe8496b9d72049437b9eb607", signature)

    def test_the_http_signature_binds_the_method_and_path_and_matches_the_backend(self) -> None:
        # Computed with Node's crypto over "AV-095-01.1800000000000.POST./api/operations/vehicles/AV-095-01/status."
        # followed by the body, the way backend/src/routes/auth.ts does.
        path = "/api/operations/vehicles/AV-095-01/status"
        signature = sign_body("test-secret", "AV-095-01", "1800000000000", b'{"a":1}', "POST", path)
        self.assertEqual("92b4562afbc3383a62d656d9cf320c436fc45679cb34edb5ec309bf7cf40cd54", signature)
        for other in (
            sign_body("test-secret", "AV-095-01", "1800000000000", b'{"a":1}', "GET", path),
            sign_body("test-secret", "AV-095-01", "1800000000000", b'{"a":1}', "POST", path + "x"),
            sign_body("test-secret", "AV-095-01", "1800000000000", b'{"a":1}'),
        ):
            self.assertNotEqual(signature, other)

    def test_headers_carry_the_device_id_timestamp_and_signature(self) -> None:
        headers = signed_headers("s", "AV-095-01", b"{}", now_ms=1_800_000_000_000)
        self.assertEqual("AV-095-01", headers["x-device-id"])
        self.assertEqual("1800000000000", headers["x-timestamp"])
        self.assertEqual(sign_body("s", "AV-095-01", "1800000000000", b"{}"), headers["x-signature"])

    def test_no_secret_means_no_signature_headers(self) -> None:
        self.assertEqual({}, signed_headers(None, "AV-095-01", b"{}", now_ms=1))

    def test_a_different_body_gives_a_different_signature(self) -> None:
        self.assertNotEqual(
            sign_body("s", "d", "1", b'{"a":1}'), sign_body("s", "d", "1", b'{"a":2}')
        )


class ChangeGateTests(unittest.TestCase):
    def make(self, heartbeat=5.0):
        self.now = 0.0
        return ChangeGate(heartbeat_seconds=heartbeat, clock=lambda: self.now)

    def test_the_first_report_is_always_sent(self) -> None:
        self.assertTrue(self.make().due("bus", {"movement": "DEPARTING"}))

    def test_an_unchanged_report_waits_for_the_heartbeat(self) -> None:
        gate = self.make()
        payload = {"movement": "DEPARTING"}
        self.assertTrue(gate.due("bus", payload))
        gate.sent("bus", payload)
        self.now = 4.9
        self.assertFalse(gate.due("bus", payload))
        self.now = 5.0
        self.assertTrue(gate.due("bus", payload))

    def test_a_change_is_sent_at_once(self) -> None:
        gate = self.make()
        gate.sent("bus", {"movement": "DEPARTING"})
        self.now = 0.1
        self.assertTrue(gate.due("bus", {"movement": "POSITIONED_AT_STOP"}))

    def test_the_observed_time_is_not_a_change(self) -> None:
        gate = self.make()
        gate.sent("bus", {"movement": "X", "observedAt": "t1"})
        self.now = 1.0
        self.assertFalse(gate.due("bus", {"movement": "X", "observedAt": "t2"}))

    def decision(self, distance_mm, confidence, beam="BEAM_CLEAR", class_name="person"):
        return {
            "zoneState": "OCCUPIED",
            "permission": "HALT",
            "reasons": ["OBJECT_IN_ZONE"],
            "tof": {"state": beam, "distanceMm": distance_mm, "simulated": False},
            "camera": {"imageOk": True},
            "objectsInZone": [{"className": class_name, "safety": "UNSAFE", "confidence": confidence}],
            "simulated": False,
            "observedAt": "t",
        }

    def test_jittering_measurements_are_not_a_change(self) -> None:
        # Real sensors move the beam distance and the detection confidence on every reading; sending
        # each one would post several times a second (5,174 audit entries in 26 minutes on the Pi).
        gate = self.make()
        gate.sent("safety-decision", self.decision(253, 0.61))
        self.now = 0.3
        self.assertFalse(gate.due("safety-decision", self.decision(256, 0.63)))
        self.now = 4.9
        self.assertFalse(gate.due("safety-decision", self.decision(249, 0.58)))

    def test_measurements_are_still_refreshed_by_the_heartbeat(self) -> None:
        gate = self.make()
        gate.sent("safety-decision", self.decision(253, 0.61))
        self.now = 5.0
        self.assertTrue(gate.due("safety-decision", self.decision(256, 0.63)))

    def test_a_beam_state_change_is_sent_at_once(self) -> None:
        gate = self.make()
        gate.sent("safety-decision", self.decision(253, 0.61))
        self.now = 0.3
        self.assertTrue(gate.due("safety-decision", self.decision(31, 0.61, beam="BLOCKED")))

    def test_a_different_detected_class_is_sent_at_once(self) -> None:
        gate = self.make()
        gate.sent("safety-decision", self.decision(253, 0.61))
        self.now = 0.3
        self.assertTrue(gate.due("safety-decision", self.decision(253, 0.61, class_name="airplane")))

    def test_a_report_that_was_not_confirmed_is_offered_again(self) -> None:
        gate = self.make()
        payload = {"movement": "X"}
        self.assertTrue(gate.due("bus", payload))
        self.assertTrue(gate.due("bus", payload), "not marked sent, so still due")

    def test_keys_are_independent(self) -> None:
        gate = self.make()
        gate.sent("bus", {"a": 1})
        self.assertTrue(gate.due("ramp", {"a": 1}))


if __name__ == "__main__":
    unittest.main()
