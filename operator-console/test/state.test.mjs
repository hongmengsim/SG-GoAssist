import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AUDIT,
  activeHelp,
  addAudit,
  initialState,
  reduce,
  setAudit,
} from "../src/state.js";

const T1 = "2026-09-30T00:00:01.000Z";
const T2 = "2026-09-30T00:00:02.000Z";
const T3 = "2026-09-30T00:00:03.000Z";

const busStatus = (movement, observedAt = T1, busId = "AV-095-01") => ({
  type: "BUS_STATUS",
  status: {
    busId,
    busService: "95",
    stopCode: "18331",
    movement,
    simulated: true,
    observedAt,
  },
  timestamp: observedAt,
});

test("the initial state is empty", () => {
  const state = initialState();
  assert.deepEqual(state.buses, {});
  assert.deepEqual(state.bays, {});
  assert.deepEqual(state.requests, {});
  assert.deepEqual(state.audit, []);
});

test("bus status is stored per bus and an older report is ignored", () => {
  let state = reduce(initialState(), busStatus("POSITIONED_AT_STOP", T2));
  state = reduce(state, busStatus("TRAVELLING_TO_STOP", T1));
  assert.equal(state.buses["AV-095-01"].status.movement, "POSITIONED_AT_STOP");
  state = reduce(state, busStatus("DEPARTING", T3));
  assert.equal(state.buses["AV-095-01"].status.movement, "DEPARTING");
});

test("reducing never changes the state it was given", () => {
  const before = initialState();
  const snapshot = JSON.stringify(before);
  reduce(before, busStatus("DEPARTING"));
  assert.equal(JSON.stringify(before), snapshot);
});

test("bay, ramp, decision and help are stored where the console looks for them", () => {
  let state = initialState();
  state = reduce(state, {
    type: "BAY_STATUS",
    bay: {
      stopCode: "18331",
      bayId: "BAY-1",
      occupantBusId: "AV-095-01",
      waitingBusIds: [],
      grantedBusId: null,
      updatedAt: T1,
    },
    timestamp: T1,
  });
  state = reduce(state, {
    type: "RAMP_SIMULATION",
    ramp: {
      busId: "AV-095-01",
      state: "DEPLOYING",
      simulated: true,
      observedAt: T1,
    },
    timestamp: T1,
  });
  state = reduce(state, {
    type: "RAMP_SAFETY",
    decision: {
      busId: "AV-095-01",
      zoneState: "CLEAR",
      permission: "CONTINUE",
      reasons: [],
      tof: { state: "BEAM_CLEAR", simulated: true },
      camera: { imageOk: true },
      objectsInZone: [],
      simulated: true,
      observedAt: T1,
    },
    timestamp: T1,
  });
  state = reduce(state, {
    type: "HELP_REQUIRED",
    help: {
      busId: "AV-095-01",
      reason: "DEPLOYMENT_TIMEOUT",
      state: "DEPLOYING",
      observedAt: T1,
    },
    timestamp: T1,
  });
  assert.equal(state.bays["18331"].occupantBusId, "AV-095-01");
  assert.equal(state.buses["AV-095-01"].ramp.state, "DEPLOYING");
  assert.equal(state.buses["AV-095-01"].decision.permission, "CONTINUE");
  assert.equal(state.buses["AV-095-01"].help.reason, "DEPLOYMENT_TIMEOUT");
});

test("a request is tracked from its push and its status updates, without passenger identity", () => {
  let state = reduce(initialState(), {
    type: "ASSIST_REQUESTED",
    request: {
      requestId: "REQ-1",
      busId: "AV-095-01",
      busService: "95",
      boardingStop: "18301",
      stopCode: "18331",
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      boardingOrAlighting: "BOARDING",
      createdAt: T1,
    },
    timestamp: T1,
  });
  assert.equal(state.requests["REQ-1"].status, "SENDING");
  state = reduce(state, {
    type: "REQUEST_STATUS",
    requestId: "REQ-1",
    status: "ACKNOWLEDGED",
    busId: "AV-095-01",
    busService: "95",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
    sessionId: "secret",
    timestamp: T2,
  });
  assert.equal(state.requests["REQ-1"].status, "ACKNOWLEDGED");
  assert.equal("sessionId" in state.requests["REQ-1"], false);
  assert.equal(
    state.requests["REQ-1"].stopCode,
    "18331",
    "earlier details are kept",
  );
});

test("a request status for an unseen request creates it", () => {
  const state = reduce(initialState(), {
    type: "REQUEST_STATUS",
    requestId: "REQ-9",
    status: "SENDING",
    busId: "AV-095-02",
    busService: "95",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
    timestamp: T1,
  });
  assert.equal(state.requests["REQ-9"].busId, "AV-095-02");
});

test("unknown and malformed messages are ignored, not thrown on", () => {
  const state = initialState();
  for (const message of [
    null,
    undefined,
    5,
    "x",
    {},
    { type: "NOPE" },
    { type: "BUS_STATUS" },
    { type: "BAY_STATUS", bay: {} },
    { type: "RAMP_SIMULATION", ramp: null },
  ]) {
    assert.deepEqual(reduce(state, message), state, JSON.stringify(message));
  }
});

test("help is active only while the bus is still in the state it asked for help in", () => {
  const help = {
    busId: "B",
    reason: "DEPLOYMENT_TIMEOUT",
    state: "DEPLOYING",
    observedAt: T2,
  };
  assert.equal(activeHelp({ help, ramp: undefined }), true);
  assert.equal(
    activeHelp({ help, ramp: { state: "DEPLOYING", observedAt: T3 } }),
    true,
  );
  assert.equal(
    activeHelp({ help, ramp: { state: "DEPLOYED", observedAt: T3 } }),
    false,
    "moved on after the help request",
  );
  assert.equal(
    activeHelp({ help, ramp: { state: "STOWED", observedAt: T1 } }),
    true,
    "older ramp report does not clear it",
  );
  assert.equal(activeHelp({ ramp: { state: "DEPLOYING" } }), false);
});

test("audit events are kept newest first, without duplicates, and bounded", () => {
  const event = (n) => ({
    eventId: `E${n}`,
    eventType: "X",
    actor: "SYSTEM",
    timestamp: `2026-09-30T00:00:${String(n % 60).padStart(2, "0")}.000Z`,
  });
  let state = setAudit(initialState(), [event(1), event(2), event(3)]);
  assert.deepEqual(
    state.audit.map((e) => e.eventId),
    ["E3", "E2", "E1"],
  );
  state = addAudit(state, event(3));
  assert.equal(state.audit.length, 3, "same event id is not added twice");
  state = addAudit(state, { ...event(4), eventId: "E4" });
  assert.equal(state.audit[0].eventId, "E4");
  const many = Array.from({ length: MAX_AUDIT + 50 }, (_, index) => ({
    ...event(index),
    eventId: `M${index}`,
  }));
  assert.equal(setAudit(initialState(), many).audit.length, MAX_AUDIT);
});

test("a request listed by the backend keeps its case id and drops the passenger session", () => {
  const state = reduce(initialState(), {
    type: "REQUEST_SNAPSHOT",
    request: {
      requestId: "REQ-5",
      caseId: "CASE-5",
      sessionId: "secret",
      busId: "AV-095-01",
      boardingStop: "18301",
      stopCode: "18331",
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      status: "ACKNOWLEDGED",
      createdAt: T1,
    },
  });
  assert.equal(state.requests["REQ-5"].caseId, "CASE-5");
  assert.equal(state.requests["REQ-5"].status, "ACKNOWLEDGED");
  assert.equal("sessionId" in state.requests["REQ-5"], false);
});

// ---- C-M: request status never goes backwards, and never becomes undefined --------------------

test("a late SENDING never undoes ACKNOWLEDGED, and a finished request stays finished", () => {
  let state = reduce(initialState(), {
    type: "REQUEST_STATUS",
    requestId: "R1",
    status: "ACKNOWLEDGED",
  });
  state = reduce(state, { type: "REQUEST_STATUS", requestId: "R1", status: "SENDING" });
  assert.equal(state.requests.R1.status, "ACKNOWLEDGED");
  state = reduce(state, { type: "REQUEST_STATUS", requestId: "R1", status: "CANCELLED" });
  state = reduce(state, { type: "REQUEST_STATUS", requestId: "R1", status: "ACKNOWLEDGED" });
  assert.equal(state.requests.R1.status, "CANCELLED");
});

test("a status message with no status leaves the request as it was", () => {
  const start = reduce(initialState(), {
    type: "REQUEST_STATUS",
    requestId: "R2",
    status: "ACKNOWLEDGED",
  });
  const next = reduce(start, { type: "REQUEST_STATUS", requestId: "R2" });
  assert.equal(next.requests.R2.status, "ACKNOWLEDGED");
});

test("a snapshot that lists an older status does not undo a newer push", () => {
  let state = reduce(initialState(), {
    type: "REQUEST_STATUS",
    requestId: "R3",
    status: "ACKNOWLEDGED",
  });
  state = reduce(state, {
    type: "REQUEST_SNAPSHOT",
    request: { requestId: "R3", status: "SENDING" },
  });
  assert.equal(state.requests.R3.status, "ACKNOWLEDGED");
});
