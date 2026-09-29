"""Ramp safety gate: decide(camera, beam, context) -> Decision."""

from .decide import decide
from .models import (
    BeamInput,
    BusContext,
    CameraInput,
    Decision,
    DetectedObject,
    GateConfig,
)

__all__ = [
    "BeamInput",
    "BusContext",
    "CameraInput",
    "Decision",
    "DetectedObject",
    "GateConfig",
    "decide",
]
