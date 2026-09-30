# Running more than one backend process

**Status (1 Oct 2026): two backend processes can share events (Redis), data (Postgres) and locks (database leases), and this has been checked with two real processes (`npm run check:multi-process`, and the end-to-end scenario on Postgres with one). Processes on separate machines and more than two have not been tried.** This page says what works today, and how to check the Redis part against a real server.

## What works today

- `GOASSIST_EVENT_BUS=redis` with `GOASSIST_REDIS_URL=redis://host:6379` makes the process publish and receive events through Redis. An event published in one process reaches operator and passenger WebSocket clients connected to another; scoping is unchanged. Without those variables the bus stays in-process, exactly as before.
- Tested: the broker event bus and the Redis adapter against an in-memory broker and a fake Redis server (18 tests), and the WebSocket gateway receiving an event that another process published (2 tests).
- Tested for real: `npm run check:multi-process` starts two backend processes on different ports against a Redis server and checks that a bus status posted to one reaches an operator on the other exactly once. It passed on 1 Oct 2026 (Redis in WSL Ubuntu 22.04).
- Not tested: shared data across processes (each still has its own SQLite files).

## What does not work yet

- **Shared data.** Cases and bus data live in `operations.sqlite` and `bus-operations.sqlite` in each process's data directory. Two processes would each see only their own data. A Postgres adapter is the planned fix.
- **Locks.** `GOASSIST_LOCKS=database` shares locks through the operations database (built and tested with two connections on one file). It only excludes processes that share that file, so it is not enough until the data itself is in a shared database.
- **In-memory state.** Moved into the shared tables (decision 0005, step 4); what stays per process is listed there (WebSocket connections, rate-limit and metrics counters, the simulated bus timer).

## Setting up Postgres and Redis on Windows (WSL)

Inside the Ubuntu shell (not PowerShell): `sudo apt install -y postgresql redis-server`, then `sudo service postgresql start` and `sudo service redis-server start`, then create a user and database (`sudo -u postgres psql -c "CREATE USER goassist WITH PASSWORD '...';"` and `... "CREATE DATABASE goassist OWNER goassist;"`). Both are reachable from Windows at `localhost:5432` and `localhost:6379`. Put the password only in an environment variable.

## Running against them

- Install the two clients without saving them: `npm install --no-save --workspace @buspass/backend pg ioredis`.
- Backend: `GOASSIST_DATABASE_URL=postgres://user:PASSWORD@host:5432/goassist GOASSIST_EVENT_BUS=redis GOASSIST_REDIS_URL=redis://host:6379 GOASSIST_LOCKS=database`. All four together are what a multi-process run needs.
- Tests of the Postgres adapters: set `GOASSIST_TEST_DATABASE_URL` and run `npm test --workspace @buspass/backend` (each test uses a throwaway schema).
- Two real processes: `npm run check:multi-process` (set `GOASSIST_DATABASE_URL` too for the shared-data part).
- The whole scenario across two processes: `npm run e2e:scenario:two` (needs `GOASSIST_DATABASE_URL`; it makes and drops its own schema).
- Load: `npm run load:test -- --processes 2 --rate 600` with the same variables set.

## Checking the Redis adapter against a real server (older instructions)

1. Start Redis (for example `redis-server`, or Docker: `docker run -p 6379:6379 redis:7`).
2. Install the client where the backend can find it: `npm install ioredis --workspace @buspass/backend`, then `git checkout -- package-lock.json` if you do not want the lockfile change.
3. Start two backend processes on different ports with separate data directories:
   `GOASSIST_EVENT_BUS=redis GOASSIST_REDIS_URL=redis://localhost:6379 PORT=3000 GOASSIST_DATA_DIR=.runtime/a npm start --workspace @buspass/backend`
   `... PORT=3010 GOASSIST_DATA_DIR=.runtime/b ...`
4. Connect an operator WebSocket to port 3000 (`SUBSCRIBE_OPERATIONS`), then post a bus status to port 3010. The operator should receive the push. (Each process keeps its own data, so read endpoints will differ; only pushes are shared.)
5. Record the result in `docs/status.md`.
