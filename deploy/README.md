# Deploying the backend on another computer

**Status: written but not run.** Nothing in this folder has been built or started (there was no Docker on the machine it was written on). The steps below without Docker are the ones that have been run, on one machine.

## Without Docker (the checked way)

1. Install Node 22, PostgreSQL 16 and Redis 7 on the server.
2. `git clone https://github.com/hongmengsim/SG-GoAssist`, then `npm ci --workspace @buspass/shared --workspace @buspass/backend` and `npm install --no-save --workspace @buspass/backend pg ioredis`.
3. `npm run build --workspace @buspass/backend`.
4. Set `GOASSIST_DATABASE_URL`, `GOASSIST_EVENT_BUS=redis`, `GOASSIST_REDIS_URL` (with a password if Redis is reachable from other machines), `GOASSIST_LOCKS=database`, `OPERATOR_API_TOKEN` and `DEVICE_SHARED_SECRET` (or `DEVICE_SECRETS`). The server refuses to start in this configuration without the two secrets.
5. `npm start --workspace @buspass/backend`. Start a second process on another `PORT` with its own `GOASSIST_DATA_DIR` for two processes.
6. From the Pi or another machine, point the agent's `backendUrl` at the server and set the same `DEVICE_SHARED_SECRET` in its environment.

## With Docker (untested)

`cp deploy/.env.example deploy/.env`, fill it in, then `docker compose -f deploy/docker-compose.yml up --build`. This starts Postgres, Redis and two backend processes (ports 3000 and 3010).

## Cross-machine check (not done)

`npm run check:multi-process` starts both backend processes itself on the machine it runs on, so it cannot show that two machines work. To check across machines: start one process on each machine against the same Postgres and Redis, post a bus status to one, and confirm an operator WebSocket on the other receives it, as step 4 of `docs/runbooks/multi-process.md` describes. Record the result in `docs/status.md`.
