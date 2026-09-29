"""Can the frame be trusted at all? Reads only summary statistics, never stores the image."""

from __future__ import annotations

import math
from typing import Optional

DARK_MEAN = 5.0
BRIGHT_MEAN = 250.0
# ASSUMPTION: floor footage measured a standard deviation of 32 or more; a covered lens gives
# a near-uniform frame. Re-check these on real Pi camera frames.
MIN_CONTRAST_STD = 8.0

NO_FRAME = "no_frame"
TOO_DARK = "too_dark"
OVEREXPOSED = "overexposed"
LOW_CONTRAST_OR_BLOCKED = "low_contrast_or_blocked"
INFERENCE_ERROR = "inference_error"


def check_image_health(frame: object) -> tuple[bool, Optional[str]]:
    """Return (image_ok, degraded_reason). ``frame`` needs size, mean() and std() (numpy)."""
    try:
        if frame is None or frame.size == 0:  # type: ignore[attr-defined]
            return False, NO_FRAME
        mean = float(frame.mean())  # type: ignore[attr-defined]
        std = float(frame.std())  # type: ignore[attr-defined]
    except (AttributeError, TypeError, ValueError):
        return False, NO_FRAME
    if not (math.isfinite(mean) and math.isfinite(std)):
        return False, NO_FRAME
    if mean < DARK_MEAN:
        return False, TOO_DARK
    if mean > BRIGHT_MEAN:
        return False, OVEREXPOSED
    if std < MIN_CONTRAST_STD:
        return False, LOW_CONTRAST_OR_BLOCKED
    return True, None
