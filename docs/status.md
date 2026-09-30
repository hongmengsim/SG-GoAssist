# Status audit and checklist

Audit of the `integration` branch on 30 Sep 2026: 39 commits ahead of `main`, nothing pushed. Everything below is simulated unless it says otherwise: **no camera, ESP32, Raspberry Pi or physical ramp has been used**, and no model has run.

Legend: `[x]` built and verified by a test or a run (evidence given), `[ ]` not done, `[~]` partly done (the gap is stated).

## How it was verified

| Check                                                      | Result on 30 Sep 2026                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run verify` (full)                                    | 13 of 13 passed, including the passenger app and the end-to-end scenario                                            |
| `npm run verify:fast`                                      | 11 of 11 passed (last run after the final commit)                                                                   |
| Backend                                                    | 284 tests                                                                                                           |
| Passenger app                                              | 420 tests (last full run; unchanged code)                                                                           |
| Contracts                                                  | 4 (TypeScript, schema drift and fixtures) + 3 (Python, fixtures)                                                    |
| `pi/tof-link` / `perception` / `safety-gate` / `bus-agent` | 28 / 33 / 29 / 170 tests, no hardware                                                                               |
| `operator-console`                                         | 100 tests, including an integration test against the real built backend                                             |
| Module checker and verify runner                           | 18 tests                                                                                                            |
| `npm run e2e:scenario`                                     | 4 consecutive passes, about 40 s each: real backend, two simulated buses, signed requests, bus-only acknowledgement |
| Browser checks                                             | Console mock and live modes opened in the browser pane; no console errors                                           |

## Done

### Foundations

- [x] Ownership and naming rulings recorded (`docs/decisions/0002`, `docs/interfaces/message-additions.md`).
- [x] Full rename `packages/*` to `contracts/`, `backend/`, `passenger-app/`; hardware moved to `pi/`, `firmware/`, `archive/`; module READMEs, `scripts/modules.json`, boundary checker, `CODEOWNERS` (decision 0001).
- [x] Line endings fixed to LF (decision 0003).
- [x] `npm run verify` / `verify:fast`: one command, plain-text PASS or FAIL (no colour).
- [x] Scalability design with Built / Designed / Deferred labels, a measured bottleneck and `npm run bench:store` (decision 0004). Labels were brought up to date in this audit.

### Backend (roadmap B1 to B6, C1)

- [x] B1 Bus status, bay, ramp state, Pi decision and help-required stored one row per bus or stop behind repository interfaces (memory and SQLite adapters).
- [x] B2 Bus-only acknowledgement (`assist-ack`), `GOASSIST_AUTO_ACK=off`, the simulator route refuses to acknowledge when off; requests are pushed to the addressed bus (`ASSIST_REQUESTED`) with a pull fallback and no passenger identity.
- [x] B3 Single-bay coordination: FIFO queue, controller grant, refusal of an ungranted entry (409), departure never grants.
- [x] B4 Operator-only broadcasting through a topic-based `EventBus` with scoped operator subscriptions; passenger sockets never receive the new messages (tests).
- [x] B5 Audit read endpoint for SQLite and the ndjson file, filters and a bound.
- [x] B6 Pi halt through telemetry blocks deployment (tested over HTTP); bus movement maps to the app's `APPROACHING` / `ARRIVED` / `DEPARTED` events.
- [x] C1 JSON Schema generated from `contracts/`; shared valid and invalid fixtures checked in TypeScript, Python and by the backend; a field rename fails the drift test.

### Pi side in software (S1, P1, T1, A1 to A3)

- [x] S1 `pi/safety-gate`: fail-safe `decide()`; exhaustive combination tests; every decision validates against the report schema. Rewritten around the single-beam ToF states (the prototype used a distance threshold).
- [x] P1 `pi/perception`: safe/unsafe policy (unsafe by default; leaf and plastic bag only at 0.92 confidence or above), box-overlaps-polygon, image health, stub detector. No camera or model runner.
- [x] T1 `pi/tof-link/beam_reading.py`: `BeamReading` over the teammate's `BeamState` (their code untouched) with fake, simulated and serial line sources.
- [x] A1 `pi/bus-agent` core: ramp state machine, decision loop, backend interface, on-change plus 5 s heartbeat posting, signing that matches the backend.
- [x] A2 Agent against the real backend: HTTP client, WebSocket listener, simulated-bus runner and console commands.
- [x] Hardware preparation, no hardware needed: strict config file, real-sensor adapters, a start-up check that refuses to start half real, a perception worker thread (a stalled worker halts through result age), record and replay of ESP32 lines and perception results (never frames), and a bring-up runbook `docs/runbooks/hardware-bring-up.md`. Tested with fakes; the Pi camera, OpenCV and model loaders are unverified until run on hardware.
- [x] A3 Local status page (`--status-port`): movement, simulated ramp, Pi decision with reasons, beam, camera health and backend link in words and marks, guarded by a start-up code, no image data; simulation-only scene controls.
- [x] **Safety-loop isolation (found during A3):** every network call now runs on a worker thread (`async_backend.py`). Before, a blocked connection could stall a tick for many seconds and the ramp would act on a stale decision. A tick now also counts for at most 1 s of ramp movement. Tests include 50 ticks against a stuck backend finishing in under a second and still halting on a person.

### Platform and scale (SC2, SC4, SC5, SC7, SC8, part of SC6)

- [x] Roles: `GOASSIST_ROLES` mounts `passenger` and/or `operations`; a process with one role returns 404 for the other's routes (tests).
- [x] Rate limiting per class and key with priority shedding: safety traffic (buses) is never shed, browsing is shed first; 429 with `Retry-After`; off in tests unless asked for; limits are placeholders.
- [x] `Cache-Control` and ETag on bus-stop reference data (304 on repeat); `/ready` (store checks) and `/admin/metrics` (counts, latency percentiles, in-flight, subscribers); bounded in-memory log.
- [x] Load-test harness (`npm run load:test`, `load:overload`) with measured results in the scalability document, and a measured fix: batched audit writes (cold start p95 1.6 s to 7.6 ms; sustained rate about 1,000 to about 2,000 per second on this laptop).

- [x] Retention (`backend/src/services/retention.ts`, run when the data opens and once a minute): a finished case (COMPLETED, FAILED, CANCELLED) older than the age limit, or beyond the count limit, is appended to `cases-archive.ndjson` with its actuator commands and statuses and removed; escalated, blocked and unconfirmed cases are never removed; the growing series (observations, perception samples, commands, statuses) keep their newest records. Limits come from `GOASSIST_RETENTION_CASE_DAYS`, `GOASSIST_RETENTION_MAX_FINISHED_CASES` and `GOASSIST_RETENTION_MAX_SERIES_RECORDS`; the defaults (7 days, 2,000 cases, 5,000 records) are placeholders, not agreed values. The audit table is not trimmed. Done on CE2's instruction; the teammate should review it because it changes their store.
- [x] **SC10, the whole-state document is retired** (1 Oct 2026, on CE2's instruction): cases are one row each behind `CaseRepository` (`backend/src/cases`), and the other records (observations, capabilities, telemetry, actuator commands and statuses, devices, autonomous vehicles, ramp classifications, perception samples, docking) are keyed tables (`backend/src/storage/documentTable.ts`) behind `OperationsData` (`backend/src/services/operationsData.ts`); the audit log moved to `auditLog.ts`. All seven services that used the old store were converted, and their existing tests pass unchanged apart from two that reached into the old store's internals. Old data is imported once at start-up from an old `operations_state` row or `operations.json` (tests cover both and a corrupt file). Measured with `npm run bench:store` (SQLite, full flush per write): 1.30 ms per case write with no cases and 1.33 ms at 20,000 (x1.0, against about x450 before). Without SQLite the data is in memory only and does not survive a restart (a warning is logged). The teammate should review this: it rewrites their case service's storage calls (no behaviour change intended; the API is unchanged).
- [x] **Async storage ports (decision 0005, step 1, 1 Oct 2026):** all storage interfaces and the case service and its callers are asynchronous, so a network database can replace SQLite behind them. Backend 341 tests pass; the end-to-end scenario and the full verify pass. Steps 2 to 4 are tracked below.
- [x] **Shared event bus (decision 0005, step 2, 1 Oct 2026):** `BrokerEventBus` over a `MessageBroker` port, a `RedisBroker` adapter, and `GOASSIST_EVENT_BUS=redis`; 20 new tests (in-memory broker, fake Redis server, gateway). **Not run against a real Redis or with two real processes** (`docs/runbooks/multi-process.md`).
- [ ] Not done (steps 3 and 4): database-level concurrency instead of the in-process `KeyedMutex`, and moving the remaining in-memory state (legacy request and vehicle maps, diagnostics map, simulated bus) out of the process. The system is not yet multi-process.

### Operator halt

- [x] An operator halts or releases one bus (`POST /api/operations/vehicles/:busId/operator-halt`, operator token; the bus reads it signed at `GET` and is pushed `OPERATOR_HALT`); the bus gate adds `OPERATOR_HALT` to its reasons, so it can only make the bus safer; changes are audited and pushed once; the console's Halt bus / Release halt works in live mode; the end-to-end scenario checks it. Deploy stays a backend action.

### App check (R2)

- [x] R2 The passenger app's full journey passes with the backend's acknowledgement timer off and a bus-only responder acknowledging (`npm run test:e2e:journey-bus-ack`; both requests were acknowledged by the responder, two cases completed).

### End to end and operator console (E1, O1 to O4)

- [x] E1 `scripts/e2e_scenario.py` (in the full verify; now also covers an operator halt pushed to a bus and a stalled deployment raising help-required with a configured test timeout) plus the runbook `docs/runbooks/run-everything-on-one-laptop.md`.
- [x] O1 to O4 `operator-console/`: overview, stop, bus, filterable audit log, playground, live mode, case queue and case actions, autonomy panel, decision reasons in words, camera-view placeholder. Status is never colour alone (words, shape marks, border styles; tests enforce it).
- [x] The built-in `/operator` page was removed once the console covered it.

## Left to do

### Software, no hardware needed

- [~] **R1 Timeouts, help-required, link loss:** built and tested but **off by default**: `deploymentTimeoutSeconds` and `linkLossHaltSeconds` in the agent config (a stalled deployment raises help-required, fails its command and halts; a lost backend link halts the ramp). Values chosen by CE2 on 30 Sep 2026: deployment timeout 30 s; link-loss halt 10 s (both confirmed by CE2); both are set in `pi/bus-agent/agent.example.json`, and stay off in code unless a config sets them. Still to do: tell the team, and the backend-side lost-agent detection (heartbeat loss) is not built.
- [~] **R3 Security parity:** signed requests from Python, the operator token in the console, and signed per-bus WebSocket subscription (`SUBSCRIBE_DEVICE`; the Pi holds no operator token) are done. Per-device secrets (today one shared secret) and rotation are not.
- [~] **R4 Documentation:** runbook, endpoint reference and module READMEs done. Still to write: a hardware bring-up runbook, and an update to `CLAUDE.md`-style project notes.
- [~] **R5 CI:** `.github/workflows/ci.yml` written (node modules, each Python module, contracts Python, passenger app, end-to-end scenario and overload check) but **never run**; the branch is pushed, so the first run will show what needs fixing.
- [ ] **R6 Safe-object policy constants agreed with the team** (0.92 is in code; the size limit is open; the agent and backend must mirror the final values).
- [~] **Scale items:** done: SC2 role mounting (`passenger`, `operations`), SC4 rate limiting with priority and load shedding, SC5 cache headers on bus-stop data, SC7 `/admin/metrics` and `/ready`, SC8 load-test harness, bounded in-memory log and batched audit writes (part of SC6). Retention (rest of SC6) and SC10 (the whole-state document retired) are built (see the Platform and scale list). Not done: SC9 cursor-based command polling and store-and-forward, splitting the fleet role from the operator role, and the 3,000 messages per second target (measured about 2,000 per second on one process).
- [ ] **Update the teammate:** contract additions, `packages/*` rename, lockfile churn (about 150 lines), the audit-index addition to their store, the `/operator` removal, and how to refresh their checkout (decision 0003).
- [ ] Update the local `CLAUDE.md` to the current state.

### Needs hardware (deferred by scope)

- [ ] Flash and test the ESP32 sketches; read the ToF through `SerialLineSource`; take the reference; confirm on the device whether readings need the handshake and keepalive (`beam_reading` is read-only).
- [ ] Pi bring-up: follow `docs/runbooks/hardware-bring-up.md` (the `--real` mode, config and recording exist; camera capture, serial permissions and a service definition remain to be done on the Pi).
- [ ] Aim and align the beam, camera view and ramp polygon; tune the health thresholds on real frames.
- [ ] Two Pis on a network with synchronised clocks (signatures allow 60 s).
- [ ] Run the scenario by hand on real Bus 1 and record the results and latencies.

### Needs the ML work (owner: CE2)

- [ ] Film, label (with double-labelled frames for Cohen's kappa), train, evaluate once on the sealed set, write model cards.
- [ ] A model runner behind the `Detector` protocol; a benchmark at or above 10 FPS on the Pi; the zero-missed-obstruction matrix. The pretrained model cannot see wheelchairs, strollers or boxes; until a fine-tuned model exists only the beam guards against them.
- [ ] ML 3 dwell classifier or the documented fixed-dwell fallback.

## Known gaps and risks

- **Nothing has run on hardware.** Every "real" claim above means "the real backend and the real code paths", with simulated sensors and a simulated ramp, labelled as such in every report.
- **A lost backend link halts an in-progress deployment only if `linkLossHaltSeconds` is set** (off by default until the value is agreed); the loop itself keeps running on its own either way. The local gate keeps running and halts on an obstruction, but nothing halts on link loss alone (R1).
- **No timeouts unless configured:** a stalled deployment is only detected if `deploymentTimeoutSeconds` is set. Placeholders that must not be mistaken for agreed values: simulated deployment time 4 s, poll intervals, camera freshness 1.0 s, the placeholder ramp polygon, image-health thresholds, the mock console's 8 s stall timeout.
- **Case data needs SQLite to survive a restart:** on a runtime without `node:sqlite` the operations data is in memory only (a warning is logged). The previous JSON-file fallback was removed with the whole-state document.
- **The mock console's gate rules are stand-ins** for `pi/safety-gate`.
- **Cancelling a request only starts a safe stow;** the request keeps showing "Confirmed by bus" until the case finishes.
- **The console's live camera view is a labelled placeholder;** the ramp-zone panel is drawn from the Pi's decision, not an image.
- **Unresolved from the 29 Sep handoff:** alighting and destination scope in the app (documented, not hidden), backend as both cloud and controller, final ToF sensor, submission deadline.
- **Contract change process:** additions to `contracts/` (operator-only messages, report types) were made ahead of a written proposal; recorded in `docs/interfaces/message-additions.md`.
- **CI is unverified** until something is pushed.

## Hardware bring-up log (branch `hardware-bringup`)

Only what was run on hardware and shown in pasted output is marked "verified on hardware". Everything else stays not verified. The ramp is simulated only; no camera frames are stored.

### Stage 1: ESP32 serial link (Pi #1, 30 Sep 2026)

- **Verified on hardware:** the Pi sees the ESP32 as `/dev/ttyACM0` (`1a86:55d3 QinHeng USB Single Serial`, `cdc_acm` driver; there is no `/dev/serial/by-id/` entry, so configure the `ttyACM0` path). Reading 115200 baud with nothing sent gave `time_ms,VL53L0X,distance_mm,status` lines about every 294 ms for 10 s with no restart. `VALID` distances and `NA,INVALID_status_2` lines both arrive. Distance readings therefore need no handshake or keepalive; a writer is still untested for the lasers.
- **Not verified:** stable power. Before that read the ESP32 restarted about every 3 s, with `over-current change` messages on all four USB ports. After a re-plug at 362.9 s the log stayed quiet for about 72 s. `vcgencmd get_throttled` returned `0x50000` (under-voltage and throttling have occurred since boot; none at the time of the check). The Pi supply is marginal; the cause of the earlier loop is not proven.
- **Not verified:** the backstop distance. The readings sat at 21 to 27 mm, then 47 to 258 mm with gaps; where the board and hand were was not recorded. Calibration needs a reference of 150 to 1000 mm.

### Stage 2: ToF beam states through `pi/tof-link` (Pi #1, 30 Sep 2026)

Run with a throwaway script that drives `BeamReader` on the real ESP32 over `/dev/ttyACM0` (it sends nothing and stores nothing). The agent's own `calibrate` command was not used: `--real` refuses to start until the camera and model also open.

- **Verified on hardware:**
  - Before calibration the state was `UNCALIBRATED` (`UNKNOWN` for the first reading only).
  - The first calibration attempt was refused ("Wait for 10 fresh valid readings"); the second gave a reference of 228.5 mm.
  - With the path empty: `BEAM_CLEAR` at 226 to 234 mm.
  - With a hand in the beam: `BLOCKED` at 34 to 115 mm.
  - After the hand was withdrawn: `CHECKING`, then `BEAM_CLEAR`.
  - With the backstop removed: `UNKNOWN` with no distance for the whole 6 s, never `BEAM_CLEAR`.
- **Not verified:**
  - Hand timing was loose. Both the hand-in and hand-out runs show `BLOCKED` twice, so the exact block and clear latency is not measured.
  - Unplugging the ESP32 gives `UNKNOWN` within about a second and halts the gate: not tested (the halt needs the agent).
  - The agent's own `calibrate` command and the gate's halt reasons: not tested (Stage 5).
  - Stable power: `throttled=0x50000` and 390 over-current lines were still present at uptime 1024 s. The supply is still suspect.
- **Observation:** clear readings drifted between 226 and 249 mm against a 228.5 mm reference, about 20 mm from the reference at the top, against a 30 mm margin. The margin is thin for this sensor and backstop.

### Stages 1 and 2, re-run after the power fault was removed (30 Sep 2026)

- **Cause of the power fault (reported by CE2, not measured by me):** a phone was connected to the Pi's USB port. With it removed the fault stopped. Until then the ESP32 repeatedly dropped off USB (`OSError: [Errno 5] Input/output error` in the reader), with `over-current change` bursts on all four USB ports. Over-current lines also appeared with the ESP32 unplugged (330 to 390 in 30 s), so the ESP32 was not their source. A new cable had already cleared the under-voltage (`throttled=0x0`, `EXT5V_V` 4.92 to 5.00 V) but not the over-current.
- **Verified on hardware (clean re-run of the beam test, new reference 259.0 mm):**
  - `UNCALIBRATED` before calibration; calibration was refused twice ("Wait for 10 fresh valid readings", then "Reference is moving/noisy"), then accepted at 259.0 mm.
  - Path empty: `BEAM_CLEAR` at 256 to 260 mm for 5 s.
  - Hand held in the beam: `BLOCKED` from the first reading in the block, 65 mm falling to 35 to 43 mm, held for the whole 6 s.
  - Hand withdrawn: `BLOCKED` for about 1.5 s, then `CHECKING` for two readings, then `BEAM_CLEAR` for the rest.
  - Backstop removed: `UNKNOWN` with no distance for the whole 6 s.
  - The whole run (about 40 s) completed with no serial error.
- **Not verified:** `throttled`, `EXT5V_V` and the over-current count were not pasted after the phone was removed, so power is judged only by the run completing. Unplugging the ESP32 mid-run and the gate's halt need the agent (Stage 5).
- **Observation:** with the backstop untouched, clear readings sat 15 to 25 mm above the 259.0 mm reference (274 to 284 mm) after the hand was withdrawn. The margin is 30 mm, so this is close.
- **Open code issue seen on hardware, not yet fixed:** `SerialLineSource.read_lines` (`pi/tof-link/beam_reading.py`) has no handling for the port vanishing, and `BusAgent._decide` calls it unguarded, so an unplugged ESP32 would raise out of the tick instead of reporting `UNKNOWN`. To be tested and fixed before the unplug check in Stage 5.

### Stage 3 (partial) and the model already on the Pi (30 Sep 2026)

- **Camera capture, verified on hardware:** the Pi camera (`imx708_wide`) opens through the agent's own `Picamera2Grabber` path and delivers 640x640x3 frames at about 9 per second. A normal lit scene read healthy on all 37 frames (mean 116.6, std 58.2). The helper printed only summary numbers; no frame was saved, written or sent.
- **Image-health check on real frames, NOT verified:** "lens covered" (mean 113.9, std 50.5) and "dark" (mean 73.0, std 89.4) both read healthy on every frame. Either the lens was not actually covered during the timed window or the placeholder thresholds are too permissive for this camera. A re-run with the lens covered first is pending; the thresholds in `pi/perception/perception/health.py` are unchanged.
- **Model plug-in, verified on hardware (load and speed only):** `/home/pi/yolo11n_ncnn_model` (Ultralytics YOLO11n NCNN export, stock COCO 80 classes, 640x640, from a 23 Sep 2026 export) loads through the repo's own `ultralytics_runner` (ultralytics 8.4.162). Load 1.8 s. On a blank synthetic frame (not a camera frame) it ran 93.4 ms per frame, 10.7 frames per second, over 20 runs, with an empty result. That measures inference only, on one blank input: not with camera capture, a live scene, detections in the frame, or the agent running at the same time. It says nothing about detection quality; that is CE2's ML work and was not evaluated.
- **What the model can name:** COCO classes such as person, bicycle, backpack, handbag, suitcase and chair. It has no wheelchair, stroller or box class (as the repo already states); only the beam guards those until a fine-tuned model exists. Not tested: how the safe/unsafe policy behaves on real detections from this model.
- **To use it:** set `modelPath` in `agent.json` to the model folder (`/home/pi/yolo11n_ncnn_model`), not a `.param` file. Not yet run through `--real`.
