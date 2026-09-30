# Running more than one backend process

**Status (1 Oct 2026): the event bus can be shared through Redis and has been checked against a real Redis with two real backend processes (`npm run check:multi-process`). Storage is still one SQLite file per process, so two processes must NOT be run against the same data yet (decision 0005, steps 3 and 4).** This page says what works today, and how to check the Redis part against a real server.

## What works today

- `GOASSIST_EVENT_BUS=redis` with `GOASSIST_REDIS_URL=redis://host:6379` makes the process publish and receive events through Redis. An event published in one process reaches operator and passenger WebSocket clients connected to another; scoping is unchanged. Without those variables the bus stays in-process, exactly as before.
- Tested: the broker event bus and the Redis adapter against an in-memory broker and a fake Redis server (18 tests), and the WebSocket gateway receiving an event that another process published (2 tests).
- Tested for real: `npm run check:multi-process` starts two backend processes on different ports against a Redis server and checks that a bus status posted to one reaches an operator on the other exactly once. It passed on 1 Oct 2026 (Redis in WSL Ubuntu 22.04).
- Not tested: shared data across processes (each still has its own SQLite files).

## What does not work yet

- **Shared data.** Cases and bus data live in `operations.sqlite` and `bus-operations.sqlite` in each process's data directory. Two processes would each see only their own data. A Postgres adapter is the planned fix.
- **Locks.** `GOASSIST_LOCKS=database` shares locks through the operations database (built and tested with two connections on one file). It only excludes processes that share that file, so it is not enough until the data itself is in a shared database.
- **In-memory state.** Moved into the shared tables (decision 0005, step 4); what stays per process is listed there (WebSocket connections, rate-limit and metrics counters, the simulated bus timer).

## Checking the Redis adapter against a real server

1. Start Redis (for example `redis-server`, or Docker: `docker run -p 6379:6379 redis:7`).
2. Install the client where the backend can find it: `npm install ioredis --workspace @buspass/backend`, then `git checkout -- package-lock.json` if you do not want the lockfile change.
3. Start two backend processes on different ports with separate data directories:
   `GOASSIST_EVENT_BUS=redis GOASSIST_REDIS_URL=redis://localhost:6379 PORT=3000 GOASSIST_DATA_DIR=.runtime/a npm start --workspace @buspass/backend`
   `... PORT=3010 GOASSIST_DATA_DIR=.runtime/b ...`
4. Connect an operator WebSocket to port 3000 (`SUBSCRIBE_OPERATIONS`), then post a bus status to port 3010. The operator should receive the push. (Each process keeps its own data, so read endpoints will differ; only pushes are shared.)
5. Record the result in `docs/status.md`.
