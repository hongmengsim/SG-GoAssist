# SG GoAssist project guide

Reviewed 6 October 2026 against `main` at `822908d`. Team: SmaRHt Buses, National University of Singapore. Competition: Singapore BusTech Grand Challenge 2026, IHL Student Category.

## Scope and source of truth

SG GoAssist demonstrates boarding assistance for autonomous buses using a passenger app, an automated central controller and two bus agents. The agreed project scope is in the [owner-confirmed handoff](handoff/2026-09-29-project-context.md). That document takes precedence over older prototype plans. Later implementation and hardware observations appear in the [status log](status.md), [hardware handoff](runbooks/hardware-bring-up-handoff.md) and source code.

**The ramp is simulated on screen. Physical ramp construction, actuation and position verification are outside the submission scope.** Boarding assistance is the agreed app workflow. Destination and alighting features still exist in the app and are a documented scope mismatch, not a new project commitment.

Some README headers and early status summaries say that nothing has run on hardware. The later hardware bring-up entries document specific Pi #1 trials. Read the dated entries and their stated limits rather than treating the early summary as a current blanket conclusion. No new hardware or application tests were performed to write this guide.

## Purpose and intended benefits

The project connects explicit passenger intent to a particular bus, returns bus-originated confirmation, checks local obstacles and coordinates a shared boarding bay. The intended benefits are less uncertainty for passengers and clearer handling of operational exceptions. Recognition accuracy, passenger satisfaction and field reliability are future evaluation topics, not measured outcomes established by this prototype.

The passenger chooses a bus service, boarding stop and assistance need. Request submission means the backend received it. Confirmation means the assigned bus accepted it. Neither state means that a ramp has finished deploying. Camera detections assess the environment and do not establish passenger consent or diagnose a disability.

## Current repository map

| Path | Role |
| --- | --- |
| [contracts](../contracts/README.md) | Shared TypeScript contracts, generated JSON schemas and cross-language fixtures |
| [backend](../backend/README.md) | REST/WebSocket APIs, request and case orchestration, bay coordination, storage and audit |
| [passenger-app](../passenger-app/README.md) | Expo/React Native app, stop discovery, requests, status, accessibility and assistant |
| [operator-console](../operator-console/README.md) | Browser dashboard, case handling, bay controls, halt/release and audit views |
| [pi/tof-link](../pi/tof-link/README.md) | ESP32 serial readings and clear/blocked/unknown beam state |
| [pi/perception](../pi/perception/README.md) | Camera health, detections, zone overlap and obstacle policy |
| [pi/safety-gate](../pi/safety-gate/README.md) | Local continue/halt decision and reasons |
| [pi/bus-agent](../pi/bus-agent/README.md) | Bus identity, accepted requests, sensing, simulated ramp and backend communication |
| [firmware](../firmware/README.md) | ESP32 firmware in use |
| [archive](../archive/README.md) | Earlier CAD, hardware designs, reports and presentation material |
| [docs](README.md) | Decisions, architecture, status, interface definitions and runbooks |
| `scripts/` | Development launchers, verification, integration scenarios and load checks |
| `deploy/` | Deployment support files |

Older local checkouts use `packages/shared`, `packages/backend`, `packages/app`, `hardware` and `cad`. Current `main` uses the paths above. Local generated reports, CAD v6 files, the older project tracker and nested review copies are not automatically present on GitHub. Check the current tree before linking to those files.

## Responsibilities and request flow

1. The passenger app sends the boarding request to the backend.
2. The backend performs central coordination and delivers it to the assigned bus.
3. The bus acknowledges the request. With `GOASSIST_AUTO_ACK=off`, the backend timer cannot stand in for bus confirmation.
4. The controller coordinates bay access and issues the simulated deployment command when its conditions permit.
5. The bus agent combines the local camera and ToF state, checks the accepted request and positioning, and permits or halts simulated progress.
6. The controller dashboard shows movement, request, simulated ramp and sensor/fault states independently. Exceptions return to the passenger as appropriate.

Pi #1 represents Bus 1 with the real camera and ESP32/ToF path. Pi #2 represents Bus 2 with explicitly simulated sensing. The demonstration assumes one usable boarding bay. Bus 2 can hold an accepted request while waiting. Bus 1 departing releases the bay but does not deploy Bus 2's ramp: a grant, positioning and local checks are still required.

The central controller handles routine decisions automatically. A human operator inspects exceptions and may request a halt, release, cancellation or other case action. Releasing an operator halt cannot override an obstacle or unavailable required sensor information. Cancellation must not imply immediate physical retraction.

## Interfaces and storage

Passenger routes include `/api/assistance/request`, `/api/bus-stops/*`, `/api/passenger/context` and `/api/journeys/plan`. Operator routes cover `/api/operations/cases`, `/bays`, `/bus-status`, `/ramp-simulations`, `/safety-decisions`, `/help-required` and `/audit` under the operations prefix. Read [message additions](interfaces/message-additions.md) and the module READMEs for exact methods and payloads.

Operator-only WebSocket events carry bus, bay, ramp simulation, safety and help-required updates. The bus receives its addressed requests and acknowledges through its signed device endpoint. Shared contracts and schemas are the interface authority.

Current storage uses asynchronous repository interfaces and keyed tables. SQLite supports the local persistent setup; Postgres, Redis and shared locks support the documented multi-process path. Without SQLite or configured persistent storage, the memory fallback does not survive restart. The older whole-state JSON-store description is historical. See [scalability](architecture/scalability.md) and [decision 0005](decisions/0005-scale-ready-storage-and-processes.md) for measured software checks and deployment limits.

## Local development and demo entry points

From a checkout of current `main`, install dependencies in PowerShell with `npm.cmd install`, then run `npm.cmd run dev`. Canonical local ports:

| Surface | URL / command |
| --- | --- |
| Passenger app | `http://localhost:8081` |
| Backend | `http://localhost:3000` |
| Controller dashboard | `npm.cmd run console`, then `http://localhost:5173/` for mock mode |
| Dashboard with backend | `http://localhost:5173/?mode=live&backend=http://localhost:3000` |
| Pi status | Port 8770 when enabled, using the startup code and printed URL |
| Pi camera bench view | Port 8780 when enabled, using the protected startup URL |

The old backend `/operator` page has been removed. The dashboard's mock playground needs no backend. Mock mode demonstrates interaction with simulated data; live mode connects to the backend and bus agents.

For the software scenario, follow [run everything on one laptop](runbooks/run-everything-on-one-laptop.md). `npm.cmd run e2e:scenario` starts a backend and two simulated buses and exercises request, bay, obstacle, halt and recovery behavior. For hardware, use the newer [hardware handoff](runbooks/hardware-bring-up-handoff.md) and [bring-up runbook](runbooks/hardware-bring-up.md).

Useful checks are `npm.cmd run dev:health`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run verify`, `npm.cmd run verify:fast` and `npm.cmd run check:modules`. Consult the root `package.json` for the complete list. Existing test counts are dated evidence, not a guarantee for every checkout or device.

## Configuration, data and privacy

`.env.example` documents runtime settings. Keep device and operator secrets in environment variables. `DEVICE_SHARED_SECRET` is shared by the backend and agents; `OPERATOR_API_TOKEN` protects operator access. The backend address and clocks must agree with the signed-device setup. Never publish startup codes, tokens or real `.env` contents.

The backend includes a static Singapore stop/route snapshot and optional LTA DataMall synchronization. Keep the LTA key server-side. Fixture arrivals and other prototype context must be labelled. The root README records snapshot provenance and licensing.

The optional assistant uses deterministic commands, grounded retrieval and optional on-device inference. Application validation and confirmed actions retain authority. It does not directly control vehicle equipment. See [assistant design](architecture/hybrid-on-device-assistant.md).

The revised scope permits an on-demand live camera view with no recording. Current code provides a protected bench view directly from the bus agent, with words and line styles for detections and the ramp zone. The production-style outbound relay through the backend remains a future design. The console's schematic is not a camera image. Do not describe the bench view as a completed remote fleet video service or store camera frames in presentation evidence.

## Prototype evidence and limitations

Dated bring-up records describe Pi #1 serial readings, beam states, camera capture and image-health checks, stub perception tests and a real-agent connection to the backend using a stock model as a stand-in. They include a blocked simulated deployment and a timeout/help-required event. These records do not establish trained-model accuracy, whole-area protection or physical ramp safety.

The hardware handoff leaves Pi #2 and the complete two-bus hardware scenario pending. It also records follow-up checks for unplugged sensors, operator halt and link loss. Later commits improve startup recovery and accepted-request restoration, but those fixes are not new physical validation results.

A single ToF beam only covers its viewing direction. Missing, stale or invalid safety information must not count as clear. Vehicle-stopped, brake and door inputs in the bus agent are simulated. Deployment and link-loss timeouts require explicit configuration; the example config uses 30 s and 10 s respectively. These are demonstration settings, not validated real-vehicle safety thresholds.

## Open work and presentation claims

Use [status](status.md), [roadmap](roadmap.md) and [review findings](reviews/2026-10-01-reviews.md) to plan remaining work. Principal topics are the full two-bus bench rehearsal, fault/recovery checks, model evaluation, app boarding-scope alignment, final sensor selection, future hosting and camera relay, and confirmation of the submission deadline.

Reports and presentations should distinguish implemented software, dated bench observations, live demo observations and future benefits. Do not revive physical ramp construction or participant-study commitments from archived documents. The current scope is a coordinated boarding-assistance prototype with simulated ramp movement.
