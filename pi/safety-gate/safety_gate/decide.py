"""The Pi's decision: may the simulated ramp deploy or continue, or must it halt?

Fail-safe by construction. CONTINUE is returned only when the zone is CLEAR and no halt
reason applies; anything missing, stale, invalid or unrecognised is treated as not clear.
"""

from __future__ import annotations

import math

from .models import (
    BUS_NOT_AT_BOARDING_POSITION,
    CAMERA_DEGRADED,
    NO_ACCEPTED_REQUEST,
    OBJECT_IN_ZONE,
    OPERATOR_HALT,
    PERMISSION_CONTINUE,
    PERMISSION_HALT,
    REASON_ORDER,
    SAFE,
    SENSORS_DISAGREE,
    TOF_BLOCKED,
    TOF_NOT_CALIBRATED,
    TOF_UNAVAILABLE,
    UNSAFE,
    WAITING_FOR_BAY,
    ZONE_CLEAR,
    ZONE_OCCUPIED,
    ZONE_UNCERTAIN,
    BeamInput,
    BeamReport,
    BusContext,
    CameraInput,
    Decision,
    GateConfig,
    ObjectInZone,
    clamp_confidence,
)

BEAM_CLEAR = "BEAM_CLEAR"
BEAM_BLOCKED = "BLOCKED"
BEAM_UNCALIBRATED = "UNCALIBRATED"
KNOWN_BEAM_STATES = frozenset({BEAM_CLEAR, BEAM_BLOCKED, BEAM_UNCALIBRATED, "CHECKING", "UNKNOWN"})

POSITIONED = "POSITIONED_AT_STOP"
WAITING = "WAITING_FOR_BAY"

NOT_FRESH = "NOT_FRESH"
NO_IMAGE = "NO_IMAGE"
NO_DETECTIONS = "NO_DETECTIONS"


def _camera_problem(camera: CameraInput | None, config: GateConfig) -> str | None:
    """Why the camera cannot be trusted, or None when it can."""
    if camera is None:
        return NO_IMAGE
    if camera.image_ok is not True:
        return camera.degraded_reason or NO_IMAGE
    if camera.degraded_reason is not None:
        return camera.degraded_reason
    age = camera.age_seconds
    fresh = (
        isinstance(age, (int, float))
        and not isinstance(age, bool)
        and math.isfinite(age)
        and 0 <= age <= config.max_camera_age_seconds
    )
    if not fresh:
        return NOT_FRESH
    if camera.objects is None:
        return NO_DETECTIONS
    return None


def _objects_in_zone(camera: CameraInput | None) -> tuple:
    if camera is None or camera.objects is None:
        return ()
    found = []
    for item in camera.objects:
        if item.in_zone is not True:
            continue
        safety = SAFE if item.safety == SAFE else UNSAFE
        found.append(ObjectInZone(str(item.class_name), safety, clamp_confidence(item.confidence)))
    return tuple(found)


def _beam_report(beam: BeamInput) -> BeamReport:
    state = beam.state if beam.state in KNOWN_BEAM_STATES else "UNKNOWN"
    distance = beam.distance_mm
    valid_distance = (
        isinstance(distance, int) and not isinstance(distance, bool) and distance >= 0
    )
    return BeamReport(state, distance if valid_distance else None, bool(beam.simulated))


def _zone_state(beam_state: str, camera_problem: str | None, unsafe_in_zone: bool) -> str:
    if unsafe_in_zone:
        return ZONE_OCCUPIED
    if beam_state == BEAM_BLOCKED:
        return ZONE_OCCUPIED if camera_problem else ZONE_UNCERTAIN
    if camera_problem or beam_state != BEAM_CLEAR:
        return ZONE_UNCERTAIN
    return ZONE_CLEAR


def decide(
    camera: CameraInput | None,
    beam: BeamInput,
    context: BusContext,
    config: GateConfig = GateConfig(),
) -> Decision:
    beam_report = _beam_report(beam)
    problem = _camera_problem(camera, config)
    objects = _objects_in_zone(camera)
    unsafe_in_zone = any(item.safety == UNSAFE for item in objects)
    zone_state = _zone_state(beam_report.state, problem, unsafe_in_zone)

    reasons: set[str] = set()
    if unsafe_in_zone:
        reasons.add(OBJECT_IN_ZONE)
    if beam_report.state == BEAM_BLOCKED:
        reasons.add(TOF_BLOCKED)
    elif beam_report.state == BEAM_UNCALIBRATED:
        reasons.add(TOF_NOT_CALIBRATED)
    elif beam_report.state != BEAM_CLEAR:
        reasons.add(TOF_UNAVAILABLE)
    if problem:
        reasons.add(CAMERA_DEGRADED)
    if beam_report.state == BEAM_BLOCKED and not problem and not unsafe_in_zone:
        reasons.add(SENSORS_DISAGREE)

    if context.operator_halt is True:
        reasons.add(OPERATOR_HALT)
    if context.movement == WAITING:
        reasons.add(WAITING_FOR_BAY)
    elif context.movement != POSITIONED:
        reasons.add(BUS_NOT_AT_BOARDING_POSITION)
    if context.has_accepted_request is not True:
        reasons.add(NO_ACCEPTED_REQUEST)

    ordered = tuple(reason for reason in REASON_ORDER if reason in reasons)
    can_continue = zone_state == ZONE_CLEAR and not ordered
    return Decision(
        zone_state=zone_state,
        permission=PERMISSION_CONTINUE if can_continue else PERMISSION_HALT,
        reasons=ordered,
        beam=beam_report,
        camera_image_ok=bool(camera is not None and camera.image_ok is True),
        camera_degraded_reason=problem,
        objects_in_zone=objects,
        simulated=bool(beam_report.simulated or (camera is not None and camera.simulated)),
    )
