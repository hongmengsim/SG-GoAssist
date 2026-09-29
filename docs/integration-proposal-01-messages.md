# Integration proposal 01: message additions

**Status (30 Sep 2026): approved in direction by the project owner.** Ownership ruling: laser/ToF and passenger-app behaviour follow this repo's existing implementation unchanged; the controller/operator UI follows the CE2 prototype; all naming follows this repo's conventions (UPPER_SNAKE values, camelCase fields, this repo's ids and class labels); new statuses are added only where the 29 Sep handoff needs something this repo lacks.

## Naming rules (prototype -> this repo)

| Prototype (bus-project-2) | This repo |
|---|---|
| `travelling_to_stop`, `waiting_for_bay`, `positioned_at_stop`, `departing` | `TRAVELLING_TO_STOP`, `WAITING_FOR_BAY`, `POSITIONED_AT_STOP`, `DEPARTING` |
| `stowed`, `deployment_requested`, `deploying`, `deployed`, `halted` | `STOWED`, `DEPLOYMENT_REQUESTED`, `DEPLOYING`, `DEPLOYED`, `HALTED` |
| `clear`, `occupied`, `uncertain`; `continue`, `halt` | `CLEAR`, `OCCUPIED`, `UNCERTAIN`; `CONTINUE`, `HALT` |
| `submitted`, `confirmed_by_bus`, `cancelled`, `cannot_fulfil` | `SENDING`, `ACKNOWLEDGED`, `CANCELLED`, `FAILED` (existing) |
| `completed` request | case state `COMPLETED` (existing); no new request status |
| `snake_case` fields (`zone_state`, `capture_ts`) | `camelCase` (`zoneState`, `observedAt`) |
| `bus1`, `bus2`, `STOP-01`, `BAY-A`, services 190/14/77 | registered bus ids (e.g. `AV-095-01`), numeric stop codes (e.g. `18331`), services 95/191 |
| `rollator_walker`, `bag_or_box` | `walker`; `luggage` for suitcases; `bag_or_box` kept as a new label for bags/boxes/bottles |
| free-text reasons (`tof_unavailable`) | `HaltReason` enum |
| UI log kinds (`cmd`, `ok`, `fault`, `op`) | derived from the backend's audit event names (`SIGNAL_ACCEPTED`, `ACTUATOR_COMMAND_ISSUED`, ...) |

Branch: `integration`. Scope: add the few messages the SG GoAssist handoff needs that `contracts` does not have yet. **Additive only.** Existing types, statuses and endpoints keep their meaning, so the current app and all 94 backend tests are unaffected.

## What the handoff needs vs what exists

| Handoff need | Exists today | Gap |
|---|---|---|
| Passenger sees only "Request submitted" / "Confirmed by bus" | `SENDING` / `ACKNOWLEDGED` request statuses | `ACKNOWLEDGED` is set automatically by a timer (`assistanceRequestService.ts:117`), not by a bus |
| Bus movement: travelling / waiting for bay / positioned / departing | `VehicleStatus` (APPROACHING, ARRIVED, DEPARTED); `AutonomousDriveState` (docking-based) | No `waiting for bay`, no bay occupancy |
| Ramp states: stowed, deployment requested, deploying, deployed, halted | `RampPosition` (STOWED, DEPLOYING, DEPLOYED, RETRACTING, FAULT, UNKNOWN); actuator command states | No `halted`; nothing marks the ramp as simulated |
| Pi's continue/halt decision with reasons | `SafetyTelemetry.deploymentPathClear` (boolean) and `rampObstacle` | Reasons and inputs are not carried, so the console cannot say *why* it halted |
| Bus reports "help required" with state and reason | `OPERATOR_ESCALATION` (case level) | No bus-originated help message; no deployment-timeout reason |
| Audit view of all requests and events | Append-only audit table (`.runtime/audit.ndjson`) | Not readable through the API (only `/admin/logs`) |

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
  | "TRAVELLING_TO_STOP" | "WAITING_FOR_BAY" | "POSITIONED_AT_STOP" | "DEPARTING";

export interface BusStatus {
  busId: string; busService: string; stopCode?: string; bayId?: string;
  movement: BusMovementState;
  /** true when this bus's movement/sensors are simulated (e.g. Bus 2). */
  simulated: boolean;
  observedAt: string;
}

export interface BayStatus {
  stopCode: string; bayId: string;
  occupantBusId: string | null;
  waitingBusIds: string[];      // first in, first out
  updatedAt: string;
}

/** The ramp is simulated in this project. There is no physical position verification. */
export type SimulatedRampState =
  | "STOWED" | "DEPLOYMENT_REQUESTED" | "DEPLOYING" | "DEPLOYED" | "HALTED";

export type ZoneState = "CLEAR" | "OCCUPIED" | "UNCERTAIN";
export type RampPermission = "CONTINUE" | "HALT";
export type HaltReason =
  | "OBJECT_IN_ZONE" | "TOF_BLOCKED" | "TOF_UNAVAILABLE" | "TOF_NOT_CALIBRATED"
  | "CAMERA_DEGRADED" | "SENSORS_DISAGREE" | "BUS_NOT_AT_BOARDING_POSITION"
  | "WAITING_FOR_BAY" | "NO_ACCEPTED_REQUEST" | "OPERATOR_HALT" | "DEPLOYMENT_TIMEOUT";

export interface RampSafetyDecision {
  busId: string;
  zoneState: ZoneState;
  permission: RampPermission;      // CONTINUE only when zoneState is CLEAR and every check passed
  reasons: HaltReason[];
  tof: { state: "BEAM_CLEAR" | "BLOCKED" | "CHECKING" | "UNCALIBRATED" | "UNKNOWN";
         distanceMm?: number; simulated: boolean };
  camera: { imageOk: boolean; degradedReason?: string };
  objectsInZone: Array<{ className: string; safety: "SAFE" | "UNSAFE"; confidence: number }>;
  simulated: boolean;              // true if any input on this bus is simulated
  observedAt: string;
}

export interface RampSimulationStatus {
  busId: string; caseId?: string;
  state: SimulatedRampState;
  simulated: true;                 // literal: never claims physical verification
  haltReasons?: HaltReason[];
  observedAt: string;
}

export interface HelpRequired {
  busId: string; caseId?: string;
  reason: "DEPLOYMENT_TIMEOUT" | "OBSTRUCTION_PERSISTENT" | "SENSOR_UNAVAILABLE" | "OTHER";
  state: SimulatedRampState;
  detail?: string;
  observedAt: string;
}
```

Wire messages (added to the `StatusUpdateMessage` union, operator-only routing): `BUS_STATUS`, `BAY_STATUS`, `RAMP_SIMULATION`, `RAMP_SAFETY`, `HELP_REQUIRED`, each `{ type, ..., timestamp }` like the existing ones.

`ActuatorCommandType` gains `PROCEED_TO_BAY` (controller tells a waiting bus it may enter the bay). Before merging I will check that no code has an exhaustive switch on that type.

## Endpoints (backend)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/operations/vehicles/:busId/assist-ack` | device-signed | Bus accepts or rejects a request (`{ requestId, accepted, reason? }`). Verifies the request targets this bus, then applies `ACKNOWLEDGE` or `FAIL`. **This is the only path to "Confirmed by bus".** |
| `POST /api/operations/vehicles/:busId/status` | device-signed | Bus posts `BusStatus`, `RampSimulationStatus`, `RampSafetyDecision`, `HelpRequired` |
| `GET /api/operations/bays/:stopCode` | operator | Current `BayStatus` |
| `POST /api/operations/bays/:stopCode/proceed` | operator | Send the first waiting bus into the bay |
| `GET /api/operations/audit?limit=&caseId=&busId=` | operator | Read the append-only audit log |

Config: `GOASSIST_AUTO_ACK=off` disables the timer acknowledgement. The default stays `on`, so existing tests and demos are unchanged. The unauthenticated `/api/assistance/simulator/command` route still exists; I propose gating it behind the same flag when auto-ack is off, so nothing except a bus can confirm.

## How the Pi's decision reaches the existing gate

The Pi bus agent decides `CONTINUE` or `HALT` locally, then:
1. posts `SafetyTelemetry` with `deploymentPathClear = (permission === "CONTINUE")` and no `rampObstacle`;
2. posts the richer `RampSafetyDecision` for display and audit.

The backend combines them as "block if either blocks", so the backend can be stricter but never looser than the Pi. Simulated interlocks in telemetry (`vehicleStopped`, `parkingBrakeActive`, `doorOpen`) come from the simulated bus state and are labelled simulated.

## Mapping to the app's existing vehicle events (no app change needed)

`TRAVELLING_TO_STOP` and `WAITING_FOR_BAY` -> `APPROACHING`; `POSITIONED_AT_STOP` -> `ARRIVED`; `DEPARTING` -> `DEPARTED`. A waiting bus is not yet "arrived" for the passenger.

## Bay rules (backend, new)

One bay per stop. A bus that arrives while the bay is occupied becomes `WAITING_FOR_BAY` and keeps its accepted requests, but cannot deploy. When the occupant departs the bay is released; a waiting bus enters only after a `PROCEED_TO_BAY` command and its own `POSITIONED_AT_STOP` report. A departing bus never triggers the next bus's deployment.

## Tests I will write with each piece

New pure-logic tests for bay queueing and each endpoint; a test that `assist-ack` from the wrong bus is rejected; a test that with `GOASSIST_AUTO_ACK=off` nothing acknowledges without a bus; a regression run of the existing 94.

## What this proposal deliberately does not do

It does not change the app, `RampPosition`, request statuses, the autonomy/docking service, the servo firmware, or any hardware. It does not add camera streaming (separate proposal).

## Open items that stay open

Timeout value for `DEPLOYMENT_TIMEOUT`; service-to-bus assignment (today the app picks a bus id); whether the backend also keeps its `LIGHT_DEBRIS` thresholds as an extra check; staleness limit for Pi decisions (the backend already treats telemetry older than `GOASSIST_TELEMETRY_FRESHNESS_MS`, default 5 s, as stale).
