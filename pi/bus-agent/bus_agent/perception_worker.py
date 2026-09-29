"""Runs the camera and the detector off the safety loop and publishes the latest result.

A model can take tens of milliseconds or more per frame. The agent's loop must never wait for it,
so this thread captures, analyses and stores only the newest result with the time it was captured.
The agent reads that and works out its age itself: if this thread stalls, the result ages and the
gate halts (a camera it cannot trust is never clear).
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Optional, Sequence

from perception import DEFAULT_POLICY, PerceptionResult, Policy, analyse

from .sim_sensors import Capture

log = logging.getLogger(__name__)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class PerceptionWorker:
    def __init__(
        self,
        camera: object,
        detector: object,
        polygon: Sequence[tuple],
        policy: Policy = DEFAULT_POLICY,
        clock: Callable[[], float] = time.monotonic,
        period_seconds: float = 0.05,
    ) -> None:
        self._camera = camera
        self._detector = detector
        self._polygon = polygon
        self._policy = policy
        self._clock = clock
        self._period = period_seconds
        self._lock = threading.Lock()
        self._latest: Optional[tuple] = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.simulated = bool(getattr(camera, "simulated", False))

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="perception", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=3)

    def latest_perception(self) -> Optional[tuple]:
        """(PerceptionResult, captured_at) for the newest frame, or None before the first one."""
        with self._lock:
            return self._latest

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                capture: Capture = self._camera.capture()
            except Exception:  # noqa: BLE001 - a capture failure is "no frame", never a crash
                log.exception("Capture failed")
                capture = Capture(None, self._clock())
            result: PerceptionResult = analyse(
                capture.frame, self._detector, self._polygon, self._policy, clock=_iso_now
            )
            with self._lock:
                self._latest = (result, capture.captured_at)
            self._stop.wait(self._period)
