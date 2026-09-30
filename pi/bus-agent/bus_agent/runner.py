"""Builds a simulated bus and runs its loop. Real sensors are not wired in yet."""

from __future__ import annotations

import logging
import queue
from pathlib import Path
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

from beam_reading import BeamReader, SimulatedBeamSource
from safety_gate import GateConfig

from .agent import AgentConfig, BusAgent
from .backend import Backend, BackendError
from .config import AgentSettings
from .console import apply_command
from .lasers import LaserMarker
from .perception_worker import PerceptionWorker
from .recording import RecordingLineSource, RecordingPerception, ReplayLineSource, ReplayPerception
from .real_mode import RealSensors
from .sensors_real import ModelDetector, RealCamera
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
    agent_config: Optional[AgentConfig] = None,
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
        **({} if agent_config is None else {"config": agent_config}),
    )
    return SimulatedRig(agent, camera, beam_source, beam)


@dataclass
class RealRig:
    """One bus on real sensors. There is no scene to change, and the beam is never calibrated
    automatically: an operator confirms the path is empty and runs ``calibrate``."""

    agent: BusAgent
    beam: BeamReader
    worker: PerceptionWorker
    camera: RealCamera
    recorders: tuple = ()
    lasers: Optional[LaserMarker] = None


def build_real_rig(
    settings: AgentSettings,
    sensors: RealSensors,
    backend: Backend,
    clock: Callable[[], float] = time.monotonic,
    start_worker: bool = True,
    record_dir: Optional[Path] = None,
) -> RealRig:
    from .agent import AgentConfig  # noqa: PLC0415 - avoids a cycle at import time

    camera = RealCamera(sensors.grabber, clock)
    detector = ModelDetector(sensors.runner, settings.min_detection_confidence)
    worker = PerceptionWorker(camera, detector, settings.ramp_polygon, clock=clock)
    beam_source, perception, recorders = sensors.beam_source, worker, ()
    if record_dir is not None:
        # What is recorded: the ESP32's lines and the perception results. Never frames.
        beam_source = RecordingLineSource(beam_source, Path(record_dir) / "beam.jsonl", clock)
        perception = RecordingPerception(worker, Path(record_dir) / "perception.jsonl", clock)
        recorders = (beam_source, perception)
    beam = BeamReader(beam_source, clock=clock, simulated=False)
    # The marker lasers share the ESP32's serial port with the beam reader. A source that cannot send (a
    # fake, or none) means no lasers; the ramp logic does not depend on them. The hold after a stow stands
    # in for retraction time, which the simulated ramp does not have; it is as long as a deployment.
    send = getattr(beam_source, "send", None)
    lasers = None if send is None else LaserMarker(send, clock=clock, hold_seconds=settings.deploy_seconds)
    agent = BusAgent(
        bus_id=settings.bus_id,
        bus_service=settings.bus_service,
        backend=backend,
        camera=perception,
        detector=detector,
        beam_reader=beam,
        clock=clock,
        config=AgentConfig(
            heartbeat_seconds=settings.heartbeat_seconds,
            deploy_seconds=settings.deploy_seconds,
            ramp_polygon=settings.ramp_polygon,
            deployment_timeout_seconds=settings.deployment_timeout_seconds,
            link_loss_halt_seconds=settings.link_loss_halt_seconds,
        ),
        gate_config=GateConfig(max_camera_age_seconds=settings.max_camera_age_seconds),
        lasers=lasers,
    )
    if start_worker:
        worker.start()
    return RealRig(agent, beam, worker, camera, recorders, lasers)


@dataclass
class ReplayRig:
    """One bus fed from a recording. Everything it reports says it is not live."""

    agent: BusAgent
    beam: BeamReader


def build_replay_rig(
    bus_id: str,
    bus_service: str,
    backend: Backend,
    directory: Path,
    clock: Callable[[], float] = time.monotonic,
) -> ReplayRig:
    beam = BeamReader(ReplayLineSource(Path(directory) / "beam.jsonl", clock), clock=clock, simulated=True)
    perception = ReplayPerception(Path(directory) / "perception.jsonl", clock)
    agent = BusAgent(
        bus_id=bus_id, bus_service=bus_service, backend=backend, camera=perception, detector=None,
        beam_reader=beam, clock=clock,
    )
    return ReplayRig(agent, beam)


class Runner:
    def __init__(
        self,
        rig: SimulatedRig,
        events: "queue.Queue[dict]",
        commands: Optional["queue.Queue[str]"] = None,
        clock: Callable[[], float] = time.monotonic,
        board: Optional[StatusBoard] = None,
        controls: bool = True,
        auto_calibrate: bool = True,
    ) -> None:
        self._auto_calibrate = auto_calibrate
        self._board = board
        self._controls = controls
        self._rig = rig
        self._events = events
        self._commands = commands if commands is not None else queue.Queue()
        self._clock = clock
        self._warmed_up = False
        self._calibrated = False
        self._calibration_warned = False

    def step(self) -> None:
        """Apply pushed events and console lines, then run one agent tick."""
        self._drain(self._events, self._rig.agent.handle_event)
        self._drain(self._commands, lambda line: log.info("%s", apply_command(self._rig, line)))
        self._rig.agent.tick()
        if self._auto_calibrate and self._warmed_up and not self._calibrated:
            self._try_calibrate()
        if self._board is not None:
            agent = self._rig.agent
            self._board.publish(snapshot(agent, agent.last_beam, self._controls))

    def _try_calibrate(self) -> None:
        """Simulated sensors only: the path is empty by construction, so a reference that was refused (a
        slow start leaves the readings too spread out or too old) is simply tried again on the next tick."""
        try:
            reference = self._rig.beam.calibrate()
        except ValueError as error:
            if not self._calibration_warned:
                log.warning("Beam calibration not ready yet (%s); trying again on the next ticks", error)
                self._calibration_warned = True
            return
        self._calibrated = True
        log.info("Simulated beam calibrated at %s mm", reference)

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
        if not self._auto_calibrate:
            log.info("The beam is NOT calibrated: run the calibrate command with the path empty")
            return
        self._warmed_up = True
        self._try_calibrate()  # if it is refused, step() keeps trying

    def run(self, stop: threading.Event) -> None:
        while not stop.is_set():
            started = self._clock()
            self.step()
            stop.wait(max(0.0, TICK_SECONDS - (self._clock() - started)))
