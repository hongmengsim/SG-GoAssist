"""Post on change, plus a slow heartbeat; never per camera frame.

A report is due when its content (ignoring the observation time) differs from the last one
the backend confirmed, or when the heartbeat interval has passed. Only ``sent`` records a
report as delivered, so a failed post is offered again on the next tick.
"""

from __future__ import annotations

import json
import time
from typing import Callable

# The scale design assumes one message per bus every five seconds when nothing changes.
DEFAULT_HEARTBEAT_SECONDS = 5.0


def _facts(payload: dict) -> str:
    return json.dumps(
        {key: value for key, value in payload.items() if key != "observedAt"},
        sort_keys=True,
    )


class ChangeGate:
    def __init__(
        self,
        heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._heartbeat = heartbeat_seconds
        self._clock = clock
        self._last: dict[str, tuple[str, float]] = {}

    def due(self, key: str, payload: dict) -> bool:
        last = self._last.get(key)
        if last is None or last[0] != _facts(payload):
            return True
        return self._clock() - last[1] >= self._heartbeat

    def sent(self, key: str, payload: dict) -> None:
        self._last[key] = (_facts(payload), self._clock())

    def forget(self, key: str) -> None:
        self._last.pop(key, None)
