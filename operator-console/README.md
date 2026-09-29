# operator-console

**Status: planned, not implemented.** A working prototype exists in the separate ML workspace (`controller_ui/index.html`, running on mock data) and will be ported here.

## Purpose

The controller's screen for the main computer. It shows the whole system and lets an operator step in only when something goes wrong.

- **Overview:** bus stops and buses as clickable cards, and the audit log of every request and event, filterable by kind, bus and request.
- **Bus stop:** the bay and the status of every bus at the stop (in the bay, waiting for the bus ahead to leave, travelling, departing), the requests at that stop, and the control to send the next waiting bus into the bay.
- **Bus:** its four separate status categories (movement, request, simulated ramp, sensors and faults), ramp progress, the live ramp-zone view where the bus has a camera, and operator actions (deploy request, halt, cancel).
- Buses are their own entity, not part of a stop's identity; a stop is only where a bus currently is.

Operator actions are requests. The bus's local decision still has the final say, and an operator can never override an obstruction or missing sensor data. Simulated things are labelled simulated.

## Interface

- Reads the backend over REST and a WebSocket subscribed with `SUBSCRIBE_OPERATIONS`; uses the operator token when the backend requires one.
- Needs a backend audit read endpoint and bay endpoints that do not exist yet (`docs/interfaces/message-additions.md`).
- The existing backend `/operator` page has case actions (confirm, escalate, cancel, complete, retry) that this console must port before that page is retired.

## Run it alone

Planned: a mock mode that needs no backend, with fixtures validated against the types in `contracts/`, so the console can be developed and demoed on its own. A live mode points at a backend URL.

## Test

Planned: `node --test` for the state and formatting logic and for contract-conformant fixtures.

## Depends on

`contracts/` (types only). It must not import backend code.
