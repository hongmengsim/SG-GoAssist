# pi/bus-agent

**Status: runs as a simulated bus against the real backend (verified by a one-off smoke run on 30 Sep 2026; the repeatable end-to-end script is the next item). Local status page, real-sensor start-up, configuration file and record/replay are built and tested with fakes. Never run on a Pi or with real sensors: the hardware-facing loaders are unverified.**

## Purpose

The program that runs on each Raspberry Pi and makes it behave as one bus. It joins the sensor inputs to the decision logic, keeps a simulated ramp, and talks to the backend. Pi #1 (Bus 1) will use the real camera and ToF; Pi #2 (Bus 2) runs the same program with simulated sensors, labelled as simulated everywhere.

The ramp is simulated only. States are `STOWED`, `DEPLOYMENT_REQUESTED`, `DEPLOYING`, `DEPLOYED`, `HALTED`. Nothing here claims physical verification.

## Interface

| File                                               | Role                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bus_agent/agent.py`                               | `BusAgent`: one tick reads the beam and camera, asks the gate, steps the ramp, posts reports                                                                                                                                                                                    |
| `bus_agent/ramp.py`                                | The simulated ramp state machine (pure; halts hold progress, resumes when the gate continues)                                                                                                                                                                                   |
| `bus_agent/adapters.py`                            | Converts `pi/perception` and `pi/tof-link` output into `pi/safety-gate` inputs                                                                                                                                                                                                  |
| `bus_agent/backend.py`                             | The `Backend` protocol the agent needs, plus `FakeBackend` for tests and simulation                                                                                                                                                                                             |
| `bus_agent/posting.py`                             | Post on change plus a slow heartbeat (5 s, matching the scale design); a failed post is retried                                                                                                                                                                                 |
| `bus_agent/signing.py`                             | Signed device requests, matching `backend/src/routes/auth.ts` (checked against a Node-computed signature)                                                                                                                                                                       |
| `bus_agent/http_backend.py`                        | The real backend over HTTP (standard library only): signed requests, 409 mapped to a refusal, other failures to retryable errors, capability registration                                                                                                                       |
| `bus_agent/event_listener.py`                      | Background WebSocket listener: subscribes to this bus only, forwards `ASSIST_REQUESTED` and `BAY_STATUS`, reconnects and re-subscribes                                                                                                                                          |
| `bus_agent/async_backend.py`                       | Non-blocking wrapper: every network call runs on one worker thread (latest report per kind, retried acknowledgements, cached polls, `post_now` with a timeout for entering the bay), so a stuck connection cannot delay the safety loop                                         |
| `bus_agent/status_page.py`, `status.html`          | Local status page (movement, simulated ramp, Pi decision with reasons, beam, camera health, backend link) guarded by a start-up code; simulation-only scene controls                                                                                                            |
| `bus_agent/config.py`, `agent.example.json`        | Strict JSON configuration: identity, backend URL, serial port, camera, model, ramp polygon, limits; unknown keys and secrets are refused                                                                                                                                        |
| `bus_agent/sensors_real.py`, `real_mode.py`        | Real-sensor adapters (fail-safe camera capture, detector output conversion, serial port opening) and the start-up check that refuses to start if any configured sensor is missing. `Picamera2Grabber`, `OpenCvGrabber` and `ultralytics_runner` are UNVERIFIED without hardware |
| `bus_agent/perception_worker.py`                   | Runs the camera and detector on a worker thread and publishes the newest result; the agent reads its age, so a stalled worker halts                                                                                                                                             |
| `bus_agent/recording.py`                           | Record and replay of ESP32 lines and perception results (never frames); replays say they are not live                                                                                                                                                                           |
| `bus_agent/runner.py`, `console.py`, `__main__.py` | Builds a simulated bus, runs its loop, and takes text commands (`arrive`, `place person`, `block on`, `dropout on`, `halt on`, `status`, ...)                                                                                                                                   |
| `bus_agent/sim_sensors.py`                         | A simulated camera (place objects, cover the lens, stop frames); the simulated beam lives in `pi/tof-link/beam_reading.py`                                                                                                                                                      |

## Behaviour

- **Safety is local.** The gate's decision steps the ramp whether or not the backend is reachable. Posting failures are logged and retried; they never stop a halt.
- **The bus confirms requests.** A pushed `ASSIST_REQUESTED` for this bus (or one found by the slow pull) is acknowledged by the agent; requests for other buses are ignored; a failed acknowledgement is retried. Until a request is accepted the gate halts with `NO_ACCEPTED_REQUEST`.
- **Actuator commands.** `DEPLOY_RAMP` requests a simulated deployment and reports `ACCEPTED`, `IN_PROGRESS` (with the halt reasons while halted) and `COMPLETED`. `RETRACT_RAMP` stows it. A command delivered twice is handled once. Commands the agent cannot perform (audio, display, dwell) are reported `FAILED`, never `COMPLETED`.
- **Bay.** `arrive(stop)` reports `POSITIONED_AT_STOP`; if the backend refuses (bay occupied or not granted) the bus reports `WAITING_FOR_BAY` and enters only when a `BAY_STATUS` grants it this bus. A waiting bus never deploys.
- **Departure.** `depart()` raises `DepartureBlocked` unless the ramp is stowed, and ends the accepted requests.
- **Telemetry.** `deploymentPathClear` is true only when the gate says `CONTINUE`. The vehicle interlocks (`vehicleStopped`, `parkingBrakeActive`, `doorOpen`) are simulated: a positioned bus counts as stopped, braked and open.
- **Reports** posted: bus status, the Pi's safety decision, simulated ramp state, and telemetry, each validated in tests against the JSON Schemas generated from `contracts/`.

## Not done yet

- The repeatable end-to-end scenario script (roadmap E1).
- Help-required and deployment timeouts (R1); the timeout value is not agreed and will not be invented.
- Running any of the real-sensor code on hardware (the loaders for the Pi camera, OpenCV and the model are unverified).

## Run it alone

With a backend running (for a bus-only acknowledgement start it with `GOASSIST_AUTO_ACK=off`):

```
set DEVICE_SHARED_SECRET=...      (only if the backend has one)
python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000
```

Real sensors: `python -m bus_agent --real --config agent.json [--record DIR]` (refuses to start unless every configured sensor opens; the beam is calibrated only by the `calibrate` command with the path empty). Replay: `--replay DIR --bus-id ...`. See `docs/runbooks/hardware-bring-up.md`. Add `--status-port 8770` to serve the status page; the start-up line prints a link ending in `#<code>` (keep the `#code`; the page shows nothing without it). It listens on this machine only unless `--status-listen 0.0.0.0` is given. Then type commands, for example `arrive 18331`, `place person`, `clear`, `block on`, `dropout on`, `status`, `depart`, `quit`. Everything it reports is labelled simulated. `--simulate` is required: real sensors are not wired in.

## Test

From this directory (needs `pip install -r requirements.txt` for the contract check):

```
python -m unittest
```

153 tests: ramp, signing and posting policy; the HTTP client against a fake transport (paths, signatures over the exact bytes, 409 as refusal, malformed responses); the WebSocket listener against a local server (subscribe, filter, reconnect); the console and runner; the agent scenarios (acknowledge, deploy, halt on an unsafe object, blocked beam, sensor dropout, covered or missing camera, operator halt, backend down, bay wait and grant, departure blocked with the ramp out, duplicate commands and requests, retry, heartbeat); and a check that every posted report validates against `contracts/schema`.

## Known gaps

- The event subscription is signed with the device secret (`SUBSCRIBE_DEVICE`, own bus only) when one is configured. The secret is still one shared value for all devices; per-device secrets and rotation are designed, not built.
- A refused acknowledgement or a rejected report (HTTP 4xx other than 409) is logged and retried, not escalated.

## Depends on

`pi/tof-link` (`beam_reading`), `pi/perception`, `pi/safety-gate`, and `contracts/` (via the generated schema, tests only). Third-party: `websockets` (event listener) and `jsonschema` (tests); HTTP uses the standard library. The sibling modules are reached by path (`bus_agent/_paths.py`), so the repository must be laid out as checked in.
