# Integration proposal 01: message additions

**Status (30 Sep 2026): approved in direction by the project owner.** Ownership ruling: laser/ToF and passenger-app behaviour follow this repo's existing implementation unchanged; the controller/operator UI follows the CE2 prototype; all naming follows this repo's conventions (UPPER_SNAKE values, camelCase fields, this repo's ids and class labels); new statuses are added only where the 29 Sep handoff needs something this repo lacks.

## Naming rules (prototype -> this repo)

| Prototype (bus-project-2)                                                  | This repo                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `travelling_to_stop`, `waiting_for_bay`, `positioned_at_stop`, `departing` | `TRAVELLING_TO_STOP`, `WAITING_FOR_BAY`, `POSITIONED_AT_STOP`, `DEPARTING`                       |
| `stowed`, `deployment_requested`, `deploying`, `deployed`, `halted`        | `STOWED`, `DEPLOYMENT_REQUESTED`, `DEPLOYING`, `DEPLOYED`, `HALTED`                              |
| `clear`, `occupied`, `uncertain`; `continue`, `halt`                       | `CLEAR`, `OCCUPIED`, `UNCERTAIN`; `CONTINUE`, `HALT`                                             |
| `submitted`, `confirmed_by_bus`, `cancelled`, `cannot_fulfil`              | `SENDING`, `ACKNOWLEDGED`, `CANCELLED`, `FAILED` (existing)                                      |
| `completed` request                                                        | case state `COMPLETED` (existing); no new request status                                         |
| `snake_case` fields (`zone_state`, `capture_ts`)                           | `camelCase` (`zoneState`, `observedAt`)                                                          |
| `bus1`, `bus2`, `STOP-01`, `BAY-A`, services 190/14/77                     | registered bus ids (e.g. `AV-095-01`), numeric stop codes (e.g. `18331`), services 95/191        |
| `rollator_walker`, `bag_or_box`                                            | `walker`; `luggage` for suitcases; `bag_or_box` kept as a new label for bags/boxes/bottles       |
| free-text reasons (`tof_unavailable`)                                      | `HaltReason` enum                                                                                |
| UI log kinds (`cmd`, `ok`, `fault`, `op`)                                  | derived from the backend's audit event names (`SIGNAL_ACCEPTED`, `ACTUATOR_COMMAND_ISSUED`, ...) |

Branch: `integration`. Scope: add the few messages the SG GoAssist handoff needs that `contracts` does not have yet. **Additive only.** Existing types, statuses and endpoints keep their meaning, so the current app and all 94 backend tests are unaffected.

## What the handoff needs vs what exists

| Handoff need                                                           | Exists today                                                                                      | Gap                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Passenger sees only "Request submitted" / "Confirmed by bus"           | `SENDING` / `ACKNOWLEDGED` request statuses                                                       | `ACKNOWLEDGED` is set automatically by a timer (`assistanceRequestService.ts:117`), not by a bus |
| Bus movement: travelling / waiting for bay / positioned / departing    | `VehicleStatus` (APPROACHING, ARRIVED, DEPARTED); `AutonomousDriveState` (docking-based)          | No `waiting for bay`, no bay occupancy                                                           |
| Ramp states: stowed, deployment requested, deploying, deployed, halted | `RampPosition` (STOWED, DEPLOYING, DEPLOYED, RETRACTING, FAULT, UNKNOWN); actuator command states | No `halted`; nothing marks the ramp as simulated                                                 |
| Pi's continue/halt decision with reasons                               | `SafetyTelemetry.deploymentPathClear` (boolean) and `rampObstacle`                                | Reasons and inputs are not carried, so the console cannot say _why_ it halted                    |
| Bus reports "help required" with state and reason                      | `OPERATOR_ESCALATION` (case level)                                                                | No bus-originated help message; no deployment-timeout reason                                     |
| Audit view of all requests and events                                  | Append-only audit table (`.runtime/audit.ndjson`)                                                 | Not readable through the API (only `/admin/logs`)                                                |

## Constraints found in the code (these shape the design)

1. **Do not extend `RampPosition` or the request statuses.** The app validates incoming messages against fixed sets (`statusSocket.ts`: `rampPositions`, `requestStatuses`). A new value would make the app silently drop `SAFETY_TELEMETRY` and request updates. New states therefore go in new message types.
2. **The app ignores unknown message types** (`parseStatusUpdate` returns `null`), so new message types are safe for the app.
3. **Broadcast routing** (`websocket.ts: broadcastStatusUpdate`) sends a message to any client whose `busId` matches. New operational messages should go to **operator subscribers only** so phones do not receive bay or safety internals.
4. **Requests need a registered bus.** `createStandardizedAssistanceRequestBundle` throws `Bus not found` unless the bus is in `data/buses.mock.ts`. Our two demo buses must be registered there.
5. **The backend gate reads `deploymentPathClear`.** `rampSafetyFailure` blocks when it is `false`. The Pi's halt therefore maps onto an existing field with **no gate change**.
6. **`rampObstacle` in telemetry is re-fused by the backend** (`ingestSafetyTelemetry` calls `fuseRampObstacleAssessment`). The Pi is the authority, so the Pi omits `rampObstacle` (it is optional) and reports its decision through `deploymentPathClear` plus the new decision message.

## Proposed additions to `contracts/src/index.ts`

```ts
/** Bus movement relative to a stop. Separate from request status, ramp state and faults. */
export type BusMovementState =
  "TRAVELLING_TO_STOP" | "WAITING_FOR_BAY" | "POSITIONED_AT_STOP" | "DEPARTING";

export interface BusStatus {
  busId: string;
  busService: string;
  stopCode?: string;
  bayId?: string;
  movement: BusMovementState;
  /** true when this bus's movement/sensors are simulated (e.g. Bus 2). */
  simulated: boolean;
  observedAt: string;
}

export interface BayStatus {
  stopCode: string;
  bayId: string;
  occupantBusId: string | null;
  waitingBusIds: string[]; // first in, first out
  updatedAt: string;
}

/** The ramp is simulated in this project. There is no physical position verification. */
export type SimulatedRampState =
  "STOWED" | "DEPLOYMENT_REQUESTED" | "DEPLOYING" | "DEPLOYED" | "HALTED";

export type ZoneState = "CLEAR" | "OCCUPIED" | "UNCERTAIN";
export type RampPermission = "CONTINUE" | "HALT";
export type HaltReason =
  | "OBJECT_IN_ZONE"
  | "TOF_BLOCKED"
  | "TOF_UNAVAILABLE"
  | "TOF_NOT_CALIBRATED"
  | "CAMERA_DEGRADED"
  | "SENSORS_DISAGREE"
  | "BUS_NOT_AT_BOARDING_POSITION"
  | "WAITING_FOR_BAY"
  | "NO_ACCEPTED_REQUEST"
  | "OPERATOR_HALT"
  | "DEPLOYMENT_TIMEOUT";

export interface RampSafetyDecision {
  busId: string;
  zoneState: ZoneState;
  permission: RampPermission; // CONTINUE only when zoneState is CLEAR and every check passed
  reasons: HaltReason[];
  tof: {
    state: "BEAM_CLEAR" | "BLOCKED" | "CHECKING" | "UNCALIBRATED" | "UNKNOWN";
    distanceMm?: number;
    simulated: boolean;
  };
  camera: { imageOk: boolean; degradedReason?: string };
  objectsInZone: Array<{
    className: string;
    safety: "SAFE" | "UNSAFE";
    confidence: number;
  }>;
  simulated: boolean; // true if any input on this bus is simulated
  observedAt: string;
}

export interface RampSimulationStatus {
  busId: string;
  caseId?: string;
  state: SimulatedRampState;
  simulated: true; // literal: never claims physical verification
  haltReasons?: HaltReason[];
  observedAt: string;
}

export interface HelpRequired {
  busId: string;
  caseId?: string;
  reason:
    | "DEPLOYMENT_TIMEOUT"
    | "OBSTRUCTION_PERSISTENT"
    | "SENSOR_UNAVAILABLE"
    | "OTHER";
  state: SimulatedRampState;
  detail?: string;
  observedAt: string;
}
```

Wire messages (added to the `StatusUpdateMessage` union, operator-only routing): `BUS_STATUS`, `BAY_STATUS`, `RAMP_SIMULATION`, `RAMP_SAFETY`, `HELP_REQUIRED`, each `{ type, ..., timestamp }` like the existing ones.

Entry to the bay is granted through the bay itself (`BayStatus.grantedBusId`), so `ActuatorCommandType` is not extended.

## Endpoints (backend)

| Endpoint                                                                                                                    | Auth          | Purpose                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/operations/vehicles/:busId/assist-ack`                                                                           | device-signed | Built. Bus acknowledges a request (`{ requestId }`); 404 unknown request, 409 if it targets another bus. Rejection (`FAIL`) is not built yet. **With `GOASSIST_AUTO_ACK=off` this is the only path to "Confirmed by bus".**                                                                           |
| `POST /api/operations/vehicles/:busId/status`                                                                               | device-signed | Built for `BusStatus`. Ramp simulation, safety decision and help-required each have their own endpoint below. A movement the bay rules refuse gets 409 and is not stored.                                                                                                                             |
| `POST /api/operations/vehicles/:busId/ramp-simulation`, `/safety-decision`, `/help-required`                                | device-signed | Built. Latest record per bus. Ramp state must say `simulated: true`; a `CONTINUE` decision needs a `CLEAR` zone and no reasons; a `HALT` needs at least one reason (400 otherwise). A change is audited and pushed to scoped operators; a repeat only refreshes the time; an older report is ignored. |
| `GET /api/operations/vehicles/:busId/<same>`, `GET /api/operations/ramp-simulations`, `/safety-decisions`, `/help-required` | operator      | Built. Latest for one bus, or a list bounded by `limit` (default 100, maximum 500).                                                                                                                                                                                                                   |
| `GET /api/operations/bays/:stopCode`                                                                                        | operator      | Built. Current `BayStatus` (an empty bay for a stop nobody has reported at)                                                                                                                                                                                                                           |
| `POST /api/operations/bays/:stopCode/proceed`                                                                               | operator      | Built. Grants entry to the first waiting bus; 409 if the bay is occupied, a grant is outstanding, or nobody waits                                                                                                                                                                                     |
| `GET /api/operations/audit?limit=&caseId=&busId=`                                                                           | operator      | Read the append-only audit log                                                                                                                                                                                                                                                                        |

Config: `GOASSIST_AUTO_ACK=off` disables the timer acknowledgement and makes `/api/assistance/simulator/command` refuse `ACKNOWLEDGE` (403), so nothing except a bus can confirm. The default stays `on`, so existing tests and demos are unchanged.

## How the Pi's decision reaches the existing gate

The Pi bus agent decides `CONTINUE` or `HALT` locally, then:

1. posts `SafetyTelemetry` with `deploymentPathClear = (permission === "CONTINUE")` and no `rampObstacle`;
2. posts the richer `RampSafetyDecision` for display and audit.

The backend combines them as "block if either blocks", so the backend can be stricter but never looser than the Pi. Simulated interlocks in telemetry (`vehicleStopped`, `parkingBrakeActive`, `doorOpen`) come from the simulated bus state and are labelled simulated.

## Mapping to the app's existing vehicle events (no app change needed)

`TRAVELLING_TO_STOP` and `WAITING_FOR_BAY` -> `APPROACHING`; `POSITIONED_AT_STOP` -> `ARRIVED`; `DEPARTING` -> `DEPARTED`. A waiting bus is not yet "arrived" for the passenger.

## Bay rules (backend, new)

One bay per stop. A bus that arrives while the bay is occupied becomes `WAITING_FOR_BAY` and keeps its accepted requests, but cannot deploy. When the occupant departs the bay is released; a waiting bus enters only after the controller's grant (`POST .../bays/:stopCode/proceed`, recorded as `BayStatus.grantedBusId`) and its own `POSITIONED_AT_STOP` report; a bus that reports positioned without a grant is refused with 409. There is no `PROCEED_TO_BAY` actuator command: the grant lives on the bay and audit records `BAY_ENTRY_GRANTED`. A departing bus never triggers the next bus's deployment.

## Tests I will write with each piece

New pure-logic tests for bay queueing and each endpoint; a test that `assist-ack` from the wrong bus is rejected; a test that with `GOASSIST_AUTO_ACK=off` nothing acknowledges without a bus; a regression run of the existing 94.

## What this proposal deliberately does not do

It does not change the app, `RampPosition`, request statuses, the autonomy/docking service, the servo firmware, or any hardware. It does not add camera streaming (separate proposal).

## Open items that stay open

Timeout value for `DEPLOYMENT_TIMEOUT`; service-to-bus assignment (today the app picks a bus id); whether the backend also keeps its `LIGHT_DEBRIS` thresholds as an extra check; staleness limit for Pi decisions (the backend already treats telemetry older than `GOASSIST_TELEMETRY_FRESHNESS_MS`, default 5 s, as stale).

## Operator halt

`POST /api/operations/vehicles/:busId/operator-halt` `{ halted, reason? }` (operator token) sets or releases a halt on one bus; `GET` on the same path (device-signed) returns `{ busId, halted, reason?, setAt }` (not halted if never set); `GET /api/operations/operator-halts` (operator) lists them. A change is stored one row per bus, audited as `OPERATOR_HALT_SET` (actor `OPERATOR`) and pushed as `OPERATOR_HALT` to that bus and to scoped operators, never to passengers. The bus adds `OPERATOR_HALT` to its gate reasons; it never removes a safety reason, and a failed read never releases a halt.

## Bus subscription

### Device request signing (version 2, 1 Oct 2026)

A device request carries `x-device-id`, `x-timestamp` (milliseconds since the epoch) and `x-signature`. The signature is the hex HMAC-SHA256, keyed with the device's secret, of `<deviceId>.<timestamp>.<METHOD>.<path and query>.` followed by the exact body bytes (a request with no body signs `{}`). `<path and query>` is the request target as sent, for example `/api/operations/actuators/pending?busId=AV-1`. The timestamp must be within 60 seconds and a number; a signature already used is refused ("already used", 401); a device may only act on `/vehicles/:busId` for its own bus id (403 otherwise). The secret is `DEVICE_SECRETS[deviceId]` when that map has the device, otherwise `DEVICE_SHARED_SECRET`. This replaced the first version, which signed only the timestamp and body, so a captured signature could be replayed on other paths. The replay cache is per process. The Pi agent signs this way (`pi/bus-agent/bus_agent/signing.py`).

A bus subscribes to its own events with `SUBSCRIBE_DEVICE` `{ busId, deviceId, timestamp, signature }`, where `deviceId` equals `busId` and `signature` is the device HMAC (the same rule as signed requests, 60-second window) over the fixed body `SUBSCRIBE_DEVICE`, that is HMAC-SHA256 of `<deviceId>.<timestamp>.` followed by `SUBSCRIBE_DEVICE`. It is answered with `SUBSCRIBED_DEVICE`, or `AUTH_REQUIRED` for a bad signature, stale time or mismatched id. It receives only its own bus's `ASSIST_REQUESTED` and `BAY_STATUS`, and needs no operator token. With no `DEVICE_SHARED_SECRET` set (development) the signature is not required.

## Delivering a request to the bus

When a passenger request is created (not when it is a duplicate), the backend publishes `ASSIST_REQUESTED` (`AssistRequestedMessage`, operator-only union) carrying an `AssistRequestForBus`: request, case, bus, service, stop, assistance types and phase, with no session id. A bus agent receives it by subscribing with `SUBSCRIBE_OPERATIONS` scoped to its own bus id; other buses and passenger sockets never see it. After a reconnect or restart the bus reads `GET .../vehicles/:busId/requests` and then acknowledges each request with `assist-ack`. The pull filters the in-memory request list (the teammate's `aviator` store), which is small at prototype scale and is a known limit for the report.
