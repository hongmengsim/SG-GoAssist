"""Converts perception and ToF output into the safety gate's own input types.

The gate imports neither module; this is the only place that knows both sides.
"""

from __future__ import annotations

from beam_reading import BeamReading
from perception import PerceptionResult
from safety_gate import BeamInput, CameraInput, DetectedObject


def camera_input(result: PerceptionResult, age_seconds: float, simulated: bool) -> CameraInput:
    objects = (
        None
        if result.objects is None
        else tuple(
            DetectedObject(item.class_name, item.safety, item.confidence, item.in_zone)
            for item in result.objects
        )
    )
    return CameraInput(
        image_ok=result.image_ok,
        degraded_reason=result.degraded_reason,
        age_seconds=age_seconds,
        objects=objects,
        simulated=simulated,
    )


def beam_input(reading: BeamReading) -> BeamInput:
    return BeamInput(reading.state, reading.distance_mm, reading.simulated)
