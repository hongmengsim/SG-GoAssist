// O3: case state and case actions, so the console can replace the backend's older /operator page.
import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce } from "../src/state.js";
import {
  caseList,
  caseMetrics,
  caseView,
  caseForBus,
  needsAttention,
} from "../src/viewmodel.js";
import { casePage, casesPage, overviewPage, busPage } from "../src/views.js";
import { CASE_STATE } from "../src/labels.js";
import { createMockWorld, MOCK_BUSES } from "../src/mock/world.js";

const T = "2026-09-30T00:00:00.000Z";
const B1 = "AV-095-01";

const fullCase = (over = {}) => ({
  caseId: "CASE-1234ABCD",
  stopCode: "18331",
  busId: B1,
  busService: "95",
  phase: "BOARDING",
  intents: [
    { intentId: "I1", confirmed: true },
    { intentId: "I2", confirmed: false },
  ],
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  passengerCount: 1,
  confidence: 0.82,
  boardingIntent: {
    decision: "CONFIRMED",
    confidence: 0.9,
    reason: "Explicit request from the app",
    evidence: [],
    assessedAt: T,
  },
  state: "BLOCKED",
  escalationReason: "Ramp deployment path is obstructed",
  actionPlan: [
    {
      assistanceType: "WHEELCHAIR_RAMP",
      action: "DEPLOY_RAMP",
      requiresSafetyClearance: true,
      status: "PLANNED",
    },
  ],
  outcome: { operatorInterventions: 0 },
  createdAt: T,
  updatedAt: T,
  ...over,
});
const telemetry = (over = {}) => ({
  busId: B1,
  vehicleStopped: true,
  parkingBrakeActive: true,
  doorOpen: true,
  deploymentPathClear: false,
  rampPosition: "STOWED",
  networkOnline: true,
  observedAt: T,
  ...over,
});
const world = (...messages) => messages.reduce(reduce, initialState());

test("cases arrive as snapshots and as pushed status changes", () => {
  let state = world({ type: "CASE_SNAPSHOT", case: fullCase() });
  assert.equal(state.cases["CASE-1234ABCD"].state, "BLOCKED");
  state = reduce(state, {
    type: "CASE_STATUS",
    caseId: "CASE-1234ABCD",
    state: "ACTUATING",
    busId: B1,
    stopCode: "18331",
    passengerCount: 1,
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    timestamp: "2026-09-30T00:00:05.000Z",
  });
  assert.equal(state.cases["CASE-1234ABCD"].state, "ACTUATING");
  assert.equal(
    state.cases["CASE-1234ABCD"].boardingIntent.reason,
    "Explicit request from the app",
    "earlier detail is kept",
  );
  assert.equal(
    state.cases["CASE-1234ABCD"].escalationReason,
    undefined,
    "a push without a reason clears it",
  );
});

test("a status push for an unseen case creates a minimal case", () => {
  const state = reduce(initialState(), {
    type: "CASE_STATUS",
    caseId: "CASE-9",
    state: "ESCALATED",
    busId: B1,
    stopCode: "18331",
    passengerCount: 2,
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    escalationReason: "Operator review requested",
    timestamp: T,
  });
  assert.equal(state.cases["CASE-9"].state, "ESCALATED");
  assert.equal(state.cases["CASE-9"].passengerCount, 2);
});

test("telemetry, autonomy and metrics snapshots are stored", () => {
  const state = world(
    { type: "TELEMETRY_SNAPSHOT", telemetry: telemetry() },
    {
      type: "AUTONOMY_SNAPSHOT",
      autonomy: {
        busId: B1,
        state: "DOCKED",
        mode: "AUTOMATIC",
        targetStopCode: "18331",
        distanceToTargetMeters: 0,
        speedKph: 0,
      },
    },
    {
      type: "METRICS_SNAPSHOT",
      metrics: { activeCases: 2, safetyBlocks: 1 },
      devicesOnline: 2,
      perceptionPrecision: 0.5,
    },
  );
  assert.equal(state.telemetry[B1].doorOpen, true);
  assert.equal(state.autonomy[B1].mode, "AUTOMATIC");
  assert.equal(state.metrics.activeCases, 2);
  assert.equal(state.metrics.devicesOnline, 2);
});

test("every case state in the contract has words", () => {
  for (const name of [
    "REQUESTED",
    "VALIDATED",
    "VEHICLE_ASSIGNED",
    "SAFE_TO_ACTUATE",
    "ACTUATING",
    "READY",
    "COMPLETED",
    "NEEDS_CONFIRMATION",
    "ESCALATED",
    "BLOCKED",
    "FAILED",
    "CANCELLED",
  ]) {
    assert.ok(CASE_STATE[name]?.text && CASE_STATE[name]?.kind, name);
  }
});

test("the case list puts cases that need attention first and says why", () => {
  const state = world(
    {
      type: "CASE_SNAPSHOT",
      case: fullCase({
        caseId: "CASE-A",
        state: "ACTUATING",
        escalationReason: undefined,
        updatedAt: "2026-09-30T00:00:09.000Z",
      }),
    },
    {
      type: "CASE_SNAPSHOT",
      case: fullCase({
        caseId: "CASE-B",
        state: "BLOCKED",
        updatedAt: "2026-09-30T00:00:01.000Z",
      }),
    },
    {
      type: "CASE_SNAPSHOT",
      case: fullCase({
        caseId: "CASE-C",
        state: "COMPLETED",
        escalationReason: undefined,
      }),
    },
  );
  assert.deepEqual(
    caseList(state).map((c) => c.caseId),
    ["CASE-B", "CASE-A", "CASE-C"],
  );
  assert.equal(needsAttention(state).length, 1);
  assert.equal(caseList(state)[0].stateWords, "Blocked");
});

test("the case view shows intent, the safety checklist in words, the action plan and the reason", () => {
  const state = world(
    { type: "CASE_SNAPSHOT", case: fullCase() },
    { type: "TELEMETRY_SNAPSHOT", telemetry: telemetry() },
  );
  const view = caseView(state, "CASE-1234ABCD");
  assert.equal(view.title, "95 · stop 18331");
  assert.equal(view.intentsConfirmed, "1 of 2 intents confirmed");
  assert.match(view.boardingIntent, /Confirmed.*90%.*Explicit request/);
  assert.deepEqual(
    view.checklist.map((row) => [row.label, row.value]),
    [
      ["Vehicle stopped", "Clear"],
      ["Parking brake", "Clear"],
      ["Door open", "Clear"],
      ["Ramp path", "Blocked"],
      ["Ramp position", "Stowed"],
    ],
  );
  assert.equal(view.checklist[3].ok, false);
  assert.equal(view.plan[0], "Deploy ramp: Planned");
  assert.equal(view.reason, "Ramp deployment path is obstructed");
  assert.equal(caseView(state, "NOPE"), undefined);
});

test("without telemetry the checklist says it is waiting", () => {
  const view = caseView(
    world({ type: "CASE_SNAPSHOT", case: fullCase() }),
    "CASE-1234ABCD",
  );
  assert.equal(view.checklist, null);
});

test("a bus's current case is its newest one that is not finished", () => {
  const state = world(
    {
      type: "CASE_SNAPSHOT",
      case: fullCase({
        caseId: "OLD",
        state: "COMPLETED",
        createdAt: "2026-09-29T00:00:00.000Z",
      }),
    },
    {
      type: "CASE_SNAPSHOT",
      case: fullCase({ caseId: "NEW", state: "ACTUATING", createdAt: T }),
    },
  );
  assert.equal(caseForBus(state, B1).caseId, "NEW");
  assert.equal(caseForBus(state, "AV-095-02"), undefined);
});

test("metrics: active, needing attention, acknowledgement time, safety blocks, devices online", () => {
  const state = world(
    { type: "CASE_SNAPSHOT", case: fullCase() },
    {
      type: "METRICS_SNAPSHOT",
      metrics: { activeCases: 3, acknowledgementP95Ms: 420, safetyBlocks: 2 },
      devicesOnline: 4,
      perceptionPrecision: 0.75,
    },
  );
  assert.deepEqual(caseMetrics(state), {
    active: "3",
    attention: "1",
    acknowledgement: "420 ms",
    safetyBlocks: "2",
    devicesOnline: "4",
    perception: "75%",
  });
  assert.equal(caseMetrics(initialState()).acknowledgement, "–");
});

const enabled = (extra = {}) => ({ enabled: true, ...extra });
const caseActions = {
  CONFIRM: enabled(),
  RETRY: enabled(),
  ESCALATE: enabled(),
  COMPLETE: enabled(),
  CANCEL: enabled(),
};
const withCase = () =>
  world(
    { type: "CASE_SNAPSHOT", case: fullCase() },
    { type: "TELEMETRY_SNAPSHOT", telemetry: telemetry() },
    {
      type: "BUS_STATUS",
      status: {
        busId: B1,
        busService: "95",
        stopCode: "18331",
        movement: "POSITIONED_AT_STOP",
        simulated: true,
        observedAt: T,
      },
      timestamp: T,
    },
  );
const ui = { kind: "ALL", busId: "ALL", requestId: "ALL" };

test("the cases page lists cases with state in words and links to each", () => {
  const html = casesPage(withCase(), ui);
  assert.match(html, /href="#\/case\/CASE-1234ABCD"/);
  assert.match(html, /Blocked/);
  assert.match(html, /Ramp deployment path is obstructed/);
  assert.match(html, /Needs attention/);
});

test("the case page has the five case actions, the checklist, the plan and the reason", () => {
  const html = casePage(withCase(), "CASE-1234ABCD", caseActions);
  for (const action of ["CONFIRM", "RETRY", "ESCALATE", "COMPLETE", "CANCEL"])
    assert.match(html, new RegExp(`data-case-action="${action}"`));
  assert.match(html, /Ramp path/);
  assert.match(html, /Blocked/);
  assert.match(html, /Deploy ramp: Planned/);
  assert.match(html, /Ramp deployment path is obstructed/);
  assert.match(html, /1 of 2 intents confirmed/);
});

test("case actions the source disables are disabled with their reason; finished cases allow none", () => {
  const off = Object.fromEntries(
    Object.keys(caseActions).map((name) => [
      name,
      { enabled: false, reason: "Case is finished" },
    ]),
  );
  const html = casePage(withCase(), "CASE-1234ABCD", off);
  assert.match(html, /data-case-action="COMPLETE"[^>]*disabled/);
  assert.match(html, /Case is finished/);
});

test("a case that does not exist says so", () => {
  assert.match(
    casePage(initialState(), "NOPE", caseActions),
    /not found|No such case/i,
  );
});

test("the overview shows the metrics and the cases that need attention; the bus page links its case", () => {
  const state = withCase();
  assert.match(overviewPage(state, ui), /Cases needing attention/);
  assert.match(overviewPage(state, ui), /href="#\/case\/CASE-1234ABCD"/);
  assert.match(busPage(state, B1, ui, {}), /href="#\/case\/CASE-1234ABCD"/);
});

test("the mock world creates a case for an accepted request and follows it", () => {
  let now = Date.parse("2026-09-30T00:00:00.000Z");
  const w = createMockWorld({ clock: () => now });
  const step = (seconds) => {
    for (let i = 0; i < seconds * 2; i += 1) {
      now += 500;
      w.tick(0.5);
    }
  };
  w.submitRequest({ busId: MOCK_BUSES[0], help: "WHEELCHAIR_RAMP" });
  w.arrive(MOCK_BUSES[0]);
  step(1);
  const [id] = Object.keys(w.state.cases);
  assert.ok(id);
  assert.equal(w.state.cases[id].busId, MOCK_BUSES[0]);
  w.deploy(MOCK_BUSES[0], "OPERATOR");
  step(1);
  assert.equal(w.state.cases[id].state, "ACTUATING");
  w.placeObject(MOCK_BUSES[0], "person");
  step(1);
  assert.equal(w.state.cases[id].state, "BLOCKED");
  w.placeObject(MOCK_BUSES[0], null);
  step(10);
  assert.equal(w.state.cases[id].state, "READY");
});

test("mock case actions change the case and are audited as operator actions", () => {
  let now = Date.parse("2026-09-30T00:00:00.000Z");
  const w = createMockWorld({ clock: () => now });
  w.submitRequest({ busId: MOCK_BUSES[0], help: "WHEELCHAIR_RAMP" });
  w.arrive(MOCK_BUSES[0]);
  const [id] = Object.keys(w.state.cases);
  w.caseAction(id, "ESCALATE");
  assert.equal(w.state.cases[id].state, "ESCALATED");
  w.caseAction(id, "RETRY");
  assert.notEqual(w.state.cases[id].state, "ESCALATED");
  w.caseAction(id, "CANCEL");
  assert.equal(w.state.cases[id].state, "CANCELLED");
  assert.ok(
    w.state.audit.filter((event) => event.actor === "OPERATOR").length >= 3,
  );
  assert.equal(
    w.caseActionsFor(id).CANCEL.enabled,
    false,
    "a finished case allows no actions",
  );
});

test("the safety clearance panel says in words that the vehicle interlocks are simulated, not read from a real vehicle", () => {
  const html = casePage(withCase(), "CASE-1234ABCD", caseActions);
  assert.match(html, /interlocks are simulated/i);
  assert.doesNotMatch(html, /From the bus</);
});
