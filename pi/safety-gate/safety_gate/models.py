"""Plain input and output types for the ramp safety gate.

Values and field names follow contracts/ (UPPER_SNAKE values, camelCase in the report), but
this module imports nothing from other modules: adapters in pi/bus-agent convert perception
and ToF output into these types.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

ZONE_CLEAR = "CLEAR"
ZONE_OCCUPIED = "OCCUPIED"
ZONE_UNCERTAIN = "UNCERTAIN"

PERMISSION_CONTINUE = "CONTINUE"
PERMISSION_HALT = "HALT"

SAFE = "SAFE"
UNSAFE = "UNSAFE"

# Halt reasons, in the order they are reported.
OBJECT_IN_ZONE = "OBJECT_IN_ZONE"
TOF_BLOCKED = "TOF_BLOCKED"
TOF_UNAVAILABLE = "TOF_UNAVAILABLE"
TOF_NOT_CALIBRATED = "TOF_NOT_CALIBRATED"
CAMERA_DEGRADED = "CAMERA_DEGRADED"
SENSORS_DISAGREE = "SENSORS_DISAGREE"
BUS_NOT_AT_BOARDING_POSITION = "BUS_NOT_AT_BOARDING_POSITION"
WAITING_FOR_BAY = "WAITING_FOR_BAY"
NO_ACCEPTED_REQUEST = "NO_ACCEPTED_REQUEST"
OPERATOR_HALT = "OPERATOR_HALT"
# Added by the agent, not the gate: they come from time and the backend link, not from sensors.
DEPLOYMENT_TIMEOUT = "DEPLOYMENT_TIMEOUT"
BACKEND_LINK_LOST = "BACKEND_LINK_LOST"

REASON_ORDER = (
    OBJECT_IN_ZONE,
    TOF_BLOCKED,
    TOF_UNAVAILABLE,
    TOF_NOT_CALIBRATED,
    CAMERA_DEGRADED,
    SENSORS_DISAGREE,
    BUS_NOT_AT_BOARDING_POSITION,
    WAITING_FOR_BAY,
    NO_ACCEPTED_REQUEST,
    OPERATOR_HALT,
    DEPLOYMENT_TIMEOUT,
    BACKEND_LINK_LOST,
)


@dataclass(frozen=True)
class DetectedObject:
    """One detection. ``in_zone`` comes from the geometry check upstream."""

    class_name: str
    safety: Optional[str]
    confidence: float
    in_zone: bool


@dataclass(frozen=True)
class CameraInput:
    """What the camera side knows. ``objects`` None means detection did not run."""

    image_ok: bool
    degraded_reason: Optional[str]
    age_seconds: Optional[float]
    objects: Optional[tuple]
    simulated: bool = False


@dataclass(frozen=True)
class BeamInput:
    """The single ToF beam: BEAM_CLEAR, BLOCKED, CHECKING, UNCALIBRATED or UNKNOWN."""

    state: Optional[str]
    distance_mm: Optional[int] = None
    simulated: bool = False


@dataclass(frozen=True)
class BusContext:
    movement: Optional[str]
    has_accepted_request: object
    operator_halt: bool = False


@dataclass(frozen=True)
class GateConfig:
    # ASSUMPTION: placeholder until the real camera frame rate is confirmed; the teammate's
    # ToF check uses one second for the same purpose.
    max_camera_age_seconds: float = 1.0


@dataclass(frozen=True)
class ObjectInZone:
    class_name: str
    safety: str
    confidence: float


@dataclass(frozen=True)
class BeamReport:
    state: str
    distance_mm: Optional[int]
    simulated: bool


@dataclass(frozen=True)
class Decision:
    zone_state: str
    permission: str
    reasons: tuple
    beam: BeamReport
    camera_image_ok: bool
    camera_degraded_reason: Optional[str]
    objects_in_zone: tuple
    simulated: bool

    def to_report(self, observed_at: str) -> dict:
        """The body of a RampSafetyReport (the bus id travels in the URL)."""
        tof: dict = {"state": self.beam.state}
        if self.beam.distance_mm is not None:
            tof["distanceMm"] = self.beam.distance_mm
        tof["simulated"] = self.beam.simulated
        camera: dict = {"imageOk": self.camera_image_ok}
        if self.camera_degraded_reason is not None:
            camera["degradedReason"] = self.camera_degraded_reason
        return {
            "zoneState": self.zone_state,
            "permission": self.permission,
            "reasons": list(self.reasons),
            "tof": tof,
            "camera": camera,
            "objectsInZone": [
                {"className": item.class_name, "safety": item.safety, "confidence": item.confidence}
                for item in self.objects_in_zone
            ],
            "simulated": self.simulated,
            "observedAt": observed_at,
        }


def clamp_confidence(value: object) -> float:
    """A confidence outside 0..1, or not a number, is reported as the nearest bound (NaN as 0)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or math.isnan(value):
        return 0.0
    return min(1.0, max(0.0, float(value)))
