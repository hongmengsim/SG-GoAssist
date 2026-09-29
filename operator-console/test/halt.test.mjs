// The operator halt: state, the bus page, and the live source's Halt / Release action.
import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "../src/state.js";
import { busPage } from "../src/views.js";
import { createLiveSource } from "../src/live/source.js";

const T1 = "2026-09-30T00:00:01.000Z";
const T2 = "2026-09-30T00:00:02.000Z";
const B1 = "AV-095-01";
const halt = (halted, setAt = T1, busId = B1) => ({
  type: "OPERATOR_HALT",
  halt: { busId, halted, setAt, reason: "Inspect" },
  timestamp: setAt,
});

test("the reducer keeps the newest operator halt for each bus", () => {
  let state = reduce(initialState(), halt(true, T2));
  state = reduce(state, halt(false, T1));
  assert.equal(
    state.buses[B1].operatorHalt.halted,
    true,
    "an older change does not undo a newer one",
  );
  state = reduce(state, halt(false, "2026-09-30T00:00:03.000Z"));
  assert.equal(state.buses[B1].operatorHalt.halted, false);
  assert.deepEqual(
    reduce(initialState(), { type: "OPERATOR_HALT", halt: null }),
    initialState(),
  );
});

test("the bus page says in words when an operator halt is on, and offers to release it", () => {
  const state = [
    {
      type: "BUS_STATUS",
      status: {
        busId: B1,
        busService: "95",
        stopCode: "18331",
        movement: "POSITIONED_AT_STOP",
        simulated: true,
        observedAt: T1,
      },
      timestamp: T1,
    },
    halt(true),
  ].reduce(reduce, initialState());
  const html = busPage(
    state,
    B1,
    { kind: "ALL", busId: "ALL", requestId: "ALL" },
    { halt: { enabled: true, label: "Release halt" } },
  );
  assert.match(html, /Operator halt is on/);
  assert.match(html, /Inspect/);
  assert.match(html, />Release halt</);
});

const T = "2026-09-30T00:00:00.000Z";

class FakeSocket {
  constructor() {
    this.readyState = 0;
  }
  send() {}
  close() {}
}

function backend(halted) {
  const posts = [];
  const data = {
    "/api/operations/bus-status": {
      statuses: [
        {
          busId: B1,
          busService: "95",
          stopCode: "18331",
          movement: "POSITIONED_AT_STOP",
          simulated: true,
          observedAt: T,
        },
      ],
    },
    "/api/operations/ramp-simulations": { records: [] },
    "/api/operations/safety-decisions": { records: [] },
    "/api/operations/help-required": { records: [] },
    "/api/assistance": { requests: [] },
    "/api/operations/audit": { events: [] },
    "/api/operations/cases": { cases: [] },
    "/api/operations/operator-halts": {
      records: halted ? [{ busId: B1, halted: true, setAt: T }] : [],
    },
    "/api/operations/bays/18331": {
      stopCode: "18331",
      bayId: "BAY-1",
      occupantBusId: B1,
      waitingBusIds: [],
      grantedBusId: null,
      updatedAt: T,
    },
  };
  const fetchFn = async (url, options = {}) => {
    const { pathname } = new URL(url);
    if (pathname === `/api/operations/vehicles/${B1}/operator-halt`) {
      posts.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ busId: B1, halted: true, setAt: T }),
      };
    }
    const entry = data[pathname];
    if (entry === undefined)
      return { ok: false, status: 404, json: async () => ({ error: "nf" }) };
    return { ok: true, status: 200, json: async () => structuredClone(entry) };
  };
  return { fetchFn, posts };
}

async function started(halted) {
  const api = backend(halted);
  const source = createLiveSource({
    baseUrl: "http://b.test",
    fetchFn: api.fetchFn,
    WebSocketCtor: FakeSocket,
    schedule: () => () => {},
  });
  source.start();
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  return { source, api };
}

test("live: the snapshot includes which buses are halted, and Halt is offered as Halt bus", async () => {
  const { source } = await started(false);
  const halt = source.actionsFor(B1, "18331").halt;
  assert.equal(halt.enabled, true);
  assert.match(halt.label, /Halt bus/);
});

test("live: when a bus is halted the same button is Release halt", async () => {
  const { source } = await started(true);
  assert.equal(source.state.buses[B1].operatorHalt.halted, true);
  assert.match(source.actionsFor(B1, "18331").halt.label, /Release/);
});

test("live: Halt posts halted true and Release posts halted false", async () => {
  const off = await started(false);
  assert.equal((await off.source.perform("halt", { busId: B1 })).ok, true);
  assert.deepEqual(off.api.posts[0], {
    halted: true,
    reason: "Halted by operator from the console",
  });
  const on = await started(true);
  assert.equal((await on.source.perform("halt", { busId: B1 })).ok, true);
  assert.equal(on.api.posts[0].halted, false);
});
