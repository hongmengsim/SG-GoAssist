# operator-console

**Status: mock mode implemented (overview, bus stop, bus, filterable audit log, playground). Live mode (talking to the backend) is the next step. Never shown to a real operator yet.**

## Purpose

The controller's screen for the main computer. It shows the whole system and lets an operator step in only when something goes wrong.

- **Overview:** bus stops and buses as clickable cards, a help-required banner, and the audit log of every event, filterable by kind, bus and request.
- **Bus stop:** the bay and the status of every bus at the stop (in the bay, waiting for the bus ahead to leave, cleared to enter, travelling, departing), the requests at that stop, and the control to send the next waiting bus into the bay.
- **Bus:** its four separate status categories (movement, request, simulated ramp, sensors and faults), the ramp zone drawn from the Pi's decision, and operator actions (deploy request, halt, cancel).
- Buses are their own entity, not part of a stop's identity; a stop is only where a bus currently is.

Operator actions are requests. The bus's local decision still has the final say, and an operator can never override an obstruction or missing sensor data. Simulated things are labelled simulated. The ramp-zone panel is a schematic drawn from the Pi's decision, not a camera image; a live camera view is a labelled placeholder.

## Colour is never the only signal

Every status is a word plus a shape mark (● normal, ○ idle, ▲ attention, ■ halted or fault, ◆ in progress, ◇ simulated) and its own border style (solid, dotted, double, heavy, dashed). Audit-log kinds have their own left-edge pattern as well as a word. Schematics use filled, outlined and dashed shapes with text labels. `test/views.test.mjs` fails if a tag loses its mark or words, if a kind loses its border style, or if colour is applied inline.

## Interface

- **State** is built by one reducer (`src/state.js`) from the messages the backend pushes to operators (`BUS_STATUS`, `BAY_STATUS`, `RAMP_SIMULATION`, `RAMP_SAFETY`, `HELP_REQUIRED`, plus request messages), so mock and live mode look identical to the views.
- **Views** (`src/views.js`) are pure functions returning HTML from `(state, ui, actions)`; everything user-visible is escaped.
- **Mock mode** (`src/mock/`) is a small simulated world with two buses, one stop and one bay. It emits contract-shaped messages; a test validates every wire message it emits against the schema generated from `contracts/`. Its gate rules are stand-ins for `pi/safety-gate`. A playground drawer lets you create requests, move buses, place objects in the ramp zone and inject faults. The stall timeout in the playground is a placeholder, not an agreed value.
- **Live mode** will use the backend's REST endpoints and a `SUBSCRIBE_OPERATIONS` WebSocket with the operator token (roadmap O2). The existing backend `/operator` page has case actions (confirm, escalate, cancel, complete, retry) that this console must port before that page is retired (O3).

## Run it alone

No backend needed:

```
node operator-console/serve.mjs          # or: npm run console   (from the repository root)
```

Open http://localhost:5173/ (mock mode is the default). The server only serves the page's own files.

## Test

```
npm test        # from this folder; node:test, no browser, no network
```

Covers the reducer, the derived views, the HTML (escaping, marks, words, disabled actions), the mock world's rules, and schema conformance of everything the mock emits. Test ajv comes from the `contracts` workspace.

## Depends on

`contracts/` (the schema, in tests only). It must not import backend code and has no build step or runtime dependencies.
