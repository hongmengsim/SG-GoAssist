"""Record and replay of real sensor data, so it can be used again without the hardware.

Two files per recording, both JSON lines with a time offset in seconds from the start:

* ``beam.jsonl``: every line the ESP32 sent (``{"t", "line"}``);
* ``perception.jsonl``: every new perception result (``{"t", "imageOk", "degradedReason",
  "objects"}``): class, safety verdict, confidence, in-zone flag and normalised box.

No frames, pixels or images are ever written or read, matching the rule that camera frames are
not recorded. A replayed result carries the replay clock as its capture time, so the gate's
freshness check works exactly as it does live; when a recording ends the data simply stops and the
beam and camera go stale, which halts.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Callable, Optional

from perception import PerceptionObject, PerceptionResult

log = logging.getLogger(__name__)


class ReplayError(Exception):
    """A recording is missing or corrupt."""


def _open_for_append(path: Path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return open(path, "a", encoding="utf-8", buffering=1)


class RecordingLineSource:
    """Wraps a line source and appends what it delivers to a file."""

    def __init__(self, inner, path: Path, clock: Callable[[], float] = time.monotonic) -> None:
        self._inner = inner
        self._file = _open_for_append(path)
        self._clock = clock
        self._start: Optional[float] = None

    def read_lines(self) -> list:
        now = self._clock()
        if self._start is None:
            self._start = now
        lines = list(self._inner.read_lines())
        for line in lines:
            self._file.write(json.dumps({"t": round(now - self._start, 3), "line": line}) + "\n")
        return lines

    def send(self, command: str) -> None:
        """Passes a laser command on to the real source. Only what the ESP32 sent is recorded."""
        self._inner.send(command)

    def close(self) -> None:
        self._file.close()


def _load(path: Path, check) -> list:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as error:
        raise ReplayError(f"{path}: cannot read the recording ({error})") from error
    records = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            record = json.loads(raw)
            check(record)
        except (ValueError, KeyError, TypeError) as error:
            raise ReplayError(f"{path}: line {number} is not a valid record ({error})") from error
        records.append(record)
    records.sort(key=lambda record: record["t"])
    return records


def _check_time(record: dict) -> None:
    if isinstance(record["t"], bool) or not isinstance(record["t"], (int, float)) or record["t"] < 0:
        raise ValueError("t must be a non-negative number")


def _check_line(record: dict) -> None:
    _check_time(record)
    if not isinstance(record["line"], str):
        raise ValueError("line must be text")


class ReplayLineSource:
    """Delivers recorded lines when the clock reaches their offsets. Then nothing more."""

    def __init__(self, path: Path, clock: Callable[[], float] = time.monotonic) -> None:
        self._records = _load(path, _check_line)
        self._clock = clock
        self._start: Optional[float] = None
        self._next = 0

    def read_lines(self) -> list:
        now = self._clock()
        if self._start is None:
            self._start = now
        elapsed = now - self._start
        lines = []
        while self._next < len(self._records) and self._records[self._next]["t"] <= elapsed:
            lines.append(self._records[self._next]["line"])
            self._next += 1
        return lines


class RecordingPerception:
    """Wraps something with ``latest_perception()`` and records each new result once."""

    def __init__(self, inner, path: Path, clock: Callable[[], float] = time.monotonic) -> None:
        self._inner = inner
        self._file = _open_for_append(path)
        self._clock = clock
        self._start: Optional[float] = None
        self._last_capture: Optional[float] = None
        self.simulated = bool(getattr(inner, "simulated", False))

    def latest_perception(self):
        newest = self._inner.latest_perception()
        if newest is None:
            return None
        result, captured_at = newest
        if captured_at != self._last_capture:
            self._last_capture = captured_at
            now = self._clock()
            if self._start is None:
                self._start = now
            self._file.write(json.dumps(_to_record(result, round(now - self._start, 3))) + "\n")
        return newest

    def close(self) -> None:
        self._file.close()


def _to_record(result: PerceptionResult, offset: float) -> dict:
    objects = (
        None
        if result.objects is None
        else [
            {
                "className": item.class_name,
                "safety": item.safety,
                "confidence": item.confidence,
                "inZone": item.in_zone,
                "box": list(item.box_norm),
            }
            for item in result.objects
        ]
    )
    return {"t": offset, "imageOk": result.image_ok, "degradedReason": result.degraded_reason, "objects": objects}


def _check_perception(record: dict) -> None:
    _check_time(record)
    if not isinstance(record["imageOk"], bool):
        raise ValueError("imageOk must be true or false")
    if record["objects"] is not None and not isinstance(record["objects"], list):
        raise ValueError("objects must be a list or null")
    for item in record["objects"] or []:
        item["className"], item["safety"], item["confidence"], item["inZone"], item["box"]  # noqa: B018


class ReplayPerception:
    """Replays recorded perception results. The capture time is the replay clock's."""

    # Replayed data is not live sensing, so every report made from it says so.
    simulated = True

    def __init__(self, path: Path, clock: Callable[[], float] = time.monotonic) -> None:
        self._records = _load(path, _check_perception)
        self._clock = clock
        self._start: Optional[float] = None

    def latest_perception(self):
        now = self._clock()
        if self._start is None:
            self._start = now
        elapsed = now - self._start
        current = None
        for record in self._records:
            if record["t"] <= elapsed:
                current = record
            else:
                break
        if current is None:
            return None
        objects = (
            None
            if current["objects"] is None
            else tuple(
                PerceptionObject(o["className"], o["safety"], o["confidence"], o["inZone"], tuple(o["box"]))
                for o in current["objects"]
            )
        )
        result = PerceptionResult(objects, current["imageOk"], current["degradedReason"], "replayed")
        # Stamped with "now": a replay behaves as if each result were freshly captured, until the
        # recording ends, when the last one ages and the gate halts.
        return result, self._captured_at(current, now)

    def _captured_at(self, current: dict, now: float) -> float:
        # The freshness of a replayed result is measured from when the recording said it was taken.
        return (self._start or now) + current["t"]
