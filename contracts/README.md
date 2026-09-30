# contracts (`@buspass/shared`)

## Purpose

The single source of truth for every message, status and constant that crosses a boundary between the passenger app, the backend, the operator console and the Raspberry Pi code. TypeScript types plus a few exported constant arrays for runtime validation. If two parts of the system disagree about a name, this package is the referee.

## Interface

Everything is exported from `src/index.ts`:

- Request and case model: `AssistanceType`, `AssistanceRequestStatus`, `AssistanceCase`, `AssistanceCaseState`, `SignalObservation`, ...
- Vehicle and safety: `SafetyTelemetry`, `RampObstacleAssessment`, `ActuatorCommand`, `ActuatorStatus`, `VehicleStatus`, ...
- Bus movement, bay, Pi decision and simulated ramp (added 30 Sep 2026): `BusStatus`, `BayStatus`, `RampSafetyDecision`, `RampSimulationStatus`, `HelpRequired`, and the constants `BUS_MOVEMENT_STATES`, `SIMULATED_RAMP_STATES`, `ZONE_STATES`, `RAMP_PERMISSIONS`, `HALT_REASONS`, `TOF_BEAM_STATES`, `HELP_REASONS`.
- Operator halt and the bus request push (added 30 Sep 2026): `OperatorHalt` and `OperatorHaltMessage` (operator-only), `AssistRequestForBus` and `AssistRequestedMessage`; `HALT_REASONS` also holds `OPERATOR_HALT`, `DEPLOYMENT_TIMEOUT` and `BACKEND_LINK_LOST`. Report types for what a bus posts: `BusStatusReport`, `RampSimulationReport`, `RampSafetyReport`, `HelpRequiredReport`, `SafetyTelemetryReport`.
- WebSocket messages: `StatusUpdateMessage` (passenger-facing) and `OperatorStatusUpdateMessage` (operator-only).

**Rule:** do not add members to `StatusUpdateMessage`. The passenger app narrows it exhaustively, so a new member breaks the app's typecheck. Operator-only messages go in `OperatorStatusUpdateMessage`.

Naming convention: UPPER_SNAKE string values, camelCase fields, string-literal unions with exported `as const` arrays.

## Run it alone

```powershell
npm.cmd install --workspace @buspass/shared
npm.cmd run build --workspace @buspass/shared
```

Needs nothing else. No server, hardware or other module.

## Test

This package has no unit tests of its own; its correctness is that it compiles and that its consumers still compile against it:

```powershell
npm.cmd run typecheck --workspace @buspass/shared   # this package
npm.cmd run typecheck                                # this package plus backend and passenger-app
```

## Depends on

Nothing. Changes here need review from both the passenger-app/backend side and the Pi/operator-console side (see `.github/CODEOWNERS`).

## JSON Schema and shared fixtures

The bodies a bus agent posts (`BusStatusReport`, `RampSimulationReport`, `RampSafetyReport`, `HelpRequiredReport`, `SafetyTelemetryReport`) and the operator-facing messages are published as JSON Schema in `schema/`, generated from `src/index.ts` (`npm run schema --workspace @buspass/shared`). Unknown fields are rejected, so a misspelt or renamed field fails instead of being ignored.

`fixtures/valid` and `fixtures/invalid` hold example messages named `<Type>.<label>.json`. Three checks read them:

- `scripts/schemas.test.mjs` (TypeScript): the committed schemas equal what the types generate, valid fixtures pass, invalid fixtures fail.
- `python/test_schemas.py` (`python -m unittest discover -s contracts/python`, needs `jsonschema`): the same fixtures for the Pi agent's side.
- `backend/src/tests/contractFixtures.test.ts`: every valid report fixture is accepted by the backend's own validation.

Rules a schema cannot express (a `CONTINUE` decision needs a `CLEAR` zone and no halt reasons; a `HALT` needs a reason; the ramp is always `simulated: true`) are enforced by the backend and tested there.
