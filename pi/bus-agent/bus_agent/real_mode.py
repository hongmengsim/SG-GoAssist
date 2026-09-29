"""Start-up for real sensors. Fail-safe: any missing or unopenable sensor stops the start.

The agent must never run "half real": a bus that thinks it has a camera it cannot open would halt
forever, and one that silently drops a sensor would hide the fault. So every configured piece is
opened up front, every problem is collected and reported together, and the start is refused if
there is any.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .config import AgentSettings
from .sensors_real import (
    OpenCvGrabber,
    Picamera2Grabber,
    SensorUnavailable,
    open_serial_line_source,
    ultralytics_runner,
)


class PreflightFailed(Exception):
    def __init__(self, problems: list) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


@dataclass(frozen=True)
class RealFactories:
    """How to open each sensor. Replaced by fakes in tests."""

    serial: Callable[[str], object]
    camera: Callable[[int], Callable[[], object]]
    model: Callable[[str, float], Callable[[object], list]]


@dataclass(frozen=True)
class RealSensors:
    beam_source: object
    grabber: Callable[[], object]
    runner: Callable[[object], list]


def _default_camera(index: int) -> Callable[[], object]:  # pragma: no cover - needs a camera
    try:
        return Picamera2Grabber()
    except SensorUnavailable:
        return OpenCvGrabber(index)


def default_factories() -> RealFactories:  # pragma: no cover - needs hardware
    return RealFactories(
        serial=open_serial_line_source,
        camera=_default_camera,
        model=lambda path, confidence: ultralytics_runner(path, conf=confidence),
    )


def build_real_sensors(settings: AgentSettings, factories: RealFactories) -> RealSensors:
    problems: list = []
    beam = grabber = runner = None

    if not settings.serial_port:
        problems.append("serialPort is not set (the ToF ESP32's port)")
    else:
        try:
            beam = factories.serial(settings.serial_port)
        except SensorUnavailable as error:
            problems.append(f"ToF serial: {error}")

    if settings.camera_index is None:
        problems.append("cameraIndex is not set")
    else:
        try:
            grabber = factories.camera(settings.camera_index)
        except SensorUnavailable as error:
            problems.append(f"camera: {error}")

    if not settings.model_path:
        problems.append("modelPath is not set (the detector model)")
    elif not Path(settings.model_path).exists():
        problems.append(f"model file not found: {settings.model_path}")
    else:
        try:
            runner = factories.model(settings.model_path, settings.min_detection_confidence)
        except SensorUnavailable as error:
            problems.append(f"model: {error}")

    if problems:
        raise PreflightFailed(problems)
    return RealSensors(beam, grabber, runner)
