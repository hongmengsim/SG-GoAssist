"""Frame in, PerceptionResult out. Frames stay in memory and are never written anywhere."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, Sequence

from .detector import Detector
from .geometry import Point, box_overlaps_polygon, is_valid_box
from .health import INFERENCE_ERROR, check_image_health
from .models import PerceptionObject, PerceptionResult, RawDetection
from .policy import DEFAULT_POLICY, UNSAFE, Policy

log = logging.getLogger(__name__)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _to_object(raw: RawDetection, polygon: Sequence[Point], policy: Policy) -> PerceptionObject:
    return PerceptionObject(
        class_name=str(raw.class_name),
        # A box with broken numbers cannot be trusted to be the object it claims to be.
        safety=(
            policy.verdict(raw.class_name, raw.confidence)
            if is_valid_box(raw.box_norm)
            else UNSAFE
        ),
        confidence=raw.confidence,
        in_zone=box_overlaps_polygon(raw.box_norm, polygon),
        box_norm=raw.box_norm,
    )


def _unavailable(reason: str, observed_at: str) -> PerceptionResult:
    return PerceptionResult(objects=None, image_ok=False, degraded_reason=reason, observed_at=observed_at)


def analyse(
    frame: object,
    detector: Detector,
    polygon: Sequence[Point],
    policy: Policy = DEFAULT_POLICY,
    clock: Callable[[], str] = utc_now,
) -> PerceptionResult:
    """Check the frame, run the detector, and judge each object against the ramp polygon.

    A frame that cannot be trusted, or a detector that fails, yields ``objects=None`` with a
    reason, never an empty list, so a failure can never read as "nothing there".
    """
    observed_at = clock()
    image_ok, reason = check_image_health(frame)
    if not image_ok:
        return _unavailable(reason or "no_frame", observed_at)
    try:
        raw = detector.detect(frame)
    except Exception:  # noqa: BLE001 - any detector failure must be reported, not raised
        log.exception("Detector failed; reporting the frame as unavailable")
        return _unavailable(INFERENCE_ERROR, observed_at)
    objects = tuple(_to_object(item, polygon, policy) for item in raw)
    return PerceptionResult(objects=objects, image_ok=True, degraded_reason=None, observed_at=observed_at)
