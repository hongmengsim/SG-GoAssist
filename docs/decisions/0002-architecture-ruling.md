# 0002. Architecture ruling (30 Sep 2026)

Recorded from the project owner's (CE2) instructions during integration of the ML/CV and Pi-side work with this repository. **Status column matters: "decided" is a ruling; "direction" is agreed in principle but not built; "open" is unresolved and must not be treated as settled.**

| # | Topic | Ruling | Status |
|---|---|---|---|
| 1 | Who decides whether the ramp may deploy | **The Raspberry Pi**, locally, from the camera result and the ToF beam state. The backend records and relays the decision and may add stricter checks, never looser ones ("block if either blocks"). Missing, stale or invalid sensor data is never treated as clear. | decided |
| 2 | Ramp | **Simulated only.** A status view (on the Pi and in the operator console) shows stowed, deployment requested, deploying, deployed, halted. No claim of physical verification. | decided |
| 3 | Laser / ToF and passenger app | **This repo's existing implementation is followed unchanged**: the ESP32 serial protocol, `BeamState`, telemetry, request flow and app code. | decided |
| 4 | Controller / operator UI | **The CE2 prototype is used** (overview, bus stop, bus, filterable audit log, playground), ported into an `operator-console` module. The existing `/operator` page stays reachable until its case actions are ported. | decided; port not built |
| 5 | Naming | **This repo's conventions everywhere** (UPPER_SNAKE values, camelCase fields, this repo's ids and class labels). New statuses are added only where the 29 Sep handoff needs something this repo lacks. Mapping table in [`interfaces/message-additions.md`](../interfaces/message-additions.md). | decided |
| 6 | Bus confirmation | Must originate from the bus, not from a timer or the backend | decided; bus-only endpoint not built (the timer acknowledgement is still the default) |
| 7 | Repository layout | Full rename to top-level modules and separated hardware, Pi and archive areas ([`0001`](0001-full-rename-and-modular-layout.md)) | done for renames and moves; module READMEs and checks pending |
| 8 | Camera frames | Never recorded or retained. A live view for the controller is allowed by the handoff. | decided; live-view endpoint not built |
| 9 | Passenger app scope | The app is left as this repo has it. It still contains alighting and destination features (about 350 mentions of alighting across roughly 20 files); the handoff says the assistance workflow is boarding only. **The mismatch is to be disclosed in the report, not silently changed.** | open |
| 10 | Cloud vs controller | The handoff describes a separate cloud and host controller; this repo has one backend doing both. Prototype default: one backend on the host playing both roles, routes kept separate (`/api/assistance` app-facing, `/api/operations` controller-facing). | open (owner wants more clarification) |
| 11 | ToF sensor | Repo evidence: a VL53L0X breakout on an ESP32-S3 over USB serial (the firmware also detects a VL53L1X). One narrow beam, so no whole-area coverage claim is possible; the camera provides area coverage. | open (owner to confirm the sensor in hand) |
| 12 | Timeouts, service-to-bus assignment, bay signalling, deadline | Not chosen. No numeric timeout is invented anywhere. | open |

## Consequences already handled in code

- `StatusUpdateMessage` must not gain members: the app narrows it exhaustively. Operator-only messages use `OperatorStatusUpdateMessage`. (Found when adding the bus/bay/ramp messages broke the app typecheck.)
- The repo's mock bus registry already has two buses on service 95 (`AV-095-01`, `AV-095-02`), used as Bus 1 and Bus 2.
