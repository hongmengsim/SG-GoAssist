# pi/bus-agent

**Status: core implemented and tested against a fake backend and simulated sensors. Not yet connected to the real backend (next item), no status page yet, never run on a Pi.**

## Purpose

The program that runs on each Raspberry Pi and makes it behave as one bus. It joins the sensor inputs to the decision logic, keeps a simulated ramp, and talks to the backend. Pi #1 (Bus 1) will use the real camera and ToF; Pi #2 (Bus 2) runs the same program with simulated sensors, labelled as simulated everywhere.

The ramp is simulated only. States are `STOWED`, `DEPLOYMENT_REQUESTED`, `DEPLOYING`, `DEPLOYED`, `HALTED`. Nothing here claims physical verification.

## Interface

| File                       | Role                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bus_agent/agent.py`       | `BusAgent`: one tick reads the beam and camera, asks the gate, steps the ramp, posts reports                               |
| `bus_agent/ramp.py`        | The simulated ramp state machine (pure; halts hold progress, resumes when the gate continues)                              |
| `bus_agent/adapters.py`    | Converts `pi/perception` and `pi/tof-link` output into `pi/safety-gate` inputs                                             |
| `bus_agent/backend.py`     | The `Backend` protocol the agent needs, plus `FakeBackend` for tests and simulation                                        |
| `bus_agent/posting.py`     | Post on change plus a slow heartbeat (5 s, matching the scale design); a failed post is retried                            |
| `bus_agent/signing.py`     | Signed device requests, matching `backend/src/routes/auth.ts` (checked against a Node-computed signature)                  |
| `bus_agent/sim_sensors.py` | A simulated camera (place objects, cover the lens, stop frames); the simulated beam lives in `pi/tof-link/beam_reading.py` |

## Behaviour

- **Safety is local.** The gate's decision steps the ramp whether or not the backend is reachable. Posting failures are logged and retried; they never stop a halt.
- **The bus confirms requests.** A pushed `ASSIST_REQUESTED` for this bus (or one found by the slow pull) is acknowledged by the agent; requests for other buses are ignored; a failed acknowledgement is retried. Until a request is accepted the gate halts with `NO_ACCEPTED_REQUEST`.
- **Actuator commands.** `DEPLOY_RAMP` requests a simulated deployment and reports `ACCEPTED`, `IN_PROGRESS` (with the halt reasons while halted) and `COMPLETED`. `RETRACT_RAMP` stows it. A command delivered twice is handled once. Commands the agent cannot perform (audio, display, dwell) are reported `FAILED`, never `COMPLETED`.
- **Bay.** `arrive(stop)` reports `POSITIONED_AT_STOP`; if the backend refuses (bay occupied or not granted) the bus reports `WAITING_FOR_BAY` and enters only when a `BAY_STATUS` grants it this bus. A waiting bus never deploys.
- **Departure.** `depart()` raises `DepartureBlocked` unless the ramp is stowed, and ends the accepted requests.
- **Telemetry.** `deploymentPathClear` is true only when the gate says `CONTINUE`. The vehicle interlocks (`vehicleStopped`, `parkingBrakeActive`, `doorOpen`) are simulated: a positioned bus counts as stopped, braked and open.
- **Reports** posted: bus status, the Pi's safety decision, simulated ramp state, and telemetry, each validated in tests against the JSON Schemas generated from `contracts/`.

## Not done yet

- The real HTTP and WebSocket link to the backend, registering the vehicle capability, and running as Bus 1 and Bus 2 (roadmap A2).
- The local status page (A3).
- Help-required and deployment timeouts (R1); the timeout value is not agreed and will not be invented.
- A camera and a model runner (deferred until a Pi is available).

## Run it alone

Nothing to run yet beyond the tests; a `--simulate` entry point comes with A2.

## Test

From this directory (needs `pip install -r requirements.txt` for the contract check):

```
python -m unittest
```

45 tests: ramp, signing and posting policy; the agent scenarios (acknowledge, deploy, halt on an unsafe object, blocked beam, sensor dropout, covered or missing camera, operator halt, backend down, bay wait and grant, departure blocked with the ramp out, duplicate commands and requests, retry, heartbeat); and a check that every posted report validates against `contracts/schema`.

## Depends on

`pi/tof-link` (`beam_reading`), `pi/perception`, `pi/safety-gate`, and `contracts/` (via the generated schema, tests only). The sibling modules are reached by path (`bus_agent/_paths.py`), so the repository must be laid out as checked in.
