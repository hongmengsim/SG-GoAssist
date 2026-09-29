import test from "node:test";
import assert from "node:assert/strict";
import { createLiveSource } from "../src/live/source.js";

const T = "2026-09-30T00:00:00.000Z";
const STOP = "18331";
const B1 = "AV-095-01";
const B2 = "AV-095-02";

class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeSocket.instances.push(this);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function backend(overrides = {}) {
  const calls = [];
  const data = {
    "/api/operations/bus-status": {
      count: 2,
      statuses: [
        {
          busId: B1,
          busService: "95",
          stopCode: STOP,
          movement: "POSITIONED_AT_STOP",
          simulated: true,
          observedAt: T,
        },
        {
          busId: B2,
          busService: "95",
          stopCode: STOP,
          movement: "WAITING_FOR_BAY",
          simulated: true,
          observedAt: T,
        },
      ],
    },
    "/api/operations/ramp-simulations": {
      count: 1,
      records: [
        { busId: B1, state: "DEPLOYING", simulated: true, observedAt: T },
      ],
    },
    "/api/operations/safety-decisions": {
      count: 1,
      records: [
        {
          busId: B1,
          zoneState: "CLEAR",
          permission: "CONTINUE",
          reasons: [],
          tof: { state: "BEAM_CLEAR", simulated: true },
          camera: { imageOk: true },
          objectsInZone: [],
          simulated: true,
          observedAt: T,
        },
      ],
    },
    "/api/operations/help-required": { count: 0, records: [] },
    "/api/assistance": {
      count: 1,
      requests: [
        {
          requestId: "REQ-1",
          caseId: "CASE-1",
          sessionId: "secret-session",
          busId: B1,
          busService: "95",
          boardingStop: "18301",
          stopCode: STOP,
          assistanceTypes: ["WHEELCHAIR_RAMP"],
          boardingOrAlighting: "BOARDING",
          status: "ACKNOWLEDGED",
          createdAt: T,
        },
      ],
    },
    "/api/operations/audit": {
      count: 1,
      events: [
        {
          eventId: "E1",
          eventType: "BAY_CHANGED",
          actor: "VEHICLE",
          timestamp: T,
          detail: {},
        },
      ],
    },
    "/api/operations/cases": {
      count: 1,
      cases: [
        {
          caseId: "CASE-1",
          stopCode: STOP,
          busId: B1,
          busService: "95",
          phase: "BOARDING",
          intents: [{ intentId: "I1", confirmed: true }],
          assistanceTypes: ["WHEELCHAIR_RAMP"],
          passengerCount: 1,
          confidence: 0.9,
          boardingIntent: {
            decision: "CONFIRMED",
            confidence: 0.9,
            reason: "Explicit request",
            evidence: [],
            assessedAt: T,
          },
          state: "BLOCKED",
          escalationReason: "Ramp deployment path is obstructed",
          actionPlan: [],
          outcome: { operatorInterventions: 0 },
          createdAt: T,
          updatedAt: T,
        },
      ],
    },
    [`/api/operations/vehicles/${B1}/telemetry`]: {
      busId: B1,
      vehicleStopped: true,
      parkingBrakeActive: true,
      doorOpen: true,
      deploymentPathClear: false,
      rampPosition: "STOWED",
      observedAt: T,
    },
    [`/api/operations/vehicles/${B1}/autonomy`]: {
      busId: B1,
      state: "DOCKED",
      mode: "AUTOMATIC",
      targetStopCode: STOP,
      distanceToTargetMeters: 0,
      speedKph: 0,
    },
    "/api/operations/metrics": {
      activeCases: 1,
      safetyBlocks: 3,
      acknowledgementP95Ms: 250,
    },
    "/api/operations/devices": {
      count: 2,
      devices: [
        {
          deviceId: "d1",
          networkOnline: true,
          observedAt: new Date().toISOString(),
        },
        { deviceId: "d2", networkOnline: false, observedAt: T },
      ],
    },
    "/api/operations/perception/metrics": { microPrecision: 0.5 },
    [`/api/operations/bays/${STOP}`]: {
      stopCode: STOP,
      bayId: "BAY-1",
      occupantBusId: B1,
      waitingBusIds: [B2],
      grantedBusId: null,
      updatedAt: T,
    },
    ...overrides,
  };
  const fetchFn = async (url, options = {}) => {
    const { pathname } = new URL(url);
    calls.push({
      url,
      method: options.method ?? "GET",
      headers: options.headers ?? {},
      body: options.body,
    });
    const entry = data[pathname];
    if (typeof entry === "function") return entry(options);
    if (entry === undefined)
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not found" }),
      };
    return { ok: true, status: 200, json: async () => structuredClone(entry) };
  };
  return { fetchFn, calls, data };
}

function make(overrides = {}, options = {}) {
  FakeSocket.instances = [];
  const timers = [];
  const api = backend(overrides);
  const source = createLiveSource({
    baseUrl: "http://backend.test:3000",
    token: options.token,
    fetchFn: api.fetchFn,
    WebSocketCtor: FakeSocket,
    schedule: (fn, ms) => {
      const timer = { fn, ms, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  });
  return {
    source,
    api,
    timers,
    socket: () => FakeSocket.instances.at(-1),
    async settle() {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    },
    async runTimers() {
      for (const timer of timers.splice(0)) if (timer.live) timer.fn();
      await this.settle();
    },
  };
}

test("start loads a snapshot of everything and connects the socket", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  const state = t.source.state;
  assert.equal(state.buses[B1].status.movement, "POSITIONED_AT_STOP");
  assert.equal(state.buses[B1].ramp.state, "DEPLOYING");
  assert.equal(state.buses[B1].decision.permission, "CONTINUE");
  assert.equal(state.bays[STOP].occupantBusId, B1);
  assert.equal(state.requests["REQ-1"].caseId, "CASE-1");
  assert.equal(
    "sessionId" in state.requests["REQ-1"],
    false,
    "no passenger identity in the console",
  );
  assert.equal(state.audit.length, 1);
  assert.equal(t.socket().url, "ws://backend.test:3000");
});

test("the socket subscribes as an operator and the connection is reported in words", async () => {
  const t = make({}, { token: "op-token" });
  t.source.start();
  await t.settle();
  assert.equal(t.source.connection.status, "connecting");
  t.socket().open();
  assert.deepEqual(t.socket().sent[0], {
    type: "SUBSCRIBE_OPERATIONS",
    token: "op-token",
  });
  t.socket().push({ type: "SUBSCRIBED_OPERATIONS", scoped: false });
  assert.equal(t.source.connection.status, "connected");
});

test("the operator token is sent as a bearer token on every request", async () => {
  const t = make({}, { token: "op-token" });
  t.source.start();
  await t.settle();
  assert.ok(t.api.calls.length > 5);
  for (const call of t.api.calls)
    assert.equal(call.headers.Authorization, "Bearer op-token", call.url);
});

test("pushed messages change the state and the revision", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  t.socket().open();
  const before = t.source.revision;
  t.socket().push({
    type: "BUS_STATUS",
    status: {
      busId: B1,
      busService: "95",
      stopCode: STOP,
      movement: "DEPARTING",
      simulated: true,
      observedAt: "2026-09-30T00:00:05.000Z",
    },
    timestamp: T,
  });
  assert.equal(t.source.state.buses[B1].status.movement, "DEPARTING");
  assert.ok(t.source.revision > before);
});

test("a message that arrives triggers a refresh of the audit log, once, soon after", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  t.socket().open();
  const auditCalls = () =>
    t.api.calls.filter((c) => c.url.includes("/audit")).length;
  const before = auditCalls();
  for (let i = 0; i < 5; i += 1)
    t.socket().push({
      type: "BAY_STATUS",
      bay: {
        stopCode: STOP,
        bayId: "BAY-1",
        occupantBusId: null,
        waitingBusIds: [],
        grantedBusId: null,
        updatedAt: `2026-09-30T00:00:0${i + 1}.000Z`,
      },
      timestamp: T,
    });
  await t.runTimers();
  assert.equal(auditCalls(), before + 1);
});

test("a rejected token is reported as needing a token, and setting one retries", async () => {
  let allow = false;
  const guarded = (options) =>
    allow || options.headers?.Authorization === "Bearer good"
      ? {
          ok: true,
          status: 200,
          json: async () => ({
            count: 0,
            statuses: [],
            records: [],
            requests: [],
            events: [],
          }),
        }
      : {
          ok: false,
          status: 401,
          json: async () => ({ error: "Operator authentication required" }),
        };
  const t = make({
    "/api/operations/bus-status": guarded,
    "/api/operations/ramp-simulations": guarded,
    "/api/operations/safety-decisions": guarded,
    "/api/operations/help-required": guarded,
    "/api/operations/audit": guarded,
  });
  t.source.start();
  await t.settle();
  assert.equal(t.source.connection.status, "auth-required");
  t.source.setToken("good");
  await t.settle();
  assert.notEqual(t.source.connection.status, "auth-required");
});

test("when the connection drops it says so, reconnects, and loads the snapshot again", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  t.socket().open();
  t.socket().push({ type: "SUBSCRIBED_OPERATIONS" });
  const loads = () =>
    t.api.calls.filter((c) => c.url.includes("/bus-status")).length;
  const before = loads();
  t.socket().close();
  assert.equal(t.source.connection.status, "reconnecting");
  await t.runTimers();
  assert.equal(FakeSocket.instances.length, 2);
  t.socket().open();
  await t.settle();
  assert.ok(loads() > before, "snapshot reloaded after reconnect");
});

test("a backend that is down is reported, not thrown", async () => {
  FakeSocket.instances = [];
  const source = createLiveSource({
    baseUrl: "http://down.test",
    fetchFn: async () => {
      throw new TypeError("fetch failed");
    },
    WebSocketCtor: FakeSocket,
    schedule: () => () => {},
  });
  source.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(source.connection.status, "error");
  assert.match(source.connection.detail, /fetch failed/);
});

test("actions: proceed needs someone waiting and a free bay; cancel needs a request with a case; deploy is unavailable with a reason and halt is offered", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  assert.equal(
    t.source.actionsFor(B1, STOP).proceed.enabled,
    false,
    "the bay is occupied",
  );
  assert.equal(t.source.actionsFor(B1, STOP).cancel.enabled, true);
  assert.equal(
    t.source.actionsFor(B2, STOP).cancel.enabled,
    false,
    "no request for this bus",
  );
  const { deploy, halt } = t.source.actionsFor(B1, STOP);
  assert.equal(deploy.enabled, false);
  assert.match(deploy.reason, /automatic|no operator deploy/i);
  assert.equal(halt.enabled, true);
  assert.match(halt.label, /Halt bus/);
  t.socket().open();
  t.socket().push({
    type: "BAY_STATUS",
    bay: {
      stopCode: STOP,
      bayId: "BAY-1",
      occupantBusId: null,
      waitingBusIds: [B2],
      grantedBusId: null,
      updatedAt: "2026-09-30T00:00:09.000Z",
    },
    timestamp: T,
  });
  assert.equal(t.source.actionsFor(B2, STOP).proceed.enabled, true);
});

test("perform proceed posts to the bay endpoint of that stop", async () => {
  const posted = [];
  const t = make({
    [`/api/operations/bays/${STOP}/proceed`]: (options) => {
      posted.push(options.method);
      return {
        ok: true,
        status: 200,
        json: async () => ({ stopCode: STOP, grantedBusId: B2 }),
      };
    },
  });
  t.source.start();
  await t.settle();
  const result = await t.source.perform("proceed", { stopCode: STOP });
  assert.equal(result.ok, true);
  assert.deepEqual(posted, ["POST"]);
});

test("perform cancel posts the CANCEL action to the request's case", async () => {
  let body;
  const t = make({
    "/api/operations/cases/CASE-1/operator": (options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ case: {} }) };
    },
  });
  t.source.start();
  await t.settle();
  const result = await t.source.perform("cancel", { busId: B1 });
  assert.equal(result.ok, true);
  assert.equal(body.action, "CANCEL");
  assert.ok(body.reason);
});

test("a refused action returns the backend's reason instead of throwing", async () => {
  const t = make({
    [`/api/operations/bays/${STOP}/proceed`]: () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Bay is occupied by AV-095-01" }),
    }),
  });
  t.source.start();
  await t.settle();
  const result = await t.source.perform("proceed", { stopCode: STOP });
  assert.equal(result.ok, false);
  assert.match(result.message, /occupied/);
  const noBus = await t.source.perform("halt", {});
  assert.equal(noBus.ok, false, "halting needs a bus");
});

test("stop closes the socket and cancels timers", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  t.socket().open();
  t.source.stop();
  assert.equal(t.socket().readyState, 3);
  await t.runTimers();
  assert.equal(FakeSocket.instances.length, 1, "no reconnect after stop");
});

test("the snapshot includes cases, the bus's telemetry and autonomy, and the metrics", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  const state = t.source.state;
  assert.equal(state.cases["CASE-1"].state, "BLOCKED");
  assert.equal(state.telemetry[B1].deploymentPathClear, false);
  assert.equal(state.autonomy[B1].mode, "AUTOMATIC");
  assert.equal(state.metrics.activeCases, 1);
  assert.equal(
    state.metrics.devicesOnline,
    1,
    "only devices seen recently and online count",
  );
  assert.equal(state.metrics.perceptionPrecision, 0.5);
});

test("a bus with no telemetry or autonomy record does not break the snapshot", async () => {
  const t = make({
    [`/api/operations/vehicles/${B1}/telemetry`]: () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "Safety telemetry not found" }),
    }),
    [`/api/operations/vehicles/${B1}/autonomy`]: () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    }),
    "/api/operations/metrics": () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }),
  });
  t.source.start();
  await t.settle();
  assert.notEqual(t.source.connection.status, "error");
  assert.equal(t.source.state.cases["CASE-1"].state, "BLOCKED");
  assert.equal(t.source.state.telemetry[B1], undefined);
});

test("a pushed case status updates the case and refreshes the lists", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  t.socket().open();
  t.socket().push({
    type: "CASE_STATUS",
    caseId: "CASE-1",
    state: "ACTUATING",
    busId: B1,
    stopCode: STOP,
    passengerCount: 1,
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    timestamp: "2026-09-30T00:00:09.000Z",
  });
  assert.equal(t.source.state.cases["CASE-1"].state, "ACTUATING");
  const before = t.api.calls.filter((c) => c.url.includes("/cases")).length;
  await t.runTimers();
  assert.ok(
    t.api.calls.filter((c) => c.url.includes("/cases")).length > before,
  );
});

test("each case action is posted to the case's operator endpoint", async () => {
  const bodies = [];
  const t = make({
    "/api/operations/cases/CASE-1/operator": (options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ case: {} }) };
    },
  });
  t.source.start();
  await t.settle();
  for (const action of ["CONFIRM", "RETRY", "ESCALATE", "COMPLETE", "CANCEL"]) {
    const result = await t.source.perform("case", { caseId: "CASE-1", action });
    assert.equal(result.ok, true, action);
  }
  assert.deepEqual(
    bodies.map((b) => b.action),
    ["CONFIRM", "RETRY", "ESCALATE", "COMPLETE", "CANCEL"],
  );
  const unknown = await t.source.perform("case", {
    caseId: "CASE-1",
    action: "DELETE_EVERYTHING",
  });
  assert.equal(unknown.ok, false);
});

test("autonomy overrides are posted as the older operator page posted them", async () => {
  const bodies = [];
  const t = make({
    [`/api/operations/vehicles/${B1}/autonomy/override`]: (options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  t.source.start();
  await t.settle();
  await t.source.perform("autonomy", { busId: B1, action: "STOP" });
  await t.source.perform("autonomy", { busId: B1, action: "RESUME" });
  assert.deepEqual(bodies[0], { action: "STOP" });
  assert.deepEqual(bodies[1], {
    action: "RESUME",
    obstacleCleared: true,
    localizationAccuracyMeters: 5,
  });
});

test("case actions are offered only for cases that are not finished", async () => {
  const t = make();
  t.source.start();
  await t.settle();
  assert.equal(t.source.caseActionsFor("CASE-1").CANCEL.enabled, true);
  assert.equal(t.source.caseActionsFor("CASE-1").AUTONOMY_STOP.enabled, true);
  assert.equal(t.source.caseActionsFor("NOPE").CANCEL.enabled, false);
  t.socket().open();
  t.socket().push({
    type: "CASE_STATUS",
    caseId: "CASE-1",
    state: "COMPLETED",
    busId: B1,
    stopCode: STOP,
    passengerCount: 1,
    assistanceTypes: [],
    timestamp: "2026-09-30T00:00:09.000Z",
  });
  assert.equal(t.source.caseActionsFor("CASE-1").CANCEL.enabled, false);
});
