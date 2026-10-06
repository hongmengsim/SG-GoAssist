# SG GoAssist project guide

**Repository:** `hongmengsim/BUSPASS`
**Project:** SG GoAssist (also described in older files as BusTech Passenger Assistance / SmaRHt Buses)
**Last reviewed:** 6 October 2026

This guide is the entry point to the project. It summarizes the repository's purpose, architecture, important subsystems, setup, evidence, limitations, and where to find the detailed specifications. Status statements describe the checked-in project documentation; they are not a fresh execution or physical validation report.

## Project at a glance

SG GoAssist is a research and competition demonstrator for accessible bus journeys. It combines a passenger-facing app, journey and stop information, a backend assistance workflow, an operator console, and optional physical stop and miniature-bus hardware. The design aims to let passengers request assistance explicitly, preserve their choices, communicate progress accessibly, and move a model ramp only after safety checks and local verification.

The current boundary is a software system and low-voltage tabletop demonstrator. It is not a production transit service, certified vehicle controller, or approval for controlling a passenger-carrying bus. Fixture arrivals and demonstration data must be identified as prototype data.

## Goals and user-facing capabilities

- Plan and follow a bus journey with nearby-stop discovery, direct or one-transfer route options, maps, and step-by-step visual guidance.
- Support accessible interactions, including large and responsive controls, spoken guidance, haptics where available, localization, and persistent journey context.
- Accept voluntary assistance intent from the app and prototype physical/operator input sources; provide status updates and recovery after connection problems.
- Give operators a live case queue, assignment and escalation tools, safety state, device health, and an auditable record of outcomes.
- Demonstrate a safe assistance lifecycle on a mock bus, with telemetry freshness, interlocks, idempotent commands, and deployed/stowed limit-switch verification.
- Offer a deterministic travel assistant with optional on-device language-model interpretation while keeping actions under the existing application rules and confirmation flow.

## System architecture

```text
Passenger app / tactile stop / NFC / operator / anonymous edge observations
                              │
                       shared contracts
                              │
                 Express REST + WebSocket API
            ┌─────────────────┴─────────────────┐
      Journey and stop services         Assistance-case state machine
                                                  │
                                  capability + fresh safety telemetry
                                                  │
                                      idempotent actuator command
                                                  │
                            ESP32 local interlocks + limit switches
```

The shared package defines contracts used by the frontend and backend. The backend owns assistance state, decision rules, persistence, audit events, and command orchestration. The mock-bus controller independently repeats critical movement checks; backend approval alone is not enough to energize the model servo. WebSocket events feed live passenger and operator views.

### Workspace packages

| Path | Responsibility | Main technologies |
| --- | --- | --- |
| `packages/shared` | Shared request, case, vehicle, telemetry, event and API types | TypeScript |
| `packages/backend` | REST/WebSocket server, passenger context, routes, assistance cases, devices, metrics and simulator | Node.js, Express, TypeScript, `ws` |
| `packages/app` | Cross-platform passenger app, journey UI, maps, assistant and accessibility controls | Expo, React Native, TypeScript |
| `hardware` | ESP32 firmware, edge observers and tabletop demonstrations | Arduino/ESP32, Python, Raspberry Pi |
| `cad` | Parametric bus models, assembly and printable prototype packages | Fusion 360 scripts, STEP/F3D/STL/3MF |
| `docs` | Architecture, requirements, feature status, design and validation guides | Markdown and diagrams |

## Important workflows

### Passenger journey

The app obtains stop and journey context from the backend. Location is requested when the passenger chooses it, and nearby stops are presented for confirmation. The journey UI preserves active journey information and presents progress, boarding/alighting guidance, and completion. See [feature readiness](feature-readiness-matrix.md), [passenger presentation validation](passenger-presentation-validation.md), and the relevant app code under `packages/app/src/passengerJourney` and `packages/app/src/`.

### Assistance and mock ramp

An explicit request is retained as passenger intent. Sensor classifications may signal a possible need, but cannot confirm ramp intent; a passenger or operator must confirm it. Before ramp deployment, the case must match the bus and stop, confirm vehicle capability, and receive fresh safe telemetry: stationary vehicle, brake active, door open, clear ramp path, available capacity, online healthy controller, and no fault. While moving, local firmware repeats interlocks. `READY` requires actuator completion plus deployed-switch evidence. Completion or cancellation is terminal only after stowed-switch verification.

Useful entry points: `docs/grand-challenge-integrated-prototype.md`, `docs/task-requirements-traceability.md`, `hardware/INTEGRATED_PROTOTYPE.md`, `packages/backend/src/services/assistanceCaseService.ts`, and `packages/backend/src/services/operationsStore.ts`.

### Journey assistant

The assistant uses deterministic commands and grounded local travel-guide retrieval, with optional on-device Qwen inference on supported Android devices. AI can interpret or explain a request; it does not directly call APIs, control a door, move a ramp, or operate a vehicle. Validation and the existing journey action controller retain authority. Model or speech failure should preserve the deterministic assistant and active journey. See `docs/hybrid-on-device-assistant.md`.

### Bus-stop data

The backend includes a normalized Singapore stop snapshot and route patterns. Relevant routes include `/api/bus-stops/nearby`, `/api/bus-stops/bounds`, `/api/bus-stops/search`, `/api/bus-stops/:code`, `/api/bus-stops/:code/services/:serviceNo/routes`, `/api/passenger/context`, and `/api/journeys/plan`. Live LTA DataMall synchronization requires a server-side credential; never put that key in an `EXPO_PUBLIC_` variable. Data provenance and terms are described in the root README and backend data documentation.

## Repository map

- `README.md` — first-run commands, local URLs, demo entry points, stop-data notes and high-level feature descriptions.
- `BusTech-project-tracker.md` — project status baseline, workstreams, acceptance targets, risks, open decisions and submission checklist. Owners/deadlines are marked TBD where unknown.
- `docs/architecture-mvp.md` — original MVP communication model and architecture background; read alongside the newer integrated prototype documentation.
- `docs/feature-readiness-matrix.md` — implemented, automated, physical-device and future-integration boundaries.
- `docs/task-requirements-traceability.md` — requirement IDs, implementation mapping and target evidence.
- `docs/grand-challenge-integrated-prototype.md` and `hardware/INTEGRATED_PROTOTYPE.md` — integrated system boundary, safety workflow, wiring and tabletop demonstration.
- `docs/hybrid-on-device-assistant.md` — model setup, privacy, fallback, speech and diagnostics.
- `docs/passenger-presentation-validation.md`, `docs/passenger-icon-refresh.md` — passenger interface and validation records.
- `packages/backend/src/routes` and `packages/backend/src/services` — backend HTTP routes and domain services; tests are in `packages/backend/src/tests`.
- `packages/app/src` and `packages/app/__tests__` — passenger application source and Jest tests.
- `packages/shared/src` — shared TypeScript contracts.
- `hardware/esp32-accessible-stop`, `hardware/esp32-mock-bus`, `hardware/edge-observer`, and `hardware/apas-tabletop-demo` — physical and edge-computing prototypes. Each module README is authoritative for its own wiring and limits.
- `cad/` — Robobus model generations and printable packages. Prefer the version-specific README, assembly guide and validation report; files from different generations are not necessarily interchangeable.
- `output/` — reports, diagrams, posters and submission/export artifacts. These are generated or presentation deliverables, not application source.
- `artifacts/` — state diagrams/matrices, rendered evidence and verification outputs.
- `scripts/` — local development orchestration, smoke checks, demo runners and data preparation.
- `SG-GoAssist-main/` and `SG-GoAssist-review/` — additional nested project snapshots/review material. Check their own history and manifests before treating them as current source; the root workspace is the documented canonical project.

## Local setup

Requirements: a supported Node.js runtime and npm. Install dependencies at the repository root:

```powershell
npm.cmd install
```

Copy `.env.example` to an ignored `.env` only if you need local overrides. Start the combined app and backend:

```powershell
npm.cmd run dev
```

The documented local URLs are `http://localhost:8081` for the Expo web app and `http://localhost:3000` for the backend. The operator console is at `http://localhost:3000/operator`. The integrated demo can be run with `npm.cmd run demo:integrated` while the backend is active.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev:app` / `dev:backend` | Start one service |
| `npm.cmd run dev:health` | Check local service health |
| `npm.cmd run typecheck` | Typecheck shared, backend and app workspaces |
| `npm.cmd test` | Run workspace test suites |
| `npm.cmd run build` | Build workspaces where configured |
| `npm.cmd run test:e2e` | Managed end-to-end journey checks |
| `npm.cmd run demo:integrated` | Exercise the integrated software demonstrator |

Runtime smoke checks and device-specific commands are listed in the root `package.json`. Tests and typechecks are separate from starting the local servers.

## Configuration and data handling

`.env.example` documents available settings. Common configuration includes the frontend API base URL, optional map/routing provider settings, server-only LTA DataMall key, operations data directory/storage driver, device HMAC secret, operator API token, and safety telemetry freshness limit. `.env`, runtime state, model cache, and build outputs are ignored by Git. Do not commit real credentials, private datasets, camera frames, or personally identifying trial data.

The integrated prototype documents SQLite-backed state and append-only audit events on supported Node runtimes, with a JSON compatibility fallback. Device requests can use a shared HMAC secret; operator routes and live subscriptions can use an operator token. Deployment needs appropriately secured transport and device-specific secrets. Confirm actual runtime settings before any demonstration.

The edge observer is designed to process frames in memory and publish anonymous classifications only. It must not store or upload frames, faces, or identity data. Sensor output does not grant consent or authorize movement.

## Hardware and safety boundary

Physical subprojects include accessible stop controls, NFC, a mock bus, low-voltage ramp actuator, limit switches, obstruction sensing, ToF/laser sensing, an optional camera observer, and separate tabletop sensor demonstrations. Wiring and pin maps vary by prototype; follow each subproject's own guide rather than copying pin assignments between boards.

The tabletop controller is a research demonstrator only. Keep it disconnected from passenger vehicles. The documented acceptance work still includes physical assembly and interlock trials, sensor-zone calibration, labelled perception evaluation, connected ARM64 assistant validation, and consented representative-user testing. A real vehicle deployment would require certified controls, independent safety engineering, hazard analysis, and relevant authority approval.

## Project status and acceptance evidence

The tracker identifies software implementation areas separately from physical validation. Its documented evidence targets include 30/30 successful requests for each explicit input source, acknowledgement P95 under two seconds on the demo network, at least 90% controlled per-class perception precision and recall, and zero unsafe movements over at least 50 obstruction/interlock trials. These are targets, not measured results unless a dated report is linked.

Before claiming competition readiness, confirm the official brief and deadline, assign owners, assemble the demonstrator, collect repeatable physical and user-trial evidence, rehearse fault and recovery scenarios, and review the submission package. Keep software tests, simulated demonstrations, physical evidence, and future production integration clearly distinguished.

## Known repository caveats

- The repository contains multiple evolving CAD generations, generated reports, nested snapshots, and submission artifacts. Check dates, manifests and validation documents before selecting an asset.
- Some requirements and readiness statements are aspirational or pending evidence. This guide does not certify them as passed.
- Live transit information and production advisories require the appropriate data agreements and provider configuration; prototype fixtures must remain labelled.
- The exact competition deadline, named owners, and judging/submission criteria are not established in the project tracker and must be confirmed with the team.

## Detailed references

- [Root README](../README.md)
- [Project tracker](../BusTech-project-tracker.md)
- [Feature readiness matrix](feature-readiness-matrix.md)
- [Requirements traceability](task-requirements-traceability.md)
- [Integrated prototype architecture](grand-challenge-integrated-prototype.md)
- [Integrated hardware guide](../hardware/INTEGRATED_PROTOTYPE.md)
- [Hybrid on-device assistant](hybrid-on-device-assistant.md)
- [CAD v6 validation](../cad/print_v6/VALIDATION_REPORT.md)
