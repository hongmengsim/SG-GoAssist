"""Safe or unsafe to deploy the ramp over, per detected object.

Unsafe by default: only classes explicitly listed as safe, seen at high confidence, are
safe. Anything unknown, misspelt, unlisted, or seen with doubtful confidence is unsafe,
so a mistake can only block the ramp, never allow it.

People and mobility devices can never be marked safe, even if a custom list names them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

SAFE = "SAFE"
UNSAFE = "UNSAFE"

# Never safe, whatever the configuration says.
ALWAYS_UNSAFE = frozenset(
    {
        "person",
        "wheelchair",
        "mobility_scooter",
        "rollator_walker",
        "walker",
        "stroller",
        "bicycle",
        "crutches",
        "walking_cane",
        "white_cane",
        "animal",
    }
)

# Owner decision 29 Sep 2026: a leaf or a plastic bag is safe to deploy over. Add to this set
# only by explicit team decision. The pretrained COCO model has no such classes, so these
# only take effect once a fine-tuned model emits them.
SAFE_CLASSES: frozenset[str] = frozenset({"leaf", "plastic_bag"})

# The repo's existing light-debris confidence. A size limit is still an open question.
MIN_SAFE_CONFIDENCE = 0.92


@dataclass(frozen=True)
class Policy:
    safe_classes: frozenset[str] = SAFE_CLASSES
    min_safe_confidence: float = MIN_SAFE_CONFIDENCE

    def verdict(self, class_name: object, confidence: object) -> str:
        if not isinstance(class_name, str):
            return UNSAFE
        name = class_name.strip().lower()
        if not name or name in ALWAYS_UNSAFE or name not in self.safe_classes:
            return UNSAFE
        if (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or math.isnan(confidence)
            or not 0.0 <= confidence <= 1.0
        ):
            return UNSAFE
        return SAFE if confidence >= self.min_safe_confidence else UNSAFE


DEFAULT_POLICY = Policy()
