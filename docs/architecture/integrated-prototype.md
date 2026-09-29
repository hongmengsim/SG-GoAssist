# Grand Challenge integrated prototype

## Implemented system boundary

SG GoAssist now provides a complete competition software loop:

`explicit or anonymous signal → retained passenger intent → consolidated assistance case → vehicle capability check → safety gate → idempotent actuator command → local interlock → limit-switch verification → outcome metrics`

The legacy passenger request endpoints remain compatible and now return an optional `caseId`. App, physical-button, NFC, operator, camera, pressure, and distance inputs share the operations model in `@buspass/shared`.

## Safety policy

Ramp movement requires a confirmed ramp intent, assigned bus and stop, a ramp-capable vehicle with available wheelchair capacity, fresh telemetry, stopped vehicle, parking brake, open door, clear path, online controller, and no ramp fault. `READY` additionally requires both a completed actuator status and `DEPLOYED` limit-switch telemetry.

Sensor-only wheelchair detections enter `NEEDS_CONFIRMATION`. The auditable boarding-intent assessment may label fused perception as `LIKELY`, but only passenger or operator consent marks the selected bus `CONFIRMED`. Extended dwell may proceed from an anonymous sensor because it is reversible. An obstruction, occupied wheelchair space, lost/stale telemetry, controller offline state, actuator fault, or timeout enters a visible blocked/failed/escalated state. A fresh safe state plus operator retry is required before another movement attempt.

Boarding or alighting detection no longer closes a ramp case immediately. It issues `RETRACT_RAMP`, maintains the stopped/brake/door/path interlocks, and records `COMPLETED` or `CANCELLED` only after the stowed limit switch is verified. The mock-bus firmware also polls for passenger cancellation while deploying and stops motion locally when cancellation arrives.

The mock-bus ESP32 independently repeats the stopped, brake, door, and obstruction checks during movement. Backend clearance alone is not sufficient to energise its servo.

## Persistence, privacy, and access

- Current operations state is transactionally stored in `.runtime/operations.sqlite` on Node runtimes with built-in SQLite and restored after backend restart. A backed-up `.runtime/operations.json` store is used as the Node 20 compatibility fallback.
- Every material signal, capability, telemetry, operator, and actuator transition is inserted into the append-only SQLite audit table and mirrored to `.runtime/audit.ndjson`.
- Signal and command idempotency keys prevent replayed requests from duplicating actions.
- Stale sensor, telemetry, and actuator events are rejected or block the case.
- The stop node stores failed explicit requests in ESP32 NVS and retries after reconnection.
- Camera metadata keys for images, frames, faces, biometrics, photos, or video are stripped. The reference edge observer never saves or uploads frames.
- Set `DEVICE_SHARED_SECRET` to require timestamped HMAC-SHA256 device requests.
- Set `OPERATOR_API_TOKEN` to protect operator APIs and live operations subscriptions. Open `/operator?token=...` for the protected console.
- HTTPS termination and per-device secrets are expected at the deployment gateway; development defaults remain loopback-friendly.

## Operations API

- `POST /api/operations/signals`
- `GET /api/operations/cases`
- `GET /api/operations/cases/:caseId`
- `POST /api/operations/cases/:caseId/operator`
- `POST /api/operations/perception/evaluations`
- `GET /api/operations/perception/metrics`
- `POST /api/operations/cases/:caseId/assign`
- `POST /api/operations/cases/:caseId/feedback`
- `GET /api/operations/vehicles/capabilities`
- `PUT /api/operations/vehicles/:busId/capabilities`
- `GET|POST /api/operations/vehicles/:busId/telemetry`
- `GET /api/operations/actuators/pending?busId=`
- `POST /api/operations/actuators/:commandId/status`
- `POST /api/operations/devices/heartbeat`
- `GET /api/operations/devices`
- `GET /api/operations/metrics`

WebSocket clients can subscribe with `SUBSCRIBE_CASE` or `SUBSCRIBE_OPERATIONS`. Published event families are `CASE_STATUS`, `SAFETY_TELEMETRY`, `ACTUATOR_STATUS`, `OPERATOR_ESCALATION`, and `DEVICE_HEALTH`, in addition to the legacy passenger and vehicle messages.

## Portable build

| Module | Core parts | Purpose |
|---|---|---|
| Accessible stop | ESP32, 3 tactile buttons, MFRC522, HC-SR04, LED, buzzer, vibration motor | Explicit multimodal intent, anonymous zone sensing, feedback, offline queue |
| Edge observer | USB/CSI camera and local compute | In-memory wheelchair, walking-aid, stroller, and luggage classification |
| Mock bus | ESP32, low-voltage servo, VL53L5CX 8×8 laser ranging sensor, four safety switches, two ramp limit switches, speaker/display | Ramp-envelope sensing, capabilities, fresh telemetry, fail-safe actuation and verification |
| Operator console | Laptop/tablet browser | Multi-bus case queue, safety checklist, confirmation, escalation, retry, completion |

Do not attach this prototype controller to a passenger vehicle. A production ramp controller requires certified automotive hardware, safety engineering, independent emergency-stop circuitry, formal hazard analysis, and operator approval.

## Hazard controls

| Hazard | Prevention / detection | System response |
|---|---|---|
| Wrong bus or stop | Vehicle and stop match in case + telemetry | Confirmation or block |
| Vehicle moves during deployment | stopped + parking brake inputs | No command; local stop if signal changes |
| Door closed | door interlock | No command / immediate block |
| Person or object in path | obstruction input | Stop movement and escalate |
| Stale or lost telemetry | five-second freshness window | Block and alert operator |
| Ramp position disagreement | deployed/stowed limit switches | Never show ready; fault escalation |
| Occupied wheelchair space | occupancy telemetry and capacity | Operator escalation |
| Duplicate requests | individual intents + idempotent action key | Preserve passenger count; one actuator action |
| Network loss | NVS store-and-forward + idempotency | Retry without duplicate movement |

## Evidence workflow

The automated suite covers safe deployment, obstruction, sensor-only confirmation, multiple passengers sharing an actuator action, persistence reload, REST integration, and live operator events. For physical evidence, record at least 30 trials per input source and 50 interlock/obstruction trials. Export the `/metrics` snapshot and append-only audit after each run. The remaining acceptance work is physical assembly, controlled classifier validation, consented representative-user testing, and certified production safety review.
