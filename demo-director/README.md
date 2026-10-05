# demo-director

**Status: built and tested against fake agents and a fake backend, and against a real backend with two simulated agents (`test/e2e.test.mjs`). Never run with the real Bus 1 or on the demonstration day.**

> **DEMO CONTROL, NOT THE OPERATOR CONSOLE.** This module is for our presenters. The operator console (`operator-console/`) is for bus interchange staff. The two share no code and do not link to each other.

## Purpose

The demonstration has two buses, and some of the states we want to show (an object on the ramp, a beam that drops out, a lost link, a deployment that stalls) cannot be made on demand with physical hardware. The demo director lets a presenter:

- **Move each bus** with buttons (travel, arrive, depart) and watch it drawn moving through the stop: approaching, waiting lane, boarding bay, leaving. The real Bus 1 only moves its **state**; no vehicle drives.
- **Create a passenger request without a phone** (a simulated passenger).
- **Inject, on a simulated bus only,** the states we cannot make physically: a person or a leaf or a bag in the ramp zone, the beam blocked, the sensor dropping out, the camera covered, the backend link cut (and so the deployment timeout, help-required and link-loss halt).
- **Do what an operator does** through the backend's existing routes: grant the bay, set or release an operator halt, cancel a request.
- **Play the agreed two-bus sequence** (handoff section 7) one step at a time, with the system itself confirming each step.
- **See a live timeline** of what the backend and both buses did, each line labelled with its source.

Every input is labelled **■ REAL** or **◇ SIMULATED**, in words, with a shape and a border style (never colour alone).

### What it cannot do, by construction

- It cannot **set a ramp state**, **acknowledge a request for a bus**, **change the Pi's gate**, or **change what a real bus's sensors read**. There is no route or code path for any of those, and tests assert it.
- For a **real** bus it refuses every scene change (the director checks this itself, and the agent refuses it too), and it shows the real beam and camera readings, labelled REAL, with a prompt for what to do physically ("put a hand in the beam").
- A request is confirmed **only by the bus itself** (its signed `assist-ack`). The director holds no device secret and never calls the simulator route.

### Why it is separate from the operator console

Its page title, banner ("DEMO CONTROL, NOT THE OPERATOR CONSOLE"), heavy dashed frame and boxed cards are different on purpose. It has its own folder, port, README and module entry; it never imports console code and the console never imports it (`npm run check:modules` enforces the boundary).

## Interface

**Starts only when asked, never in production.** The server refuses to start unless `DEMO_DIRECTOR=on`, and refuses `NODE_ENV=production`. It listens on `127.0.0.1` only unless `DEMO_HOST` says otherwise.

Settings come from the environment (never from a file, because they are secrets):

| Variable                                      | Meaning                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DEMO_DIRECTOR=on`                            | required to start                                                                                       |
| `DEMO_AGENTS`                                 | JSON list `[{"busId":"AV-095-01","url":"http://host:8780","code":"<start-up code>"}, ...]`, Bus 1 first |
| `OPERATOR_API_TOKEN` or `DEMO_OPERATOR_TOKEN` | the backend's operator token, used for the operator routes                                              |
| `DEMO_BACKEND_URL`                            | backend address (default `http://localhost:3000`)                                                       |
| `DEMO_STOP`                                   | the stop code (default `18331`)                                                                         |
| `DEMO_PORT`, `DEMO_HOST`, `DEMO_POLL_MS`      | page port (default 5190), address (default loopback), how often it reads the system (default 1000 ms)   |

The agent codes and the operator token stay on the server; the page never receives them.

**How it reaches the buses (direct control).** Each agent has its own status page and control API (`pi/bus-agent`, `--status-port`); the start-up code it prints is the key. A simulated bus (`--simulate`) takes scene and movement commands. A real bus takes **movement commands only**, and only when started with `--demo-movement` (it needs `--real` and `--status-port`). No new backend route exists for any of this. The control surface is documented in `docs/interfaces/demo-control.md`.

**The page's API** (all actions are `POST` with the `X-Demo-Director: 1` header and the page's own origin): `GET /api/state`; `POST /api/agents/:busId/control`, `/api/request`, `/api/bay/proceed`, `/api/halt`, `/api/cancel`, `/api/sequence/:n/act`. Nothing else exists.

## Run it alone

Start the backend (with `GOASSIST_AUTO_ACK=off`, so only a bus confirms), then the agents, then the director. For a laptop rehearsal with two simulated buses:

```
python -m bus_agent --simulate --bus-id AV-095-01 --backend http://localhost:3000 --status-port 8780 --deployment-timeout 30 --link-loss-halt 10
python -m bus_agent --simulate --bus-id AV-095-02 --backend http://localhost:3000 --status-port 8781 --deployment-timeout 30 --link-loss-halt 10
```

(run from `pi/bus-agent`, with `DEVICE_SHARED_SECRET` set). Each agent prints `Status page: http://localhost:<port>/#<code>`; the part after `#` is its code. Then, in PowerShell:

```
$env:DEMO_DIRECTOR='on'; $env:DEMO_AGENTS='[{"busId":"AV-095-01","url":"http://localhost:8780","code":"<code 1>"},{"busId":"AV-095-02","url":"http://localhost:8781","code":"<code 2>"}]'; $env:OPERATOR_API_TOKEN='<token>'; node serve.mjs
```

and open `http://127.0.0.1:5190/`. For the real Bus 1, start its agent with `--real --config ... --status-port 8780 --demo-movement`. Hardware steps are in `docs/runbooks/demo-day.md` (not yet written).

## Test

`npm test` in this folder: unit and page tests against fake agents and a fake backend (`test/*.test.mjs`), and `test/e2e.test.mjs`, which starts a real backend, two simulated agents through their real command line, and the director, and plays the whole two-bus sequence through the director's own HTTP control path. It needs Python with the bus agent's requirements.

## Depends on

Nothing in this repository at build time (`allowedDependencies` is empty). At run time it talks over HTTP to the backend's existing REST routes and to each agent's status page. It does not import `operator-console`, `backend`, `contracts` or any Python module.
