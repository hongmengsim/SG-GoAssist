# backend (`@buspass/backend`)

## Purpose

The REST and WebSocket server. It receives passenger assistance requests, runs each one as a case through validation and a safety gate, exposes stop and journey data, records what the buses report (bus status, bay queue, simulated ramp state, the Pi's safety decision, help requests, operator halts), relays it to operators and passengers, and keeps an append-only audit log. It also contains `aviator`, a simulated bus that can acknowledge requests automatically (`GOASSIST_AUTO_ACK`, off in the integrated scenarios: a real bus must confirm, never the backend).

The backend records and relays; the **Pi decides** whether a ramp continues (`pi/safety-gate`), and the backend may only add stricter checks. The ramp is simulated only.

For the prototype one process plays both the "cloud" and the "controller" roles from the 29 Sep handoff; the app-facing routes (`/api/assistance`, `/api/location`, `/api/bus-stops`, `/api/journeys`, `/api/passenger`) and controller-facing routes (`/api/operations`) are separate, and `GOASSIST_ROLES` can mount one set only. See `docs/decisions/0002-architecture-ruling.md`.

## Interface

- HTTP routes under `/api/...` and a WebSocket on the same port, as typed in `contracts/` (message additions: `docs/interfaces/message-additions.md`).
- Devices (buses) sign every request with an HMAC and post status, ramp state, safety decisions, help and telemetry; they read accepted requests, commands and any operator halt. A bus subscribes to its own pushes with a signed `SUBSCRIBE_DEVICE` (the Pi holds no operator token). Clients subscribe with `SUBSCRIBE`, `SUBSCRIBE_CASE`, `SUBSCRIBE_STOP` or `SUBSCRIBE_OPERATIONS` (optionally scoped to `buses` or `stops`).
- Health at `/health`, readiness at `/ready` (storage checks), metrics at `/admin/metrics` (operator token). The operator screen is the separate `operator-console/` module.
- Rate limiting sheds browsing first and never sheds bus traffic (`GOASSIST_RATE_LIMIT`); bus-stop reference data is cacheable (ETag, 304).

### Configuration (environment)

Secrets come from the environment only; nothing below is committed. See `.env.example`.

| Variable                                                                                                                                                          | Meaning                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT` (3000)                                                                                                                                                     | HTTP and WebSocket port                                                                                                                                                                                                                                                                                                                                            |
| `DEVICE_SHARED_SECRET`, `DEVICE_SECRETS`, `OPERATOR_API_TOKEN`, `GOASSIST_ALLOW_INSECURE`                                                                         | HMAC secret for device requests (`DEVICE_SECRETS` is a JSON map of device id to its own secret and wins over the shared one); bearer token for operator endpoints. Unset means development mode (open) on a laptop only: in production, or with a shared database, Redis or locks, the server refuses to start without both unless `GOASSIST_ALLOW_INSECURE=true`. |
| `ALLOWED_ORIGINS`                                                                                                                                                 | CORS origins                                                                                                                                                                                                                                                                                                                                                       |
| `GOASSIST_DATA_DIR` (`.runtime/`)                                                                                                                                 | Where SQLite files, `audit.ndjson` and `cases-archive.ndjson` live                                                                                                                                                                                                                                                                                                 |
| `GOASSIST_DATABASE_URL`                                                                                                                                           | Use Postgres (needs the `pg` package, see below). Contains a password: never log or commit it.                                                                                                                                                                                                                                                                     |
| `GOASSIST_STORAGE_DRIVER`                                                                                                                                         | `sqlite` or `memory` forces that storage even when a database URL is set                                                                                                                                                                                                                                                                                           |
| `GOASSIST_EVENT_BUS` (`memory`), `GOASSIST_REDIS_URL`                                                                                                             | `redis` shares pushes between backend processes (needs the `ioredis` package)                                                                                                                                                                                                                                                                                      |
| `GOASSIST_LOCKS` (`memory`), `GOASSIST_LOCK_TTL_MS`, `GOASSIST_LOCK_TIMEOUT_MS`                                                                                   | `database` shares locks between processes through the database                                                                                                                                                                                                                                                                                                     |
| `GOASSIST_RETENTION_CASE_DAYS` (7), `GOASSIST_RETENTION_MAX_FINISHED_CASES` (2000), `GOASSIST_RETENTION_MAX_SERIES_RECORDS` (5000)                                | How much finished-case and series data is kept. Placeholders, not agreed values.                                                                                                                                                                                                                                                                                   |
| `GOASSIST_ROLES`                                                                                                                                                  | `passenger` and/or `operations`: which route sets this process serves                                                                                                                                                                                                                                                                                              |
| `GOASSIST_RATE_LIMIT`, `GOASSIST_AUTO_ACK`, `GOASSIST_TELEMETRY_FRESHNESS_MS` (5000), `GOASSIST_SENSOR_MAX_AGE_MS`, `GOASSIST_DOCK_*`, `LTA_DATAMALL_ACCOUNT_KEY` | Rate limiting on or off; simulated acknowledgement; freshness limits; docking tolerances; the server-only LTA key                                                                                                                                                                                                                                                  |

## How it stores data

- **Cases and the case-service records** (observations, telemetry, actuator commands and statuses, devices, vehicles, ramp classifications, perception samples, docking, requests, vehicle statuses, announcements, assistant diagnostics) are one row each behind ports (`src/cases`, `src/storage`, `src/services/operationsData.ts`). The old "everything in one document" store is retired.
- **Bus operations** (bus status, bay, ramp state, decision, help, operator halt) use their own repositories (`src/busOperations`).
- Adapters: memory, SQLite (`node:sqlite`, in `GOASSIST_DATA_DIR`) and Postgres. Without SQLite or a database URL the data is in memory only and does not survive a restart (a warning is logged). Old data from the previous store is imported once at start-up.
- Concurrency: a shared re-entrant lock (`src/concurrency`) protects read-modify-write; repeat and stale bus reports use one compare-and-swap and no lock.
- Events reach clients through an event bus (`src/events`): in-process by default, Redis for several processes. Delivery through a broker is asynchronous and at most once.
- Old finished cases are archived to `cases-archive.ndjson` and removed on a schedule.

Design and measurements: `docs/architecture/scalability.md` and `docs/decisions/0005-scale-ready-storage-and-processes.md`. Running more than one process: `docs/runbooks/multi-process.md`.

## Run it alone

Needs only `contracts/`. No app, hardware or Pi:

```powershell
npm.cmd install --workspace @buspass/shared --workspace @buspass/backend
npm.cmd run dev:backend            # from the repo root; http://localhost:3000
npm.cmd run demo:integrated --workspace @buspass/backend   # a scripted fake bus exercising the whole loop
```

`npm run simulator --workspace @buspass/backend` opens an interactive simulated-bus console (`list`, `ack <requestId>`, `cancel`, `fail`, `vehicle <busId> <status>`, `announcements`) that talks to a running backend.

To use Postgres and Redis, install their clients without saving them (`npm install --no-save --workspace @buspass/backend pg ioredis`) and set `GOASSIST_DATABASE_URL`, `GOASSIST_EVENT_BUS=redis`, `GOASSIST_REDIS_URL` and `GOASSIST_LOCKS=database`. `pg` and `ioredis` are not dependencies of this package.

## Test

```powershell
npm.cmd test --workspace @buspass/backend
```

Verified 1 Oct 2026: 430 tests pass with nothing else running, and 473 pass (none skipped) when `GOASSIST_TEST_DATABASE_URL` points at a Postgres server (each Postgres test uses a throwaway schema). Tests ignore `GOASSIST_DATABASE_URL`. Real multi-process checks (need Postgres and Redis): `npm run check:multi-process` and `npm run e2e:scenario:two` from the repo root; load: `npm run load:test`.

## Depends on

`contracts` only. It must not import the passenger app or any Pi or hardware code.
