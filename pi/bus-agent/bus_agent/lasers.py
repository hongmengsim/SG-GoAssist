"""Line lasers that mark where people must not stand while the ramp is out or moving.

The ESP32 drives three line lasers (``firmware/apas-tof-lasers``). ``LASERS ON`` both turns them on and
restarts the firmware's watchdog, which turns them off after about two seconds without a command. Sending it
every half second therefore keeps them on, brings them back if the ESP32 restarts, and needs no answer from
the ESP32. If this program stops or the cable is pulled they go off by themselves.

They are on whenever the ramp is not stowed (deployment requested, deploying, deployed, or halted, which can
leave it partly out), and for a hold after it is stowed. The simulated ramp retracts in one tick, so the hold
stands in for the time a real ramp would take to retract. An unknown ramp state counts as out: marking the
zone is the safe side.

Nothing here can raise into the safety loop: a failed write is logged once and tried again at the next refresh.
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional

from .ramp import STOWED

log = logging.getLogger(__name__)

LASERS_ON = "LASERS ON"
LASERS_OFF = "LASERS OFF"
# Well inside the firmware's two-second watchdog, and slower than the agent's tick.
REFRESH_SECONDS = 0.5
_EPSILON = 1e-9


class LaserMarker:
    def __init__(
        self,
        send: Callable[[str], None],
        clock: Callable[[], float] = time.monotonic,
        hold_seconds: float = 4.0,
    ) -> None:
        self._send = send
        self._clock = clock
        self._hold = hold_seconds
        self._hold_until = float("-inf")
        self._on = False
        self._last_attempt = float("-inf")
        self._failing = False

    @property
    def commanded_on(self) -> bool:
        """Whether the lasers are being asked to be on (not a measurement: the ESP32 does not confirm it here)."""
        return self._on

    def update(self, ramp_state: Optional[str]) -> None:
        now = self._clock()
        out = ramp_state != STOWED
        if out:
            self._hold_until = now + self._hold
        if out or now < self._hold_until:
            if not self._on:
                log.info("Marker lasers ON (ramp %s)", ramp_state)
            if not self._on or now - self._last_attempt >= REFRESH_SECONDS - _EPSILON:
                self._attempt(LASERS_ON, now)
            self._on = True
        elif self._on:
            log.info("Marker lasers OFF (ramp %s, hold over)", ramp_state)
            self._attempt(LASERS_OFF, now)
            self._on = False

    def close(self) -> None:
        """Best effort at shutdown; the firmware turns them off by itself if this fails."""
        if self._on:
            self._on = False
            self._attempt(LASERS_OFF, self._clock())

    def _attempt(self, command: str, now: float) -> None:
        self._last_attempt = now
        try:
            self._send(command)
        except Exception as error:  # noqa: BLE001 - a dead port must never stop the safety loop
            if not self._failing:
                log.warning(
                    "Could not send %r to the lasers (%s); the ESP32 turns them off by itself after about 2 s without a command",
                    command,
                    error,
                )
                self._failing = True
            return
        if self._failing:
            log.info("The laser port works again")
            self._failing = False
