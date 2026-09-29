# pi/bus-agent

**Status: planned, not implemented.**

## Purpose

The program that runs on each Raspberry Pi and makes it behave as one bus. It joins the sensor inputs to the decision logic, keeps a simulated ramp, talks to the backend, and shows a small local status page. Pi #1 (Bus 1) uses the real camera and ToF; Pi #2 (Bus 2) runs the same program with simulated sensors, labelled as simulated everywhere.

The ramp is simulated only. States are `STOWED`, `DEPLOYMENT_REQUESTED`, `DEPLOYING`, `DEPLOYED`, `HALTED`. Nothing here claims physical verification.

## Interface

**Talks to the backend** over HTTP with signed device headers (`DEVICE_SHARED_SECRET`), all typed in `contracts/`:

- registers its capability; posts `SafetyTelemetry` with `deploymentPathClear = (permission === CONTINUE)` and no `rampObstacle`;
- posts bus movement (`BusStatus`), the Pi's `RampSafetyDecision`, `RampSimulationStatus`, and `HelpRequired` (for example a deployment timeout);
- acknowledges assistance requests, so "Confirmed by bus" comes from the bus;
- polls actuator commands and its bay grant, and only enters the bay when granted.

Posts at a fixed slow rate and on every change, never per camera frame.

**Local status page:** ramp state, current decision with reasons, ToF state, camera health. Guarded by a start-up control code like the ToF demo. No frames are recorded.

## Run it alone

Planned: `--simulate` starts with simulated sensors and no camera, serial port or ESP32. Tests use a `FakeBackend`, so no backend is needed either.

## Test

Planned: `python -m pytest` against `FakeBackend` and simulated sensors; plus a contract test that every message the agent can emit validates against the schema generated from `contracts/`.

## Depends on

`pi/tof-link` (beam state), `pi/perception` (objects), `pi/safety-gate` (decision), and `contracts/` (via the generated schema). It reaches them only through their documented interfaces.
