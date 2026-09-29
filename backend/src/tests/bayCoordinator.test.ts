import test from "node:test";
import assert from "node:assert/strict";
import type { BayStatus, BusMovementState, BusStatus } from "@buspass/shared";
import {
  applyBusReport,
  emptyBay,
  grantNext,
} from "../busOperations/bayCoordinator";

const STOP = "18331";
const NOW = "2026-09-30T00:00:00.000Z";

function report(busId: string, movement: BusMovementState): BusStatus {
  return {
    busId,
    busService: "95",
    stopCode: STOP,
    movement,
    simulated: true,
    observedAt: NOW,
  };
}

function apply(bay: BayStatus, busId: string, movement: BusMovementState) {
  const result = applyBusReport(bay, report(busId, movement), NOW);
  assert.ok(result.accepted, `${busId} ${movement} should be accepted`);
  return result.bay;
}

test("an empty bay has no occupant, queue or grant", () => {
  const bay = emptyBay(STOP, NOW);
  assert.equal(bay.stopCode, STOP);
  assert.equal(bay.occupantBusId, null);
  assert.deepEqual(bay.waitingBusIds, []);
  assert.equal(bay.grantedBusId, null);
});

test("a bus becomes the occupant only by reporting it is positioned", () => {
  let bay = emptyBay(STOP, NOW);
  bay = apply(bay, "B1", "TRAVELLING_TO_STOP");
  assert.equal(bay.occupantBusId, null);
  bay = apply(bay, "B1", "POSITIONED_AT_STOP");
  assert.equal(bay.occupantBusId, "B1");
});

test("a bus arriving at an occupied bay waits in first-in-first-out order", () => {
  let bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  bay = apply(bay, "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "WAITING_FOR_BAY");
  bay = apply(bay, "B2", "WAITING_FOR_BAY");
  assert.deepEqual(bay.waitingBusIds, ["B2", "B3"]);
  assert.equal(bay.occupantBusId, "B1");
});

test("a bus cannot position itself into an occupied bay", () => {
  const bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  const refused = applyBusReport(bay, report("B2", "POSITIONED_AT_STOP"), NOW);
  assert.equal(refused.accepted, false);
});

test("the occupant repeating its report changes nothing", () => {
  const bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  const again = applyBusReport(bay, report("B1", "POSITIONED_AT_STOP"), NOW);
  assert.ok(again.accepted);
  assert.equal(again.changed, false);
});

test("departure releases the bay but never grants or deploys for the next bus", () => {
  let bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  bay = apply(bay, "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B1", "DEPARTING");
  assert.equal(bay.occupantBusId, null);
  assert.equal(bay.grantedBusId, null);
  assert.deepEqual(bay.waitingBusIds, ["B2"]);
});

test("a waiting bus cannot enter a free bay until the controller grants it", () => {
  let bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  bay = apply(bay, "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B1", "DEPARTING");
  const refused = applyBusReport(bay, report("B2", "POSITIONED_AT_STOP"), NOW);
  assert.equal(refused.accepted, false);
});

test("a grant goes to the first waiting bus and only when the bay is free", () => {
  let bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  bay = apply(bay, "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "WAITING_FOR_BAY");
  const early = grantNext(bay, NOW);
  assert.equal(early.granted, false);

  bay = apply(bay, "B1", "DEPARTING");
  const result = grantNext(bay, NOW);
  assert.ok(result.granted);
  assert.equal(result.bay.grantedBusId, "B2");
  assert.deepEqual(result.bay.waitingBusIds, ["B3"]);
});

test("a second grant is refused while one is outstanding, and with nobody waiting", () => {
  let bay = apply(emptyBay(STOP, NOW), "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "WAITING_FOR_BAY");
  const first = grantNext(bay, NOW);
  assert.ok(first.granted);
  assert.equal(grantNext(first.bay, NOW).granted, false);
  assert.equal(grantNext(emptyBay(STOP, NOW), NOW).granted, false);
});

test("the granted bus enters by its own positioned report, and a later bus cannot jump the queue", () => {
  let bay = apply(emptyBay(STOP, NOW), "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "WAITING_FOR_BAY");
  const granted = grantNext(bay, NOW);
  assert.ok(granted.granted);
  const jump = applyBusReport(
    granted.bay,
    report("B3", "POSITIONED_AT_STOP"),
    NOW,
  );
  assert.equal(jump.accepted, false);
  const entered = apply(granted.bay, "B2", "POSITIONED_AT_STOP");
  assert.equal(entered.occupantBusId, "B2");
  assert.equal(entered.grantedBusId, null);
  assert.deepEqual(entered.waitingBusIds, ["B3"]);
});

test("a waiting bus that drives away leaves the queue, and a granted one loses its grant", () => {
  let bay = apply(emptyBay(STOP, NOW), "B2", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "WAITING_FOR_BAY");
  bay = apply(bay, "B3", "TRAVELLING_TO_STOP");
  assert.deepEqual(bay.waitingBusIds, ["B2"]);
  const granted = grantNext(bay, NOW);
  assert.ok(granted.granted);
  const revoked = apply(granted.bay, "B2", "TRAVELLING_TO_STOP");
  assert.equal(revoked.grantedBusId, null);
});

test("a free bay with nobody waiting lets an arriving bus position itself", () => {
  const bay = apply(emptyBay(STOP, NOW), "B1", "POSITIONED_AT_STOP");
  assert.equal(bay.occupantBusId, "B1");
});
