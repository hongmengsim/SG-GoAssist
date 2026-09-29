"""A camera that is not there, for the agent's simulate mode and for tests.

Everything it reports is labelled simulated by the agent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence

from perception import RawDetection

CENTRE_OF_ZONE = (0.5, 0.5, 0.2, 0.3)
OUTSIDE_ZONE = (0.05, 0.05, 0.05, 0.05)


@dataclass
class SimFrame:
    """Stands in for a numpy image: only the statistics the health check reads."""

    mean_value: float = 100.0
    std_value: float = 40.0
    size: int = 640 * 480

    def mean(self) -> float:
        return self.mean_value

    def std(self) -> float:
        return self.std_value


@dataclass(frozen=True)
class Capture:
    frame: Optional[object]
    captured_at: float


class SimulatedCamera:
    """Capture source and detector in one. Objects and faults are set by the scenario."""

    simulated = True

    def __init__(self, clock: Callable[[], float]) -> None:
        self._clock = clock
        self._objects: tuple = ()
        self._covered = False
        self._no_frames = False

    def place(self, class_name: str, confidence: float = 0.9, box=CENTRE_OF_ZONE) -> None:
        self._objects = self._objects + (RawDetection(class_name, confidence, box),)

    def clear_objects(self) -> None:
        self._objects = ()

    def cover_lens(self, covered: bool) -> None:
        self._covered = covered

    def stop_frames(self, stopped: bool) -> None:
        self._no_frames = stopped

    def capture(self) -> Capture:
        if self._no_frames:
            return Capture(None, self._clock())
        return Capture(SimFrame(std_value=1.0 if self._covered else 40.0), self._clock())

    def detect(self, frame: object) -> Sequence[RawDetection]:
        return self._objects
