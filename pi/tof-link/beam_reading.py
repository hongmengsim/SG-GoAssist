"""A thin reading interface over the existing BeamState, for the rest of the Pi software.

BeamState (demo_state.py) is used exactly as it is. This module only

* feeds it lines from a line source (real serial port, fake, or simulated),
* names its state the way contracts/ does (``BEAM CLEAR`` becomes ``BEAM_CLEAR``), and
* returns one immutable ``BeamReading`` per poll.

Reading is all the beam logic does. The serial source can also send the two laser commands
(``LASERS ON`` and ``LASERS OFF``) for the bus agent's marker lasers, and nothing else.
A reading that is missing, stale, invalid or unrecognised is reported as UNKNOWN with no
distance, never as clear.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Iterable, Optional, Protocol

from demo_state import BeamState

log = logging.getLogger(__name__)

BEAM_CLEAR = "BEAM_CLEAR"
BLOCKED = "BLOCKED"
CHECKING = "CHECKING"
UNCALIBRATED = "UNCALIBRATED"
UNKNOWN = "UNKNOWN"

# BeamState spells the clear state with a space; contracts/ uses an underscore.
_STATE_NAMES = {
    "BEAM CLEAR": BEAM_CLEAR,
    "BLOCKED": BLOCKED,
    "CHECKING": CHECKING,
    "UNCALIBRATED": UNCALIBRATED,
    "UNKNOWN": UNKNOWN,
}
_STATES_WITH_DISTANCE = frozenset({BEAM_CLEAR, BLOCKED, CHECKING})


@dataclass(frozen=True)
class BeamReading:
    state: str
    distance_mm: Optional[int]
    simulated: bool = False


class LineSource(Protocol):
    def read_lines(self) -> Iterable[str]:
        """Complete text lines received since the last call (may be empty)."""
        ...


class BeamReader:
    """Polls a line source and reports the beam's state."""

    def __init__(
        self,
        source: LineSource,
        beam: Optional[BeamState] = None,
        clock: Callable[[], float] = time.monotonic,
        simulated: bool = False,
    ) -> None:
        self._source = source
        self._beam = beam if beam is not None else BeamState()
        self._clock = clock
        self._simulated = simulated
        self._source_failed = False

    def poll(self) -> BeamReading:
        now = self._clock()
        try:
            lines = list(self._source.read_lines())
        except Exception as error:  # noqa: BLE001 - any failed read means the beam cannot be trusted
            # An unplugged ESP32 raises OSError from the serial read. The beam is then UNKNOWN at once,
            # never the last reading, and the caller's loop carries on and halts.
            self._beam.invalidate()
            if not self._source_failed:
                log.warning("Beam source failed (%s); the beam is UNKNOWN until it reads again", error)
                self._source_failed = True
            return BeamReading(UNKNOWN, None, self._simulated)
        if self._source_failed:
            log.info("Beam source is reading again")
            self._source_failed = False
        for line in lines:
            self._beam.accept(line, now)
        state = _STATE_NAMES.get(self._beam.check(now), UNKNOWN)
        distance = self._beam.mm if state in _STATES_WITH_DISTANCE else None
        return BeamReading(state, distance, self._simulated)

    def calibrate(self) -> float:
        """Take the empty-path reference. Raises ValueError with BeamState's own message."""
        return self._beam.calibrate(self._clock())


class FakeLineSource:
    """Lines pushed by a test or a scenario; nothing else."""

    def __init__(self, lines: Iterable[str] = ()) -> None:
        self._pending = list(lines)

    def push(self, line: str) -> None:
        self._pending.append(line)

    def read_lines(self) -> list[str]:
        lines, self._pending = self._pending, []
        return lines


class SimulatedBeamSource:
    """A sensor that is not there: one valid reading per poll, in the firmware's line format.

    Drives the agent's simulate mode. Readings from it must be labelled simulated (pass
    ``simulated=True`` to BeamReader).
    """

    BLOCK_OFFSET_MM = 300

    def __init__(self, reference_mm: int = 500, step_ms: int = 200) -> None:
        self._reference_mm = reference_mm
        self._step_ms = step_ms
        self._time_ms = 0
        self._blocked = False
        self._dropout = False

    def set_blocked(self, blocked: bool) -> None:
        self._blocked = blocked

    def set_dropout(self, dropout: bool) -> None:
        """While set, the sensor sends nothing, as if the cable were pulled."""
        self._dropout = dropout

    def read_lines(self) -> list[str]:
        self._time_ms += self._step_ms
        if self._dropout:
            return []
        distance = self._reference_mm - (self.BLOCK_OFFSET_MM if self._blocked else 0)
        return [f"{self._time_ms},VL53L0X,{distance},VALID"]


# The only commands this source will ever write: they switch the marker lasers. ``LASERS ON`` also
# restarts the firmware's two-second watchdog, so repeating it keeps the lasers on.
LASER_COMMANDS = frozenset({"LASERS ON", "LASERS OFF"})


class SerialLineSource:
    """Reads lines from a pyserial-like port (``in_waiting`` and ``read``). Never blocks.

    Reading is all it does, except ``send`` for the two laser commands above; anything else is refused.
    """

    def __init__(self, port: object, max_line_bytes: int = 1024) -> None:
        self._port = port
        self._max_line_bytes = max_line_bytes
        self._buffer = b""

    def send(self, command: str) -> None:
        """Writes one of the laser commands. Raises ValueError for anything else, OSError if the port fails."""
        if command not in LASER_COMMANDS:
            raise ValueError(f"only the laser commands may be sent, not {command!r}")
        self._port.write((command + "\n").encode("ascii"))  # type: ignore[attr-defined]

    def read_lines(self) -> list[str]:
        waiting = self._port.in_waiting  # type: ignore[attr-defined]
        if waiting:
            self._buffer += self._port.read(waiting)  # type: ignore[attr-defined]
        *complete, self._buffer = self._buffer.split(b"\n")
        if len(self._buffer) > self._max_line_bytes:
            self._buffer = b""  # a line this long is noise, not a reading
        return [raw.decode("ascii", errors="replace").rstrip("\r") for raw in complete]
