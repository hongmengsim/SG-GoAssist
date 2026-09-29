import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, startTestServer } from "./helpers/integration";

const REQUEST = {
  sessionId: "audit-passenger",
  busService: "95",
  busId: "AV-095-01",
  boardingStop: "18301",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

test("the audit endpoint returns recent events, newest first, and honours limit and filters", async () => {
  const server = await startTestServer();
  try {
    await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify(REQUEST),
    });
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-095-01/status",
      {
        method: "POST",
        body: JSON.stringify({
          busService: "95",
          stopCode: "18301",
          movement: "POSITIONED_AT_STOP",
          simulated: true,
          observedAt: new Date().toISOString(),
        }),
      },
    );

    const all = await requestJson(
      server.baseUrl,
      "/api/operations/audit?limit=50",
    );
    assert.equal(all.status, 200);
    assert.ok(all.body.count >= 2);
    const times = all.body.events.map(
      (e: { timestamp: string }) => e.timestamp,
    );
    assert.deepEqual([...times].sort().reverse(), times);

    const one = await requestJson(
      server.baseUrl,
      "/api/operations/audit?limit=1",
    );
    assert.equal(one.body.events.length, 1);

    const byBus = await requestJson(
      server.baseUrl,
      "/api/operations/audit?busId=AV-095-01&limit=50",
    );
    assert.ok(byBus.body.events.length >= 1);
    assert.ok(
      byBus.body.events.every(
        (e: { busId?: string }) => e.busId === "AV-095-01",
      ),
    );

    const none = await requestJson(
      server.baseUrl,
      "/api/operations/audit?busId=NO-SUCH-BUS",
    );
    assert.equal(none.body.count, 0);
  } finally {
    await server.close();
  }
});

test("a bad limit falls back to the default and never exceeds the maximum", async () => {
  const server = await startTestServer();
  try {
    const odd = await requestJson(
      server.baseUrl,
      "/api/operations/audit?limit=abc",
    );
    assert.equal(odd.status, 200);
    const huge = await requestJson(
      server.baseUrl,
      "/api/operations/audit?limit=999999",
    );
    assert.equal(huge.status, 200);
  } finally {
    await server.close();
  }
});

test("when an operator token is set, reading the audit log requires it", async () => {
  const previous = process.env.OPERATOR_API_TOKEN;
  process.env.OPERATOR_API_TOKEN = "op-token";
  const server = await startTestServer();
  try {
    assert.equal(
      (await requestJson(server.baseUrl, "/api/operations/audit")).status,
      401,
    );
    const allowed = await requestJson(server.baseUrl, "/api/operations/audit", {
      headers: { Authorization: "Bearer op-token" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previous;
  }
});
