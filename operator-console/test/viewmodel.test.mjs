import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reduce, setAudit } from "../src/state.js";
import {
  busCategories,
  busIds,
  classify,
  describe,
  filterAudit,
  helpAlerts,
  stopCodes,
  stopStatus,
  stopView,
  summary,
  zoneView,
} from "../src/viewmodel.js";

const T = "2026-09-30T00:00:00.000Z";
const STOP = "18331";
const B1 = "AV-095-01";
const B2 = "AV-095-02";

const status = (busId, movement, simulated = true) => ({
  type: "BUS_STATUS",
  status: {
    busId,
    busService: "95",
    stopCode: STOP,
    movement,
    simulated,
    observedAt: T,
  },
  timestamp: T,
});
const bay = (occupantBusId, waitingBusIds = [], grantedBusId = null) => ({
  type: "BAY_STATUS",
  bay: {
    stopCode: STOP,
    bayId: "BAY-1",
    occupantBusId,
    waitingBusIds,
    grantedBusId,
    updatedAt: T,
  },
  timestamp: T,
});
const decision = (over = {}) => ({
  type: "RAMP_SAFETY",
  decision: {
    busId: B1,
    zoneState: "CLEAR",
    permission: "CONTINUE",
    reasons: [],
    tof: { state: "BEAM_CLEAR", distanceMm: 500, simulated: true },
    camera: { imageOk: true },
    objectsInZone: [],
    simulated: true,
    observedAt: T,
    ...over,
  },
  timestamp: T,
});
const world = (...messages) => messages.reduce(reduce, initialState());

test("buses and stops are listed from what has been reported, sorted", () => {
  const state = world(
    status(B2, "WAITING_FOR_BAY"),
    status(B1, "POSITIONED_AT_STOP"),
    bay(B1, [B2]),
  );
  assert.deepEqual(busIds(state), [B1, B2]);
  assert.deepEqual(stopCodes(state), [STOP]);
});

test("where a bus is, in words", () => {
  const cases = [
    [
      world(status(B1, "POSITIONED_AT_STOP"), bay(B1)),
      B1,
      "In the bay, at boarding position",
      "ok",
    ],
    [
      world(status(B2, "WAITING_FOR_BAY"), bay(B1, [B2])),
      B2,
      `Waiting for ${B1} to leave the bay`,
      "warn",
    ],
    [
      world(status(B2, "WAITING_FOR_BAY"), bay(null, [B2])),
      B2,
      "Waiting for bay; the bay is free, awaiting the controller",
      "warn",
    ],
    [
      world(status(B2, "WAITING_FOR_BAY"), bay(null, [], B2)),
      B2,
      "Cleared to enter the bay",
      "info",
    ],
    [world(status(B1, "DEPARTING")), B1, "Departing the stop", "idle"],
    [
      world(status(B1, "TRAVELLING_TO_STOP")),
      B1,
      "Travelling to this stop",
      "info",
    ],
    [initialState(), B1, "No report yet", "idle"],
  ];
  for (const [state, busId, text, kind] of cases) {
    assert.deepEqual(stopStatus(state, busId), { text, kind }, text);
  }
});

test("a bus has four separate status categories, and simulated things are marked", () => {
  const state = world(
    status(B2, "POSITIONED_AT_STOP", true),
    decision({ busId: B2 }),
  );
  const cats = busCategories(state, B2);
  assert.deepEqual(
    cats.map((c) => c.title),
    ["Bus movement", "Assistance request", "Ramp", "Sensors and faults"],
  );
  assert.equal(cats[2].simulated, true);
  assert.equal(cats[0].value, "Positioned at stop");
  assert.equal(cats[3].value, "Continue");
  assert.equal(cats[1].value, "None");
});

test("the request category shows an acknowledged request for this bus", () => {
  const state = world(status(B1, "POSITIONED_AT_STOP"), {
    type: "REQUEST_STATUS",
    requestId: "REQ-1",
    status: "ACKNOWLEDGED",
    busId: B1,
    busService: "95",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    timestamp: T,
  });
  const cats = busCategories(state, B1);
  assert.equal(cats[1].value, "Accepted");
  assert.match(cats[1].sub, /REQ-1/);
});

test("a halt shows its reasons in words, and the kind is stop", () => {
  const state = world(
    status(B1, "POSITIONED_AT_STOP"),
    decision({
      permission: "HALT",
      zoneState: "OCCUPIED",
      reasons: ["OBJECT_IN_ZONE", "TOF_BLOCKED"],
    }),
  );
  const sensors = busCategories(state, B1)[3];
  assert.equal(sensors.value, "Halt");
  assert.equal(sensors.kind, "stop");
  assert.match(sensors.sub, /Object in the ramp zone/);
  assert.match(sensors.sub, /ToF beam blocked/);
});

test("a stop lists its buses with status and request, and knows if the queue can proceed", () => {
  const state = world(
    status(B1, "DEPARTING"),
    status(B2, "WAITING_FOR_BAY"),
    bay(null, [B2]),
  );
  const view = stopView(state, STOP);
  assert.equal(view.rows.length, 2);
  assert.equal(view.canProceed, true);
  const busy = stopView(
    world(
      status(B1, "POSITIONED_AT_STOP"),
      status(B2, "WAITING_FOR_BAY"),
      bay(B1, [B2]),
    ),
    STOP,
  );
  assert.equal(busy.canProceed, false);
  assert.equal(stopView(initialState(), STOP).canProceed, false);
});

test("the summary counts stops, buses, open requests and fault entries", () => {
  let state = world(
    status(B1, "POSITIONED_AT_STOP"),
    bay(B1),
    {
      type: "REQUEST_STATUS",
      requestId: "REQ-1",
      status: "SENDING",
      busId: B1,
      timestamp: T,
    },
    {
      type: "REQUEST_STATUS",
      requestId: "REQ-2",
      status: "CANCELLED",
      busId: B1,
      timestamp: T,
    },
  );
  state = setAudit(state, [
    {
      eventId: "1",
      eventType: "RAMP_SAFETY_CHANGED",
      actor: "VEHICLE",
      timestamp: T,
      detail: { permission: "HALT" },
    },
    { eventId: "2", eventType: "BAY_CHANGED", actor: "VEHICLE", timestamp: T },
  ]);
  assert.deepEqual(summary(state), {
    stops: 1,
    buses: 1,
    openRequests: 1,
    faultEntries: 1,
  });
});

test("help alerts list buses that need help, with words", () => {
  const state = world(status(B1, "POSITIONED_AT_STOP"), {
    type: "HELP_REQUIRED",
    help: {
      busId: B1,
      reason: "DEPLOYMENT_TIMEOUT",
      state: "DEPLOYING",
      observedAt: T,
    },
    timestamp: T,
  });
  const [alert] = helpAlerts(state);
  assert.equal(alert.busId, B1);
  assert.match(alert.text, /Deployment timed out/);
  assert.match(alert.text, /deploying/);
});

test("the zone view is drawn from the Pi's decision, never from a camera image", () => {
  const view = zoneView({
    zoneState: "OCCUPIED",
    permission: "HALT",
    reasons: ["OBJECT_IN_ZONE"],
    tof: { state: "BLOCKED", distanceMm: 340, simulated: true },
    camera: { imageOk: true },
    objectsInZone: [
      { className: "person", safety: "UNSAFE", confidence: 0.93 },
    ],
    simulated: true,
  });
  assert.equal(view.zone, "Occupied");
  assert.equal(view.permission, "Halt");
  assert.equal(view.tof, "Blocked · 340 mm");
  assert.deepEqual(view.objects, [
    { label: "Person", safety: "Unsafe", confidence: "93%" },
  ]);
  assert.equal(view.simulated, true);
  assert.equal(zoneView(undefined), undefined);
});

test("audit events are grouped into kinds an operator can filter by", () => {
  const cases = [
    [{ eventType: "OPERATOR_ACTION", actor: "OPERATOR" }, "OPERATOR"],
    [{ eventType: "BAY_ENTRY_GRANTED", actor: "OPERATOR" }, "OPERATOR"],
    [
      {
        eventType: "RAMP_SAFETY_CHANGED",
        actor: "VEHICLE",
        detail: { permission: "HALT" },
      },
      "FAULT",
    ],
    [
      {
        eventType: "RAMP_SAFETY_CHANGED",
        actor: "VEHICLE",
        detail: { permission: "CONTINUE" },
      },
      "EVENT",
    ],
    [{ eventType: "HELP_REQUIRED_CHANGED", actor: "VEHICLE" }, "FAULT"],
    [
      {
        eventType: "RAMP_SIMULATION_CHANGED",
        actor: "VEHICLE",
        detail: { state: "HALTED" },
      },
      "FAULT",
    ],
    [
      { eventType: "ASSISTANCE_COMPLETED_RAMP_STOWED", actor: "ORCHESTRATOR" },
      "CONFIRMED",
    ],
    [{ eventType: "REQUEST_ACKNOWLEDGED", actor: "VEHICLE" }, "CONFIRMED"],
    [{ eventType: "BUS_STATUS_CHANGED", actor: "VEHICLE" }, "EVENT"],
  ];
  for (const [event, kind] of cases)
    assert.equal(classify(event), kind, event.eventType);
});

test("audit events read as sentences, and unknown types stay readable", () => {
  assert.equal(
    describe({
      eventType: "BUS_STATUS_CHANGED",
      busId: B1,
      detail: { from: "TRAVELLING_TO_STOP", to: "POSITIONED_AT_STOP" },
    }),
    "Movement: Travelling to stop to Positioned at stop",
  );
  assert.match(
    describe({ eventType: "BAY_ENTRY_GRANTED", busId: B2 }),
    /entry granted/i,
  );
  assert.match(
    describe({
      eventType: "RAMP_SAFETY_CHANGED",
      detail: { permission: "HALT", reasons: ["TOF_BLOCKED"] },
    }),
    /Halt.*ToF beam blocked/,
  );
  assert.match(
    describe({
      eventType: "RAMP_SIMULATION_CHANGED",
      detail: { state: "DEPLOYED" },
    }),
    /Deployed/,
  );
  assert.equal(
    describe({ eventType: "SOMETHING_NEW_HAPPENED" }),
    "Something new happened",
  );
});

test("audit filtering by kind, bus and request", () => {
  const state = setAudit(
    world({
      type: "REQUEST_STATUS",
      requestId: "REQ-1",
      status: "SENDING",
      busId: B1,
      timestamp: T,
    }),
    [
      {
        eventId: "1",
        eventType: "BUS_STATUS_CHANGED",
        actor: "VEHICLE",
        busId: B1,
        timestamp: "2026-09-30T00:00:01.000Z",
      },
      {
        eventId: "2",
        eventType: "BAY_ENTRY_GRANTED",
        actor: "OPERATOR",
        busId: B2,
        timestamp: "2026-09-30T00:00:02.000Z",
      },
      {
        eventId: "3",
        eventType: "X",
        actor: "VEHICLE",
        caseId: "CASE-1",
        timestamp: "2026-09-30T00:00:03.000Z",
      },
    ],
  );
  state.requests["REQ-1"].caseId = "CASE-1";
  assert.deepEqual(
    filterAudit(state, { kind: "ALL", busId: "ALL", requestId: "ALL" }).map(
      (e) => e.eventId,
    ),
    ["3", "2", "1"],
  );
  assert.deepEqual(
    filterAudit(state, {
      kind: "OPERATOR",
      busId: "ALL",
      requestId: "ALL",
    }).map((e) => e.eventId),
    ["2"],
  );
  assert.deepEqual(
    filterAudit(state, { kind: "ALL", busId: B1, requestId: "ALL" }).map(
      (e) => e.eventId,
    ),
    ["1"],
  );
  assert.deepEqual(
    filterAudit(state, { kind: "ALL", busId: "ALL", requestId: "REQ-1" }).map(
      (e) => e.eventId,
    ),
    ["3"],
  );
});
