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
- [x] **Shared event bus (decision 0005, step 2, 1 Oct 2026):** `BrokerEventBus` over a `MessageBroker` port, a `RedisBroker` adapter, and `GOASSIST_EVENT_BUS=redis`; 20 new tests (in-memory broker, fake Redis server, gateway). **Also checked against a real Redis with two real backend processes** (`npm run check:multi-process`, 1 Oct 2026, Redis in WSL Ubuntu 22.04, ioredis installed with `--no-save`): 7 checks pass.
- [x] **Shared lock (decision 0005, step 3, 1 Oct 2026):** `KeyedLock` with an in-process and a database-lease implementation replaces every in-process mutex and restores atomic read-modify-write in the case service (a burst of 20 simultaneous requests ends on one case, and the same burst without the lock races). Tested across two SQLite connections on one file, not across two real backend processes.
- [x] **No domain state in process memory (decision 0005, step 4, 1 Oct 2026):** legacy requests, vehicle statuses, announcements and assistant diagnostics moved into the shared tables; request waiters use the event bus plus polling.
- [x] **Postgres adapter and two-process checks (decision 0005, step 5, 1 Oct 2026):** repositories, keyed tables, audit and lock leases on Postgres (`GOASSIST_DATABASE_URL`); one contract suite runs against memory, SQLite, the generic tables and Postgres; `npm run check:multi-process` passes with two real processes on shared Postgres, Redis and locks (shared data, one event once, 20 simultaneous passengers on one case); the full end-to-end scenario passes on Postgres (one process); the load test sustains 300 msg/s on one process and 600 on two (p95 under 100 ms) on this laptop. Verified on a Windows laptop with Postgres 14 and Redis in WSL on the same machine.
- [x] **Lock-free hot path and the scenario across two processes (decision 0005, step 6, 1 Oct 2026):** stale and repeat reports use one atomic compare-and-swap and take no lock lease (tested on every adapter, including Postgres with simultaneous swaps); bus status ingest now sustains 600 msg/s on one process and 1,000 on two (p95 under 100 ms) on this laptop, against 300 and 600 before; the whole Python scenario passes across two real processes (`npm run e2e:scenario:two`).
- [ ] **Not yet shown:** processes on separate machines, more than two processes, and 3,000 msg/s. Rate limits and metrics are per process. `pg` and `ioredis` are not dependencies (install with `--no-save`); the CI job that runs them (`postgres-redis`, now including the two-process scenario) has not run yet.

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
