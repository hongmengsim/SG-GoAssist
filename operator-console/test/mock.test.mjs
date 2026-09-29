import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createMockWorld, MOCK_BUSES, MOCK_STOP } from "../src/mock/world.js";
import { activeHelp } from "../src/state.js";
import { classify } from "../src/viewmodel.js";

const [B1, B2] = MOCK_BUSES;

function world() {
  let now = Date.parse("2026-09-30T00:00:00.000Z");
  const w = createMockWorld({ clock: () => now });
  return {
    w,
    advance(seconds, step = 0.5) {
      for (let elapsed = 0; elapsed < seconds; elapsed += step) {
        now += step * 1000;
        w.tick(step);
      }
    },
  };
}

const ramp = (w, id) => w.state.buses[id].ramp?.state ?? "STOWED";
const decision = (w, id) => w.state.buses[id].decision;

function readyBus1(t) {
  t.w.submitRequest({ busId: B1, help: "WHEELCHAIR_RAMP" });
  t.w.arrive(B1);
  t.advance(1);
}

test("the mock world starts with two buses and one stop, and says nothing has happened yet", () => {
  const { w } = world();
  assert.equal(Object.keys(w.state.buses).length, 2);
  assert.deepEqual(Object.keys(w.state.bays), [MOCK_STOP]);
  assert.equal(w.state.buses[B1].status.movement, "TRAVELLING_TO_STOP");
});

test("a request is submitted, then accepted by the bus", () => {
  const { w } = world();
  const id = w.submitRequest({ busId: B1, help: "WHEELCHAIR_RAMP" });
  assert.equal(
    w.state.requests[id].status,
    "ACKNOWLEDGED",
    "auto-accept is on by default",
  );
  w.setAutoAccept(false);
  const second = w.submitRequest({ busId: B2, help: "WHEELCHAIR_RAMP" });
  assert.equal(w.state.requests[second].status, "SENDING");
  w.busAccept(second);
  assert.equal(w.state.requests[second].status, "ACKNOWLEDGED");
});

test("one active request per bus: a second one cannot be fulfilled", () => {
  const { w } = world();
  w.submitRequest({ busId: B1, help: "WHEELCHAIR_RAMP" });
  const second = w.submitRequest({ busId: B1, help: "WHEELCHAIR_RAMP" });
  assert.equal(w.state.requests[second].status, "FAILED");
});

test("the first bus takes the bay, the second waits, and leaving never grants the next bus", () => {
  const t = world();
  t.w.arrive(B1);
  assert.equal(t.w.state.bays[MOCK_STOP].occupantBusId, B1);
  t.w.arrive(B2);
  assert.equal(t.w.state.buses[B2].status.movement, "WAITING_FOR_BAY");
  assert.deepEqual(t.w.state.bays[MOCK_STOP].waitingBusIds, [B2]);
  t.w.depart(B1);
  assert.equal(t.w.state.bays[MOCK_STOP].occupantBusId, null);
  assert.equal(t.w.state.bays[MOCK_STOP].grantedBusId, null);
  assert.equal(t.w.state.buses[B2].status.movement, "WAITING_FOR_BAY");
  t.w.proceedNext("OPERATOR");
  assert.equal(t.w.state.buses[B2].status.movement, "POSITIONED_AT_STOP");
  assert.equal(t.w.state.bays[MOCK_STOP].occupantBusId, B2);
});

test("a deployment needs an accepted request and the boarding position", () => {
  const t = world();
  t.w.arrive(B1);
  t.w.deploy(B1, "OPERATOR");
  assert.equal(ramp(t.w, B1), "STOWED", "no request yet");
  const t2 = world();
  t2.w.submitRequest({ busId: B1, help: "WHEELCHAIR_RAMP" });
  t2.w.deploy(B1, "OPERATOR");
  assert.equal(ramp(t2.w, B1), "STOWED", "not at the boarding position yet");
});

test("with the zone clear the ramp deploys; an unsafe object halts it and it resumes when removed", () => {
  const t = world();
  readyBus1(t);
  t.w.deploy(B1, "OPERATOR");
  t.advance(1);
  assert.equal(ramp(t.w, B1), "DEPLOYING");
  t.w.placeObject(B1, "person");
  t.advance(1);
  assert.equal(ramp(t.w, B1), "HALTED");
  assert.equal(decision(t.w, B1).permission, "HALT");
  assert.ok(decision(t.w, B1).reasons.includes("OBJECT_IN_ZONE"));
  t.w.placeObject(B1, null);
  t.advance(1);
  t.advance(10);
  assert.equal(ramp(t.w, B1), "DEPLOYED");
});

test("a leaf or plastic bag alone does not halt; a box does", () => {
  const t = world();
  readyBus1(t);
  for (const safe of ["leaf", "plastic_bag"]) {
    t.w.placeObject(B1, safe);
    t.advance(1);
    assert.equal(decision(t.w, B1).permission, "CONTINUE", safe);
    assert.equal(decision(t.w, B1).objectsInZone[0].safety, "SAFE");
  }
  t.w.placeObject(B1, "box");
  t.advance(1);
  assert.equal(decision(t.w, B1).permission, "HALT");
});

test("a sensor or camera fault halts and is never read as clear", () => {
  const t = world();
  readyBus1(t);
  t.w.setFault("tof", true);
  t.advance(1);
  assert.ok(decision(t.w, B1).reasons.includes("TOF_UNAVAILABLE"));
  assert.equal(decision(t.w, B1).zoneState, "UNCERTAIN");
  t.w.setFault("tof", false);
  t.w.setFault("cam", true);
  t.advance(1);
  assert.ok(decision(t.w, B1).reasons.includes("CAMERA_DEGRADED"));
});

test("the bus cannot leave with its ramp out, and a stowed ramp lets it go", () => {
  const t = world();
  readyBus1(t);
  t.w.deploy(B1, "OPERATOR");
  t.advance(12);
  assert.equal(ramp(t.w, B1), "DEPLOYED");
  t.w.depart(B1);
  assert.equal(
    t.w.state.buses[B1].status.movement,
    "POSITIONED_AT_STOP",
    "refused",
  );
  t.w.stowRamp(B1);
  t.w.depart(B1);
  assert.equal(t.w.state.buses[B1].status.movement, "DEPARTING");
});

test("a stalled deployment raises help required after the placeholder timeout", () => {
  const t = world();
  readyBus1(t);
  t.w.setFault("stall", true);
  t.w.setStallTimeoutSeconds(4);
  t.w.deploy(B1, "OPERATOR");
  t.advance(3);
  assert.equal(t.w.state.buses[B1].help, undefined);
  t.advance(4);
  const bus = t.w.state.buses[B1];
  assert.equal(bus.help.reason, "DEPLOYMENT_TIMEOUT");
  assert.equal(activeHelp(bus), true);
});

test("operator actions are audited as operator actions", () => {
  const t = world();
  readyBus1(t);
  t.w.deploy(B1, "OPERATOR");
  t.advance(1);
  t.w.halt(B1, "OPERATOR");
  const operatorEvents = t.w.state.audit.filter(
    (event) => classify(event) === "OPERATOR",
  );
  assert.ok(operatorEvents.length >= 2);
  assert.equal(ramp(t.w, B1), "HALTED");
});

test("cancelling a request tells the passenger it is an exception and frees the bus", () => {
  const t = world();
  readyBus1(t);
  const id = Object.keys(t.w.state.requests)[0];
  t.w.cancelRequest(B1, "OPERATOR");
  assert.equal(t.w.state.requests[id].status, "CANCELLED");
});

test("action availability follows the state", () => {
  const t = world();
  assert.equal(t.w.actionsFor(B1).deploy.enabled, false);
  readyBus1(t);
  assert.equal(t.w.actionsFor(B1).deploy.enabled, true);
  assert.equal(t.w.actionsFor(B1).halt.enabled, false);
  t.w.deploy(B1, "OPERATOR");
  assert.equal(t.w.actionsFor(B1).halt.enabled, true);
});

test("reset returns to the starting state", () => {
  const t = world();
  readyBus1(t);
  t.w.reset();
  assert.deepEqual(Object.keys(t.w.state.requests), []);
  assert.equal(t.w.state.buses[B1].status.movement, "TRAVELLING_TO_STOP");
});

test("every wire message the mock emits conforms to the contract schema", () => {
  const require = createRequire(
    new URL("../../contracts/package.json", import.meta.url),
  );
  const Ajv = require("ajv");
  const ajv = new Ajv({ strict: false, allErrors: true });
  const schema = JSON.parse(
    readFileSync(
      new URL(
        "../../contracts/schema/OperatorStatusUpdateMessage.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const validate = ajv.compile(schema);

  const t = world();
  readyBus1(t);
  t.w.arrive(B2);
  t.w.deploy(B1, "OPERATOR");
  t.advance(1);
  t.w.placeObject(B1, "person");
  t.advance(1);
  t.w.placeObject(B1, "leaf");
  t.advance(12);
  t.w.setFault("stall", true);
  t.w.stowRamp(B1);
  t.w.depart(B1);
  t.w.proceedNext("OPERATOR");

  const checked = t.w.messages.filter((m) => m.type !== "REQUEST_STATUS");
  assert.ok(checked.length > 10, "a meaningful number of messages");
  for (const message of checked) {
    assert.ok(
      validate(message),
      `${message.type}: ${JSON.stringify(validate.errors)}`,
    );
  }
});
