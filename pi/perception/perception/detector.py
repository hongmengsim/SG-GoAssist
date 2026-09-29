"""The seam where a model runner plugs in. Only a stub exists until the model runs on a Pi."""

from __future__ import annotations

from typing import Protocol, Sequence

from .models import RawDetection


class Detector(Protocol):
    def detect(self, frame: object) -> Sequence[RawDetection]:
        """Objects found in the frame, or raise if the model could not run."""
        ...


class StubDetector:
    """Returns the detections it was given, whatever the frame. For tests and simulation."""

    def __init__(self, detections: Sequence[RawDetection] = ()) -> None:
        self._detections = tuple(detections)

    def detect(self, frame: object) -> Sequence[RawDetection]:
        return self._detections
