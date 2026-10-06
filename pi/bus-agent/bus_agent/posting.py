"""Post on change, plus a slow heartbeat; never per camera frame.

A report is due when its content (ignoring the observation time and raw readings) differs from the last one
the backend confirmed, or when the heartbeat interval has passed. Only ``sent`` records a
report as delivered, so a failed post is offered again on the next tick.

A report can name a *critical* value (the safety permission). A change of that value goes out at once, in
either direction, so a halt is never delayed. A change that leaves it alone (a flickering camera reshuffling
the halt reasons) waits for the settle time, counted from the last report that went out, so a flicker posts
about once per settle time and not once per flip.
"""

from __future__ import annotations

import json
import time
from typing import Callable, Optional

# The scale design assumes one message per bus every five seconds when nothing changes.
DEFAULT_HEARTBEAT_SECONDS = 5.0
# How long a change that leaves the critical value alone waits before it is sent.
DEFAULT_SETTLE_SECONDS = 5.0


# Readings that move on every sensor sample. A change in what they mean is already carried by the
# beam state, the safety class and the halt reasons, so they only go out with the heartbeat.
_MEASUREMENTS = frozenset({"observedAt", "updatedAt", "distanceMm", "confidence"})


def _without_measurements(value: object) -> object:
    if isinstance(value, dict):
        return {key: _without_measurements(item) for key, item in value.items() if key not in _MEASUREMENTS}
    if isinstance(value, list):
        return [_without_measurements(item) for item in value]
    return value


def _facts(payload: dict) -> str:
    return json.dumps(_without_measurements(payload), sort_keys=True)


class ChangeGate:
    def __init__(
        self,
        heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        settle_seconds: float = DEFAULT_SETTLE_SECONDS,
    ) -> None:
        self._heartbeat = heartbeat_seconds
        self._settle = settle_seconds
        self._clock = clock
        # key -> (facts, time sent, critical value)
        self._last: dict[str, tuple[str, float, object]] = {}

    def due(self, key: str, payload: dict, critical: Optional[Callable[[dict], object]] = None) -> bool:
        last = self._last.get(key)
        if last is None:
            return True
        elapsed = self._clock() - last[1]
        if last[0] == _facts(payload):
            return elapsed >= self._heartbeat
        if critical is None or critical(payload) != last[2]:
            return True
        return elapsed >= self._settle

    def sent(self, key: str, payload: dict, critical: Optional[Callable[[dict], object]] = None) -> None:
        self._last[key] = (_facts(payload), self._clock(), critical(payload) if critical is not None else None)

    def forget(self, key: str) -> None:
        self._last.pop(key, None)
