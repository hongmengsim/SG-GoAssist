import test from "node:test";
import assert from "node:assert/strict";
import { createDirector, DirectorError } from "../src/director.js";
import { bayFree, directorConfig, fakeAgent, fakeBackend } from "./helpers.mjs";

async function setup() {
  const real = await fakeAgent({
    busId: "AV-1",
    code: "code-real-1111",
    simulated: false,
    controlLevel: "movement",
  });
  const simulated = await fakeAgent({
    busId: "AV-2",
    code: "code-sim-2222",
    simulated: true,
    controlLevel: "scene",
  });
  const backend = await fakeBackend({
    token: "operator-token",
    bay: bayFree(),
  });
  const config = directorConfig([real, simulated], backend.url);
  const director = createDirector({ config });
  await director.refresh();
  const close = async () => {
    director.stop();
    await Promise.all([real.close(), simulated.close(), backend.close()]);
  };
  return { director, real, simulated, backend, close, config };
}

test("every bus is labelled REAL or SIMULATED from what its own agent reports", async () => {
  const { director, close } = await setup();
  const state = director.snapshot();
  assert.equal(state.buses["AV-1"].kind, "REAL");
  assert.equal(state.buses["AV-2"].kind, "SIMULATED");
  assert.equal(state.buses["AV-1"].label, "BUS 1");
  await close();
});

test("the page data never carries an agent code or the operator token", async () => {
  const { director, close } = await setup();
  const text = JSON.stringify(director.snapshot());
  for (const secret of ["code-real-1111", "code-sim-2222", "operator-token"])
    assert.equal(text.includes(secret), false, secret);
  await close();
});

test("movement goes to a real bus", async () => {
  const { director, real, close } = await setup();
  await director.control("AV-1", { command: "arrive", value: "18331" });
  assert.deepEqual(real.calls, [{ command: "arrive", value: "18331" }]);
  await close();
});

test("scene changes are refused for a real bus without ever reaching its agent", async () => {
  const { director, real, close } = await setup();
  for (const body of [
    { command: "place", value: "person" },
    { command: "block", value: "on" },
    { command: "dropout", value: "on" },
    { command: "cover", value: "on" },
    { command: "clear" },
    { command: "link", value: "off" },
  ]) {
    await assert.rejects(
      director.control("AV-1", body),
      (error) =>
        error instanceof DirectorError &&
        error.status === 403 &&
        /REAL/.test(error.message),
      JSON.stringify(body),
    );
  }
  assert.deepEqual(real.calls, [], "the real agent was never contacted");
  await close();
});

test("a bus that offers only movement control is treated as real, whatever it claims", async () => {
  const { director, simulated, close } = await setup();
  simulated.agent.controlLevel = "movement";
  await director.refresh();
  await assert.rejects(
    director.control("AV-2", { command: "place", value: "person" }),
    /scene controls are refused/,
  );
  await close();
});

test("a simulated bus takes the scene commands, with a safe object's own confidence", async () => {
  const { director, simulated, close } = await setup();
  await director.control("AV-2", {
    command: "place",
    value: "leaf",
    confidence: 0.95,
  });
  await director.control("AV-2", { command: "block", value: "on" });
  await director.control("AV-2", { command: "link", value: "off" });
  assert.deepEqual(simulated.calls, [
    { command: "place", value: "leaf", confidence: 0.95 },
    { command: "block", value: "on" },
    { command: "link", value: "off" },
  ]);
  await close();
});

test("there is no way to set a ramp, acknowledge for a bus, or reach the agent local halt", async () => {
  const { director, real, simulated, close } = await setup();
  for (const command of [
    "ack",
    "acknowledge",
    "ramp",
    "state",
    "deploy",
    "halt",
    "calibrate",
    "assist-ack",
    "unknown",
  ]) {
    await assert.rejects(
      director.control("AV-2", { command, value: "on" }),
      (error) => error instanceof DirectorError && error.status === 400,
      command,
    );
  }
  assert.deepEqual([...real.calls, ...simulated.calls], []);
  await close();
});

test("bad values are refused before anything is sent", async () => {
  const { director, simulated, close } = await setup();
  await assert.rejects(
    director.control("AV-2", { command: "arrive" }),
    /stop code/,
  );
  await assert.rejects(
    director.control("AV-2", { command: "arrive", value: "../x" }),
    /stop code/,
  );
  await assert.rejects(
    director.control("AV-2", { command: "place", value: "Bad Class" }),
    /object class/,
  );
  await assert.rejects(
    director.control("AV-2", { command: "block", value: "maybe" }),
    /on or off/,
  );
  await assert.rejects(
    director.control("NOPE", { command: "depart" }),
    /Unknown bus/,
  );
  assert.deepEqual(simulated.calls, []);
  await close();
});

test("an unreachable agent is reported, not hidden", async () => {
  const { director, real, simulated, backend } = await setup();
  await simulated.close();
  await director.refresh();
  assert.equal(director.snapshot().buses["AV-2"].agentOk, false);
  await assert.rejects(
    director.control("AV-2", { command: "place", value: "person" }),
    (error) => error.status === 502,
  );
  director.stop();
  await Promise.all([real.close(), backend.close()]);
});

test("a request without a phone is a simulated passenger, created through the passenger route", async () => {
  const { director, backend, close } = await setup();
  await director.createRequest("AV-2");
  const sent = backend.bodies.find(
    (item) => item.url === "/api/assistance/request",
  );
  assert.equal(sent.body.busId, "AV-2");
  assert.equal(sent.body.source, "MOBILE_APP");
  assert.equal(sent.body.sessionId, "demo-director");
  assert.deepEqual(sent.body.assistanceTypes, ["WHEELCHAIR_RAMP"]);
  assert.ok(
    director
      .snapshot()
      .timeline.some((entry) => /SIMULATED passenger/.test(entry.source)),
  );
  await close();
});

test("the operator actions use the backend operator routes, and a cancel needs an open request with a case", async () => {
  const { director, backend, close } = await setup();
  await director.proceed();
  await director.halt("AV-1", true);
  await director.halt("AV-1", false);
  assert.ok(backend.paths.includes("POST /api/operations/bays/18331/proceed"));
  assert.deepEqual(
    backend.bodies
      .filter((item) => item.url.endsWith("/operator-halt"))
      .map((item) => item.body.halted),
    [true, false],
  );
  await assert.rejects(
    director.cancel("AV-1"),
    (error) => error.status === 409,
  );
  backend.state.requests = [
    {
      requestId: "REQ-9",
      busId: "AV-1",
      status: "ACKNOWLEDGED",
      caseId: "CASE-9",
    },
  ];
  await director.refresh();
  await director.cancel("AV-1");
  assert.ok(
    backend.paths.includes("POST /api/operations/cases/CASE-9/operator"),
  );
  await close();
});

test("nothing the director does touches an acknowledgement, the simulator or a ramp route on the backend", async () => {
  const { director, backend, close } = await setup();
  await director.control("AV-1", { command: "arrive", value: "18331" });
  await director.createRequest("AV-2");
  await director.proceed();
  await director.halt("AV-2", true);
  for (const path of backend.paths) {
    assert.doesNotMatch(
      path,
      /assist-ack|simulator|ramp-simulation|safety-decision|telemetry|actuators/,
      path,
    );
  }
  await close();
});

test("the timeline names its source in words: bus with REAL or SIMULATED, backend, audit, demo action", async () => {
  const { director, simulated, backend, close } = await setup();
  simulated.agent.movement = {
    code: "WAITING_FOR_BAY",
    text: "Waiting for bay",
  };
  backend.state.bay = {
    stopCode: "18331",
    occupantBusId: "AV-1",
    grantedBusId: null,
    waitingBusIds: ["AV-2"],
  };
  backend.state.audit = [
    {
      eventId: "E1",
      eventType: "BAY_CHANGED",
      actor: "VEHICLE",
      busId: "AV-2",
    },
  ];
  await director.refresh();
  await director.control("AV-2", { command: "place", value: "person" });
  const sources = director.snapshot().timeline.map((entry) => entry.source);
  assert.ok(sources.includes("BUS 2 · SIMULATED"));
  assert.ok(sources.includes("BACKEND"));
  assert.ok(sources.includes("DEMO ACTION · SIMULATED"));
  await close();
});
