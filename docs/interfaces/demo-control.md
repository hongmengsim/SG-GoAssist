# Demo control interface

**Status: built and tested with simulated agents and a real localhost backend (6 Oct 2026). Not run with the real Bus 1.** No `contracts/` type is involved: nothing here is a message between the backend and a device. It is the control surface that the demo director (`demo-director/`) uses on each bus agent, and the rules around it.

## Principles

1. **Direct control.** The demo director talks to each agent's own status page, not through the backend. The backend has no demo route and no demo flag.
2. **Off unless asked.** The agent's control API exists only for a simulated bus (`--simulate`), or for a real bus started with `--demo-movement`. The director itself starts only with `DEMO_DIRECTOR=on` and never in production.
3. **Movement is not a sensor.** A real bus can be told to arrive, depart or travel (its _state_ moves; no vehicle drives). Nothing can change what a real bus's sensors read.
4. **The Pi decides.** Every scene change only alters what a simulated bus appears to see. The gate still decides, and a halt can only be added, never removed.
5. **Confirmation comes from a bus.** The director never acknowledges a request and holds no device secret.

## The agent control API

Served by the bus agent's status page (`--status-port`), guarded by the start-up code the agent prints (sent as the `X-Status-Token` header). The page listens on the loopback address unless `--status-listen` says otherwise.

`GET /api/state` returns the agent's snapshot (movement, simulated ramp, the bus's own decision with reasons, beam, camera, backend link, operator halt, `simulated`, and `controlLevel`).

`POST /api/control` takes a JSON body `{ "command": ..., "value": ..., "confidence": ... }`:

| Command                               | Value                                                            | Control level that allows it |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------- |
| `arrive`, `travel`                    | a stop code (`travel`: optional)                                 | `movement` and `scene`       |
| `depart`                              | none                                                             | `movement` and `scene`       |
| `place`                               | an object class; optional `confidence` from 0 to 1 (default 0.9) | `scene` only                 |
| `clear`                               | none                                                             | `scene` only                 |
| `block`, `dropout`, `cover`, `frames` | `on` or `off`                                                    | `scene` only                 |
| `link`                                | `on` or `off`: `off` cuts the agent's link to the backend        | `scene` only                 |
| `halt`                                | `on` or `off` (the agent's local halt; not used by the director) | `scene` only                 |

**Control levels** (the `controlLevel` field of the snapshot): `scene` for a simulated bus, `movement` for a real bus started with `--demo-movement` (which needs `--real` and `--status-port`), and empty otherwise. A command above the agent's level is answered 403. A wrong code is answered 403. Bodies over 2 KB are refused.

`place leaf` or `place plastic_bag` at a confidence of 0.92 or more is the safe-object case (the policy treats those two classes as safe at that confidence); anything else, or a lower confidence, is treated as blocking.

`link off` is a switch in front of the agent's backend client, so every call fails as an unreachable backend does and the agent's own link-loss logic reacts as it would to a real outage (the ramp halts after `--link-loss-halt` seconds, if set). It exists only on simulated runs.

## Agent start-up flags added for the demonstration

- `--demo-movement` (with `--real` and `--status-port`): the movement-only control level for a real bus.
- `--deployment-timeout SECONDS` and `--link-loss-halt SECONDS` (with `--simulate`): the two safety timeouts for a simulated bus. A real bus takes them from its config file.

## What the demo director calls on the backend

Only existing routes, with the operator token: `GET` bay, bus status, requests, operator halts and audit (to show the system); `POST /api/assistance/request` (a simulated passenger, `source: MOBILE_APP`, session `demo-director`); `POST /api/operations/bays/:stop/proceed`; `POST /api/operations/vehicles/:busId/operator-halt`; `POST /api/operations/cases/:caseId/operator` (cancel). It never calls the acknowledgement, simulator, ramp, decision, telemetry or actuator routes, and tests fail if it does.

## The demo director's own API

`GET /api/state` (the page's data; never carries an agent code or the token) and these actions, each a `POST` that needs the header `X-Demo-Director: 1` and refuses a foreign `Origin`: `/api/agents/:busId/control`, `/api/request`, `/api/bay/proceed`, `/api/halt`, `/api/cancel`, `/api/sequence/:n/act`. For a bus that reports itself real, or whose control level is not `scene`, every scene command is refused by the director itself (403) before the agent is contacted.
