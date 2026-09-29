"""Real-mode start-up checks: the agent refuses to start with a sensor missing."""

import tempfile
import unittest
from pathlib import Path

from bus_agent.config import parse_config
from bus_agent.real_mode import PreflightFailed, RealFactories, build_real_sensors
from bus_agent.sensors_real import SensorUnavailable


def settings(**overrides):
    data = {
        "busId": "AV-095-01", "busService": "95", "backendUrl": "http://x:3000",
        "serialPort": "/dev/ttyUSB0", "cameraIndex": 0, "modelPath": None,
    }
    data.update(overrides)
    return parse_config({key: value for key, value in data.items() if value is not None})


class Fake:
    def __init__(self, **failures) -> None:
        self.failures = failures
        self.opened = []

    def factories(self, model_exists=True) -> RealFactories:
        def serial(port):
            self.opened.append(("serial", port))
            if "serial" in self.failures:
                raise SensorUnavailable(self.failures["serial"])
            return "SERIAL"

        def camera(index):
            self.opened.append(("camera", index))
            if "camera" in self.failures:
                raise SensorUnavailable(self.failures["camera"])
            return lambda: "FRAME"

        def runner(path, min_confidence):
            self.opened.append(("model", path))
            if "model" in self.failures:
                raise SensorUnavailable(self.failures["model"])
            return lambda frame: []

        return RealFactories(serial=serial, camera=camera, model=runner)


class RealModeTests(unittest.TestCase):
    def model_file(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "model.param"
        path.write_text("x", encoding="utf-8")
        return str(path)

    def test_with_everything_present_it_returns_the_three_sensors(self) -> None:
        fake = Fake()
        sensors = build_real_sensors(settings(modelPath=self.model_file()), fake.factories())
        self.assertEqual("SERIAL", sensors.beam_source)
        self.assertEqual("FRAME", sensors.grabber())
        self.assertEqual([], sensors.runner(None))
        self.assertEqual(["serial", "camera", "model"], [name for name, _ in fake.opened])

    def test_every_missing_piece_is_reported_together(self) -> None:
        fake = Fake(serial="no such port", camera="camera busy")
        with self.assertRaises(PreflightFailed) as caught:
            build_real_sensors(settings(modelPath=self.model_file()), fake.factories())
        text = "\n".join(caught.exception.problems)
        self.assertIn("no such port", text)
        self.assertIn("camera busy", text)

    def test_unconfigured_sensors_are_problems_not_silent_skips(self) -> None:
        with self.assertRaises(PreflightFailed) as caught:
            build_real_sensors(settings(serialPort=None, cameraIndex=None), Fake().factories())
        text = "\n".join(caught.exception.problems)
        self.assertIn("serialPort", text)
        self.assertIn("cameraIndex", text)
        self.assertIn("modelPath", text)

    def test_a_model_file_that_does_not_exist_is_a_problem(self) -> None:
        with self.assertRaises(PreflightFailed) as caught:
            build_real_sensors(settings(modelPath="does/not/exist.param"), Fake().factories())
        self.assertIn("does/not/exist.param", "\n".join(caught.exception.problems))

    def test_a_model_that_fails_to_load_is_a_problem(self) -> None:
        fake = Fake(model="cannot load")
        with self.assertRaises(PreflightFailed) as caught:
            build_real_sensors(settings(modelPath=self.model_file()), fake.factories())
        self.assertIn("cannot load", "\n".join(caught.exception.problems))


if __name__ == "__main__":
    unittest.main()
