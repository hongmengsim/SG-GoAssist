"""Perception policy layer: judge what is in the ramp zone. No camera or model runner."""

from .detector import Detector, StubDetector
from .geometry import box_overlaps_polygon
from .health import check_image_health
from .models import PerceptionObject, PerceptionResult, RawDetection
from .pipeline import analyse
from .policy import DEFAULT_POLICY, Policy

__all__ = [
    "DEFAULT_POLICY",
    "Detector",
    "PerceptionObject",
    "PerceptionResult",
    "Policy",
    "RawDetection",
    "StubDetector",
    "analyse",
    "box_overlaps_polygon",
    "check_image_health",
]
