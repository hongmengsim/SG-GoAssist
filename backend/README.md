# backend (`@buspass/backend`)

## Purpose

The REST and WebSocket server. It receives passenger assistance requests, runs each one as a case through validation and a safety gate, exposes stop and journey data, keeps an append-only audit log, and serves the current operator page. It also contains `aviator`, a simulated bus that acknowledges requests automatically (a stand-in, not a real bus).

For the prototype this one process plays both the "cloud" and the "controller" roles from the 29 Sep handoff; the app-facing routes (`/api/assistance`, `/api/location`, `/api/bus-stops`, `/api/journeys`, `/api/passenger`) and controller-facing routes (`/api/operations`) are kept separate so a split later is a configuration change. See `docs/decisions/0002-architecture-ruling.md`.

## Interface

- HTTP routes under `/api/...` and a WebSocket on the same port, as typed in `contracts/`.
- Devices post telemetry and poll `/api/operations/actuators/pending`; clients subscribe with `SUBSCRIBE`, `SUBSCRIBE_CASE`, `SUBSCRIBE_STOP` or `SUBSCRIBE_OPERATIONS`.
- Operator page at `/operator`; health at `/health`.
- Configuration (environment): `PORT` (default 3000), `GOASSIST_DATA_DIR` (default `.runtime/`, gitignored), `GOASSIST_TELEMETRY_FRESHNESS_MS` (default 5000), `DEVICE_SHARED_SECRET` (HMAC for device requests), `OPERATOR_API_TOKEN` (operator endpoints), `ALLOWED_ORIGINS`. See `.env.example`.
- State is persisted to SQLite when the runtime supports it, otherwise to a JSON file.

## Run it alone

Needs only `contracts/`. No app, hardware or Pi:

```powershell
npm.cmd install --workspace @buspass/shared --workspace @buspass/backend
npm.cmd run dev:backend            # from the repo root; http://localhost:3000
npm.cmd run demo:integrated --workspace @buspass/backend   # a scripted fake bus exercising the whole loop
```

`npm run simulator --workspace @buspass/backend` opens an interactive simulated-bus console (`list`, `ack <requestId>`, `cancel`, `fail`, `vehicle <busId> <status>`, `announcements`) that talks to a running backend.

## Test

```powershell
npm.cmd test --workspace @buspass/backend
```

Verified 30 Sep 2026: 94 tests pass. `npm run typecheck` (root) is also clean.

## Depends on

`contracts` only. It must not import the passenger app or any Pi or hardware code.
