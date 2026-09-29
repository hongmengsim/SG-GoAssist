import test from "node:test";
import assert from "node:assert/strict";
import {
  operatorTopicsFor,
  passengerTopicsFor,
  scopeKeysFor,
  topic,
} from "../events/topics";
import type { BusEvent } from "../events/types";

/** Test helper: builds only the fields the routing functions read. */
function event(value: object): BusEvent {
  return value as BusEvent;
}

test("topic builders use one naming scheme", () => {
  assert.equal(topic.request("R1"), "request:R1");
  assert.equal(topic.case("C1"), "case:C1");
  assert.equal(topic.bus("B1"), "bus:B1");
  assert.equal(topic.stop("S1"), "stop:S1");
  assert.equal(topic.operatorBus("B1"), "op:bus:B1");
  assert.equal(topic.operatorStop("S1"), "op:stop:S1");
});

test("passenger topics follow the ids the existing message carries", () => {
  const request = event({
    type: "REQUEST_STATUS",
    requestId: "R1",
    busId: "B1",
    status: "ACKNOWLEDGED",
  });
  assert.deepEqual(passengerTopicsFor(request).sort(), [
    "bus:B1",
    "request:R1",
  ]);
  const caseUpdate = event({
    type: "CASE_STATUS",
    caseId: "C1",
    busId: "B1",
    stopCode: "S1",
  });
  assert.deepEqual(passengerTopicsFor(caseUpdate).sort(), [
    "bus:B1",
    "case:C1",
  ]);
});

test("a stop topic is used only for stop vehicle presence", () => {
  const presence = event({
    type: "STOP_VEHICLE_PRESENCE",
    stopCode: "S1",
    vehicle: { busId: "B1" },
  });
  assert.deepEqual(passengerTopicsFor(presence), ["stop:S1"]);
  const caseUpdate = event({
    type: "CASE_STATUS",
    caseId: "C1",
    stopCode: "S1",
  });
  assert.ok(!passengerTopicsFor(caseUpdate).includes("stop:S1"));
});

test("a field that is missing or undefined produces no passenger topic", () => {
  const noBus = event({
    type: "CASE_STATUS",
    caseId: "C1",
    busId: undefined,
    stopCode: "S1",
  });
  assert.deepEqual(passengerTopicsFor(noBus), ["case:C1"]);
});

test("operator-only messages produce no passenger topics, even though they name a bus", () => {
  for (const message of [
    event({ type: "BUS_STATUS", status: { busId: "B1", stopCode: "S1" } }),
    event({
      type: "BAY_STATUS",
      bay: {
        stopCode: "S1",
        occupantBusId: "B1",
        waitingBusIds: [],
        grantedBusId: null,
      },
    }),
    event({ type: "RAMP_SIMULATION", ramp: { busId: "B1" } }),
    event({ type: "RAMP_SAFETY", decision: { busId: "B1" } }),
    event({ type: "HELP_REQUIRED", help: { busId: "B1" } }),
  ]) {
    assert.deepEqual(passengerTopicsFor(message), [], message.type);
  }
});

test("scope keys find the bus and stop wherever the message keeps them", () => {
  const cases: Array<[BusEvent, string[], string[]]> = [
    [event({ type: "REQUEST_STATUS", busId: "B1" }), ["B1"], []],
    [
      event({ type: "CASE_STATUS", busId: "B1", stopCode: "S1" }),
      ["B1"],
      ["S1"],
    ],
    [
      event({ type: "BUS_STATUS", status: { busId: "B2", stopCode: "S2" } }),
      ["B2"],
      ["S2"],
    ],
    [event({ type: "RAMP_SIMULATION", ramp: { busId: "B3" } }), ["B3"], []],
    [event({ type: "RAMP_SAFETY", decision: { busId: "B4" } }), ["B4"], []],
    [event({ type: "HELP_REQUIRED", help: { busId: "B5" } }), ["B5"], []],
    [
      event({
        type: "SAFETY_TELEMETRY",
        busId: "B6",
        stopCode: "S6",
        telemetry: { busId: "B6", stopCode: "S6" },
      }),
      ["B6"],
      ["S6"],
    ],
    [
      event({
        type: "STOP_VEHICLE_PRESENCE",
        stopCode: "S7",
        vehicle: { busId: "B7", stopCode: "S7" },
      }),
      ["B7"],
      ["S7"],
    ],
  ];
  for (const [message, buses, stops] of cases) {
    const keys = scopeKeysFor(message);
    assert.deepEqual([...keys.busIds].sort(), buses, `${message.type} buses`);
    assert.deepEqual(
      [...keys.stopCodes].sort(),
      stops,
      `${message.type} stops`,
    );
  }
});

test("a bay message is in scope for every bus involved in the bay", () => {
  const bay = event({
    type: "BAY_STATUS",
    bay: {
      stopCode: "S1",
      occupantBusId: "B1",
      waitingBusIds: ["B2", "B3"],
      grantedBusId: "B2",
    },
  });
  const keys = scopeKeysFor(bay);
  assert.deepEqual([...keys.busIds].sort(), ["B1", "B2", "B3"]);
  assert.deepEqual([...keys.stopCodes], ["S1"]);
});

test("operator topics are derived from the scope keys", () => {
  const message = event({
    type: "CASE_STATUS",
    caseId: "C1",
    busId: "B1",
    stopCode: "S1",
  });
  assert.deepEqual(operatorTopicsFor(message).sort(), [
    "op:bus:B1",
    "op:stop:S1",
  ]);
  assert.deepEqual(operatorTopicsFor(event({ type: "DEVICE_HEALTH" })), []);
});
