# operator-console

**Status: mock mode and live mode implemented, with case handling (O3) and the decision panel (O4). Live mode was checked against the real backend with two simulated bus agents; never shown to a real operator and never fed by real sensors.**

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
- **Live mode** (`?mode=live&backend=http://host:3000`, default this host on port 3000) reads the backend's operator endpoints for a snapshot, follows a `SUBSCRIBE_OPERATIONS` WebSocket, and re-reads the audit log and request list shortly after anything changes (the audit log is not pushed, and pushed request messages carry no case id). The operator token, if the backend requires one, is asked for on the page and kept in session storage only. The header says in words whether it is connected, reconnecting, needs the token, or cannot reach the backend. Passenger identity (session ids) is dropped on the way in. The backend allows any loopback page origin outside production; other origins need `ALLOWED_ORIGINS` set on the backend.
- **Actions in live mode:** _Proceed next waiting bus to bay_ (`POST /bays/:stop/proceed`) and _Cancel request_ (the case operator action `CANCEL`) work. _Deploy_ and _Halt_ are shown disabled with the reason: the backend issues the deploy command itself once a case is cleared, and there is no operator halt channel to the bus yet. The backend, not the console, decides whether an action is allowed; its refusal is shown as text.
- **Cases (O3):** `#/cases` lists assistance cases (those needing attention first, with the reason), and `#/case/:id` shows intent, boarding-intent assessment, the bus's safety clearance checklist, the action plan and the five case actions the older `/operator` page had (confirm intent, retry checks, escalate, complete, cancel). Escalate, complete and cancel ask for confirmation. The overview shows the same metrics strip (active cases, needing attention, acknowledgement p95, safety blocks, devices online, perception precision) and a panel of cases needing attention; each bus page links its current case. The autonomous-vehicle panel and its three overrides (safety stop, manual control, resume after checks) are ported too, with the same request bodies. The backend decides whether an action is allowed and its refusal is shown; completing or cancelling with something in the ramp path does not retract the ramp.
- **Decision panel (O4):** each halt reason is its own list item in words, with the time the bus decided and a plain statement that the bus decides; a dashed box marks where a live camera view will go and says it is not connected and not recorded. A test checks that every halt and help reason in the contract has words.
- With these in place the console covers everything the older `/operator` page does. That page has been removed from the backend (30 Sep 2026).

## Run it alone

No backend needed:

```
node operator-console/serve.mjs          # or: npm run console   (from the repository root)
```

Open http://localhost:5173/ (mock mode is the default; add `?mode=live` for a running backend). The server only serves the page's own files.

## Test

```
npm test        # from this folder; node:test, no browser, no network
```

Covers the reducer, the derived views, the HTML (escaping, marks, words, disabled actions), the mock world's rules, schema conformance of everything the mock emits, the live source against a fake backend and socket, and an integration test that starts the built backend (skipped if `backend/dist` is missing) and checks the console's picture, the audit log, proceed and cancel against it. Test ajv comes from the `contracts` workspace.

## Depends on

`contracts/` (the schema, in tests only). It must not import backend code and has no build step or runtime dependencies.
