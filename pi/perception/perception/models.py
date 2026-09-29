"""Types produced by the perception layer. No decision about the ramp is made here."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .geometry import Box


@dataclass(frozen=True)
class RawDetection:
    """What a detector reports for one object, before the policy and zone check."""

    class_name: str
    confidence: float
    box_norm: Box


@dataclass(frozen=True)
class PerceptionObject:
    class_name: str
    safety: str
    confidence: float
    in_zone: bool
    box_norm: Box


@dataclass(frozen=True)
class PerceptionResult:
    """One processed frame.

    ``objects`` is None whenever the frame could not be trusted (no image, too dark,
    blocked lens, detector failure): that is "unavailable", never "empty". An empty tuple
    means the frame was healthy and nothing was detected.
    """

    objects: Optional[tuple]
    image_ok: bool
    degraded_reason: Optional[str]
    observed_at: str
