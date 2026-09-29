"""The agent's configuration file.

A small JSON file per bus: identity, where the backend is, which serial port and camera to use,
the ramp-zone polygon, and a few tunable limits. Strict on purpose: an unknown key (usually a
typo) is an error, every number is range-checked, and secrets are refused because they belong in
the environment (DEVICE_SHARED_SECRET, OPERATOR_API_TOKEN), never in a file that gets copied
around.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# ASSUMPTION: a placeholder rectangle for the ramp-sweep zone in normalised image coordinates;
# it must be replaced by the polygon measured on the real camera view.
DEFAULT_POLYGON = ((0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75))


class ConfigError(ValueError):
    """The configuration is wrong; the message says what and where."""


@dataclass(frozen=True)
class AgentSettings:
    bus_id: str
    bus_service: str
    backend_url: str
    serial_port: Optional[str] = None
    camera_index: Optional[int] = None
    model_path: Optional[str] = None
    ramp_polygon: tuple = DEFAULT_POLYGON
    heartbeat_seconds: float = 5.0
    deploy_seconds: float = 4.0
    max_camera_age_seconds: float = 1.0
    min_detection_confidence: float = 0.25


_KEYS = {
    "busId", "busService", "backendUrl", "serialPort", "cameraIndex", "modelPath",
    "rampPolygon", "heartbeatSeconds", "deploySeconds", "maxCameraAgeSeconds",
    "minDetectionConfidence",
}
_SECRET_WORDS = ("secret", "token", "password", "credential")


def _text(data: dict, key: str, required: bool = False) -> Optional[str]:
    value = data.get(key)
    if value is None:
        if required:
            raise ConfigError(f"{key} is required")
        return None
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{key} must be a non-empty string")
    return value.strip()


def _number(data: dict, key: str, default: float, low: float, high: float, low_open: bool = False) -> float:
    if key not in data:
        return default
    value = data[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ConfigError(f"{key} must be a number")
    if value < low or value > high or (low_open and value == low):
        raise ConfigError(f"{key} must be between {low} and {high}")
    return float(value)


def _polygon(value: Any) -> tuple:
    if not isinstance(value, list) or len(value) < 3:
        raise ConfigError("rampPolygon needs at least 3 points")
    points = []
    for point in value:
        if (
            not isinstance(point, list)
            or len(point) != 2
            or any(isinstance(c, bool) or not isinstance(c, (int, float)) or not math.isfinite(c) for c in point)
            or any(not 0.0 <= c <= 1.0 for c in point)
        ):
            raise ConfigError("rampPolygon points must be [x, y] numbers between 0 and 1")
        points.append((float(point[0]), float(point[1])))
    if len(set(points)) < 3:
        raise ConfigError("rampPolygon points must not all be the same")
    return tuple(points)


def parse_config(data: object) -> AgentSettings:
    if not isinstance(data, dict):
        raise ConfigError("the configuration must be a JSON object")
    for key in data:
        if any(word in key.lower() for word in _SECRET_WORDS):
            raise ConfigError(f"{key}: secrets belong in the environment (DEVICE_SHARED_SECRET, OPERATOR_API_TOKEN), not in this file")
    unknown = sorted(set(data) - _KEYS)
    if unknown:
        raise ConfigError(f"unknown key(s): {', '.join(unknown)}")

    backend = _text(data, "backendUrl", required=True)
    if not backend.startswith(("http://", "https://")):
        raise ConfigError("backendUrl must start with http:// or https://")
    camera = data.get("cameraIndex")
    if camera is not None and (isinstance(camera, bool) or not isinstance(camera, int) or camera < 0):
        raise ConfigError("cameraIndex must be a whole number, 0 or more")

    return AgentSettings(
        bus_id=_text(data, "busId", required=True),
        bus_service=_text(data, "busService", required=True),
        backend_url=backend,
        serial_port=_text(data, "serialPort"),
        camera_index=camera,
        model_path=_text(data, "modelPath"),
        ramp_polygon=_polygon(data["rampPolygon"]) if "rampPolygon" in data else DEFAULT_POLYGON,
        heartbeat_seconds=_number(data, "heartbeatSeconds", 5.0, 0, 3600, low_open=True),
        deploy_seconds=_number(data, "deploySeconds", 4.0, 0, 600, low_open=True),
        max_camera_age_seconds=_number(data, "maxCameraAgeSeconds", 1.0, 0, 60, low_open=True),
        min_detection_confidence=_number(data, "minDetectionConfidence", 0.25, 0.0, 1.0),
    )


def load_config(path: Path) -> AgentSettings:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as error:
        raise ConfigError(f"{path}: cannot read the file ({error})") from error
    try:
        return parse_config(json.loads(text))
    except json.JSONDecodeError as error:
        raise ConfigError(f"{path}: not valid JSON ({error})") from error
    except ConfigError as error:
        raise ConfigError(f"{path}: {error}") from error
