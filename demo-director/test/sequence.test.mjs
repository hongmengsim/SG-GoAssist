import assert from "node:assert/strict";
import test from "node:test";

import { advanceSteps, describeSteps } from "../src/sequence.js";

const config = { stopCode: "18331" };

function agent({ movement, ramp = "STOWED", reasons = [] }) {
  return {
    movement: { code: movement },
    ramp: { state: ramp },
    decision: { reasons: reasons.map((code) => ({ code })) },
  };
}

function stateOf({ bay = {}, requests = [], bus1 = {}, bus2 = {} }) {
  return {
    order: ["AV-1", "AV-2"],
    buses: {
      "AV-1": {
        kind: "REAL",
        agent: agent({ movement: "TRAVELLING", ...bus1 }),
      },
      "AV-2": {
        kind: "SIMULATED",
        agent: agent({ movement: "TRAVELLING", ...bus2 }),
      },
    },
    backend: { bay, requests },
  };
}

test("a step that has latched keeps the detail from the moment it latched, not the current state", () => {
  const latched = new Set();
  const details = new Map();
  advanceSteps(stateOf({ bay: { occupantBusId: "AV-1" } }), latched, details);
  assert.ok(latched.has(1));

  // later the system moves on: Bus 1 has left and Bus 2 is in the bay
  const later = stateOf({ bay: { occupantBusId: "AV-2" } });
  const steps = describeSteps(later, config, latched, details);
  assert.equal(steps[0].done, true);
  assert.equal(steps[0].detail, "bay occupant: AV-1");
});

test("a step that has not latched shows the current state", () => {
  const state = stateOf({ bay: { occupantBusId: "AV-2" } });
  const steps = describeSteps(state, config, new Set(), new Map());
  assert.equal(steps[0].done, false);
  assert.equal(steps[0].detail, "bay occupant: AV-2");
});

test("step 3 reads the newest open request of Bus 2, not the oldest", () => {
  const waiting = { movement: "WAITING_FOR_BAY", reasons: ["WAITING_FOR_BAY"] };
  const old = {
    busId: "AV-2",
    status: "ACKNOWLEDGED",
    createdAt: "2026-10-06T09:00:00.000Z",
  };
  const stillSending = {
    busId: "AV-2",
    status: "SENDING",
    createdAt: "2026-10-06T10:00:00.000Z",
  };
  const confirmed = { ...stillSending, status: "ACKNOWLEDGED" };
  for (const order of [
    [old, stillSending],
    [stillSending, old],
  ]) {
    const state = stateOf({
      bay: { occupantBusId: "AV-1", waitingBusIds: ["AV-2"] },
      requests: order,
      bus2: waiting,
    });
    assert.equal(
      describeSteps(
        state,
        config,
        new Set([1, 2]),
        new Map(),
      )[2].detail.startsWith("request SENDING"),
      true,
    );
    assert.equal(
      advanceStep3(state),
      false,
      "the new request is not confirmed yet",
    );
  }
  const state = stateOf({
    bay: { occupantBusId: "AV-1", waitingBusIds: ["AV-2"] },
    requests: [old, confirmed],
    bus2: waiting,
  });
  assert.equal(advanceStep3(state), true);
});

function advanceStep3(state) {
  const latched = new Set([1, 2]);
  advanceSteps(state, latched, new Map());
  return latched.has(3);
}
