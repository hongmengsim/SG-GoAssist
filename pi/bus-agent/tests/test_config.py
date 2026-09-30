"""The agent's configuration file: strict, with clear errors, and no secrets in it."""

import json
import tempfile
import unittest
from pathlib import Path

from bus_agent.config import ConfigError, DEFAULT_POLYGON, load_config, parse_config


def valid(**overrides):
    base = {"busId": "AV-095-01", "busService": "95", "backendUrl": "http://192.168.1.10:3000"}
    base.update(overrides)
    return base


class ParseTests(unittest.TestCase):
    def test_the_minimum_is_a_bus_id_a_service_and_a_backend(self) -> None:
        config = parse_config(valid())
        self.assertEqual("AV-095-01", config.bus_id)
        self.assertEqual("95", config.bus_service)
        self.assertEqual("http://192.168.1.10:3000", config.backend_url)
        self.assertEqual(DEFAULT_POLYGON, config.ramp_polygon)
        self.assertIsNone(config.serial_port)
        self.assertEqual(5.0, config.heartbeat_seconds)

    def test_everything_can_be_set(self) -> None:
        config = parse_config(
            valid(
                serialPort="/dev/ttyUSB0",
                cameraIndex=0,
                modelPath="models/ramp.param",
                rampPolygon=[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
                heartbeatSeconds=3,
                deploySeconds=6.5,
                maxCameraAgeSeconds=0.8,
                minDetectionConfidence=0.3,
            )
        )
        self.assertEqual("/dev/ttyUSB0", config.serial_port)
        self.assertEqual(0, config.camera_index)
        self.assertEqual(((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)), config.ramp_polygon)
        self.assertEqual(6.5, config.deploy_seconds)
        self.assertEqual(0.8, config.max_camera_age_seconds)
        self.assertEqual(0.3, config.min_detection_confidence)

    def test_the_timeouts_are_off_unless_set_and_must_be_positive_numbers(self) -> None:
        config = parse_config(valid())
        self.assertIsNone(config.deployment_timeout_seconds)
        self.assertIsNone(config.link_loss_halt_seconds)
        config = parse_config(valid(deploymentTimeoutSeconds=30, linkLossHaltSeconds=6.5))
        self.assertEqual(30.0, config.deployment_timeout_seconds)
        self.assertEqual(6.5, config.link_loss_halt_seconds)
        for bad in ({"deploymentTimeoutSeconds": 0}, {"deploymentTimeoutSeconds": -5},
                    {"linkLossHaltSeconds": "soon"}, {"linkLossHaltSeconds": 0}):
            with self.subTest(bad=bad):
                with self.assertRaises(ConfigError):
                    parse_config(valid(**bad))

    def test_a_misspelt_key_is_an_error_not_silently_ignored(self) -> None:
        with self.assertRaisesRegex(ConfigError, "rampPolygone"):
            parse_config(valid(rampPolygone=[]))

    def test_required_keys_and_types(self) -> None:
        for bad in (
            {}, {"busId": "x"}, valid(busId=""), valid(busId=5), valid(busService=""),
            valid(backendUrl="ftp://x"), valid(backendUrl=""), valid(heartbeatSeconds="fast"),
            valid(heartbeatSeconds=0), valid(deploySeconds=-1), valid(maxCameraAgeSeconds=0), valid(maxCameraAgeSeconds=5.5),
            valid(minDetectionConfidence=1.5), valid(cameraIndex=-1), valid(cameraIndex="0"),
            valid(serialPort=""), valid(modelPath=5),
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ConfigError):
                    parse_config(bad)

    def test_the_polygon_is_validated(self) -> None:
        for bad in (
            [], [[0.1, 0.1], [0.9, 0.9]], [[0.1, 0.1], [0.9, 0.1], [1.5, 0.9]],
            [[0.1, 0.1], [0.9, 0.1], ["a", 0.9]], [[0.1, 0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
            [[float("nan"), 0.1], [0.9, 0.1], [0.5, 0.9]], "polygon",
            [[0.1, 0.1], [0.1, 0.1], [0.1, 0.1]],
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ConfigError):
                    parse_config(valid(rampPolygon=bad))

    def test_a_secret_in_the_file_is_refused(self) -> None:
        for key in ("deviceSharedSecret", "operatorToken", "secret", "password"):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ConfigError, "environment"):
                    parse_config(valid(**{key: "x"}))


class FileTests(unittest.TestCase):
    def test_a_file_is_loaded_and_errors_name_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "agent.json"
            path.write_text(json.dumps(valid()), encoding="utf-8")
            self.assertEqual("AV-095-01", load_config(path).bus_id)
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaisesRegex(ConfigError, "agent.json"):
                load_config(path)
            with self.assertRaisesRegex(ConfigError, "missing.json"):
                load_config(Path(directory) / "missing.json")

    def test_the_example_file_in_the_repository_is_valid(self) -> None:
        example = Path(__file__).resolve().parents[1] / "agent.example.json"
        config = load_config(example)
        self.assertTrue(config.bus_id)


if __name__ == "__main__":
    unittest.main()
