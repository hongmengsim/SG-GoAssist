"""Builds a simulated bus and runs its loop. Real sensors are not wired in yet."""

from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

from beam_reading import BeamReader, SimulatedBeamSource

from .agent import BusAgent
from .backend import Backend, BackendError
from .console import apply_command
from .status_page import StatusBoard, snapshot
from .sim_sensors import SimulatedCamera

log = logging.getLogger(__name__)

TICK_SECONDS = 0.2
WARM_UP_TICKS = 10  # the beam needs ten fresh readings to take its reference
SIMULATED_CAPABILITY_TELEMETRY = (
    "vehicleStopped",
    "parkingBrakeActive",
    "doorOpen",
    "deploymentPathClear",
    "rampPosition",
)


@dataclass
class SimulatedRig:
    """One simulated bus and the handles a scenario uses to change its surroundings."""

    agent: BusAgent
    camera: SimulatedCamera
    beam_source: SimulatedBeamSource
    beam: BeamReader


def capability_for(bus_service: str) -> dict:
    """What this simulated bus can do. It claims no audio, display or dwell control."""
    return {
        "busService": bus_service,
        "autonomous": False,
        "ramp": True,
        "externalAudio": False,
        "visualDisplay": False,
        "dwellControl": False,
        "wheelchairSpaceCapacity": 1,
        "supportedTelemetry": list(SIMULATED_CAPABILITY_TELEMETRY),
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    }


def build_simulated_rig(
    bus_id: str,
    bus_service: str,
    backend: Backend,
    clock: Callable[[], float] = time.monotonic,
) -> SimulatedRig:
    camera = SimulatedCamera(clock)
    beam_source = SimulatedBeamSource()
    beam = BeamReader(beam_source, clock=clock, simulated=True)
    agent = BusAgent(
        bus_id=bus_id,
        bus_service=bus_service,
        backend=backend,
        camera=camera,
        detector=camera,
        beam_reader=beam,
        clock=clock,
    )
    return SimulatedRig(agent, camera, beam_source, beam)


class Runner:
    def __init__(
        self,
        rig: SimulatedRig,
        events: "queue.Queue[dict]",
        commands: Optional["queue.Queue[str]"] = None,
        clock: Callable[[], float] = time.monotonic,
        board: Optional[StatusBoard] = None,
        controls: bool = True,
    ) -> None:
        self._board = board
        self._controls = controls
        self._rig = rig
        self._events = events
        self._commands = commands if commands is not None else queue.Queue()
        self._clock = clock

    def step(self) -> None:
        """Apply pushed events and console lines, then run one agent tick."""
        self._drain(self._events, self._rig.agent.handle_event)
        self._drain(self._commands, lambda line: log.info("%s", apply_command(self._rig, line)))
        self._rig.agent.tick()
        if self._board is not None:
            agent = self._rig.agent
            self._board.publish(snapshot(agent, agent.last_beam, self._controls))

    @staticmethod
    def _drain(source: queue.Queue, handle: Callable) -> None:
        while True:
            try:
                item = source.get_nowait()
            except queue.Empty:
                return
            handle(item)

    def start_up(self, backend: object) -> None:
        """Register the capability, then let the beam take its empty-path reference."""
        register = getattr(backend, "register_capability", None)
        if register is not None:
            try:
                register(capability_for(self._rig.agent.bus_service))
            except BackendError as error:
                log.warning("Could not register the vehicle capability yet: %s", error)
        for _ in range(WARM_UP_TICKS):
            self.step()
            time.sleep(TICK_SECONDS)
        try:
            reference = self._rig.beam.calibrate()
            log.info("Simulated beam calibrated at %s mm", reference)
        except ValueError as error:
            log.error("Beam calibration failed: %s", error)

    def run(self, stop: threading.Event) -> None:
        while not stop.is_set():
            started = self._clock()
            self.step()
            stop.wait(max(0.0, TICK_SECONDS - (self._clock() - started)))
