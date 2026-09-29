# contracts (`@buspass/shared`)

## Purpose

The single source of truth for every message, status and constant that crosses a boundary between the passenger app, the backend, the operator console and the Raspberry Pi code. TypeScript types plus a few exported constant arrays for runtime validation. If two parts of the system disagree about a name, this package is the referee.

## Interface

Everything is exported from `src/index.ts`:

- Request and case model: `AssistanceType`, `AssistanceRequestStatus`, `AssistanceCase`, `AssistanceCaseState`, `SignalObservation`, ...
- Vehicle and safety: `SafetyTelemetry`, `RampObstacleAssessment`, `ActuatorCommand`, `ActuatorStatus`, `VehicleStatus`, ...
- Bus movement, bay, Pi decision and simulated ramp (added 30 Sep 2026): `BusStatus`, `BayStatus`, `RampSafetyDecision`, `RampSimulationStatus`, `HelpRequired`, and the constants `BUS_MOVEMENT_STATES`, `SIMULATED_RAMP_STATES`, `ZONE_STATES`, `RAMP_PERMISSIONS`, `HALT_REASONS`, `TOF_BEAM_STATES`, `HELP_REASONS`.
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
