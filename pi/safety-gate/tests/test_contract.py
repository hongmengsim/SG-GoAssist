"""Every decision the gate can make must be a valid RampSafetyReport.

The schema is generated from the TypeScript contract (contracts/schema), so a field rename
there fails this test instead of failing on the backend at run time.
"""

import itertools
import json
import unittest
from pathlib import Path

from jsonschema import Draft7Validator

from safety_gate import BeamInput, BusContext, CameraInput, DetectedObject, decide

SCHEMA = Path(__file__).resolve().parents[3] / "contracts" / "schema" / "RampSafetyReport.schema.json"
OBSERVED_AT = "2026-09-30T00:00:00.000Z"


def person():
    return DetectedObject("person", "UNSAFE", 0.9, True)


class ReportContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.validator = Draft7Validator(json.loads(SCHEMA.read_text(encoding="utf-8")))

    def test_every_combination_produces_a_valid_report(self) -> None:
        cameras = [
            None,
            CameraInput(True, None, 0.1, ()),
            CameraInput(True, None, 0.1, (person(),)),
            CameraInput(True, "COVERED", 0.1, ()),
            CameraInput(False, None, 0.1, None, simulated=True),
        ]
        beams = [
            BeamInput("BEAM_CLEAR", 800),
            BeamInput("BLOCKED", 120, simulated=True),
            BeamInput("UNCALIBRATED"),
            BeamInput("UNKNOWN"),
            BeamInput(None),
        ]
        contexts = [
            BusContext("POSITIONED_AT_STOP", True),
            BusContext("WAITING_FOR_BAY", True),
            BusContext("TRAVELLING_TO_STOP", False, operator_halt=True),
        ]
        for camera, beam, context in itertools.product(cameras, beams, contexts):
            report = decide(camera, beam, context).to_report(OBSERVED_AT)
            errors = [error.message for error in self.validator.iter_errors(report)]
            with self.subTest(report=report):
                self.assertEqual([], errors)


if __name__ == "__main__":
    unittest.main()
