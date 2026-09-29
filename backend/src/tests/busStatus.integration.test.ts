import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { BusStatus } from "@buspass/shared";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";

function body(overrides: Record<string, unknown> = {}) {
  return {
    busService: "95",
    stopCode: "18331",
    movement: "POSITIONED_AT_STOP",
    simulated: true,
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

function post(
  baseUrl: string,
  busId: string,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return requestJson(baseUrl, `/api/operations/vehicles/${busId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

function signedHeaders(
  secret: string,
  deviceId: string,
  raw: string,
): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.`)
    .update(raw)
    .digest("hex");
  return {
    "x-device-id": deviceId,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

test("a bus reports its status and an operator can read it back", async () => {
  const server = await startTestServer();
  try {
    const created = await post(server.baseUrl, "AV-095-01", body());
    assert.equal(created.status, 202);
    assert.equal(created.body.outcome, "CHANGED");

    const one = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-095-01/status",
    );
    assert.equal(one.status, 200);
    assert.equal(one.body.busId, "AV-095-01");
    assert.equal(one.body.movement, "POSITIONED_AT_STOP");
    assert.equal(one.body.simulated, true);

    const list = await requestJson(
      server.baseUrl,
      "/api/operations/bus-status?stop=18331&limit=10",
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.count, 1);
    assert.equal(list.body.statuses[0].busId, "AV-095-01");
  } finally {
    await server.close();
  }
});

test("an unknown bus has no status", async () => {
  const server = await startTestServer();
  try {
    const missing = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/NOBODY/status",
    );
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});

test("invalid reports are rejected with 400 and store nothing", async () => {
  const server = await startTestServer();
  try {
    for (const bad of [
      body({ movement: "FLYING" }),
      body({ simulated: "yes" }),
      body({ observedAt: "later" }),
      "not an object",
    ]) {
      const response = await post(server.baseUrl, "AV-095-01", bad);
      assert.equal(response.status, 400, JSON.stringify(bad));
    }
    const none = await requestJson(
      server.baseUrl,
      "/api/operations/bus-status",
    );
    assert.equal(none.body.count, 0);
  } finally {
    await server.close();
  }
});

test("the bus id in the path wins over one in the body", async () => {
  const server = await startTestServer();
  try {
    const response = await post(
      server.baseUrl,
      "AV-095-01",
      body({ busId: "AV-095-02" }),
    );
    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});

test("a heartbeat is accepted without changing the outcome to a change", async () => {
  const server = await startTestServer();
  try {
    await post(
      server.baseUrl,
      "AV-095-01",
      body({ observedAt: new Date(Date.now() - 2000).toISOString() }),
    );
    const again = await post(
      server.baseUrl,
      "AV-095-01",
      body({ observedAt: new Date().toISOString() }),
    );
    assert.equal(again.status, 202);
    assert.equal(again.body.outcome, "HEARTBEAT");
  } finally {
    await server.close();
  }
});

test("when a device secret is set, only correctly signed reports are accepted", async () => {
  const previous = process.env.DEVICE_SHARED_SECRET;
  process.env.DEVICE_SHARED_SECRET = "bus-status-secret";
  const server = await startTestServer();
  try {
    const payload = body();
    const raw = JSON.stringify(payload);
    const unsigned = await post(server.baseUrl, "AV-095-01", payload);
    assert.equal(unsigned.status, 401);
    const wrong = await post(
      server.baseUrl,
      "AV-095-01",
      payload,
      signedHeaders("wrong-secret", "AV-095-01", raw),
    );
    assert.equal(wrong.status, 401);
    const signed = await post(
      server.baseUrl,
      "AV-095-01",
      payload,
      signedHeaders("bus-status-secret", "AV-095-01", raw),
    );
    assert.equal(signed.status, 202);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.DEVICE_SHARED_SECRET;
    else process.env.DEVICE_SHARED_SECRET = previous;
  }
});

test("when an operator token is set, reading status requires it", async () => {
  const previous = process.env.OPERATOR_API_TOKEN;
  process.env.OPERATOR_API_TOKEN = "op-token";
  const server = await startTestServer();
  try {
    await post(server.baseUrl, "AV-095-01", body());
    const denied = await requestJson(
      server.baseUrl,
      "/api/operations/bus-status",
    );
    assert.equal(denied.status, 401);
    const allowed = await requestJson(
      server.baseUrl,
      "/api/operations/bus-status",
      {
        headers: { Authorization: "Bearer op-token" },
      },
    );
    assert.equal(allowed.status, 200);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previous;
  }
});

test("a scoped operator sees a change live; a heartbeat and other buses are not sent", async () => {
  const server = await startTestServer();
  const sockets: Connection[] = [];
  try {
    const operator = await connect(server.wsUrl);
    sockets.push(operator);
    operator.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", buses: ["AV-095-01"] }),
    );
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");

    await post(server.baseUrl, "AV-095-02", body());
    await post(
      server.baseUrl,
      "AV-095-01",
      body({ observedAt: new Date(Date.now() - 3000).toISOString() }),
    );
    await post(
      server.baseUrl,
      "AV-095-01",
      body({ observedAt: new Date(Date.now() - 2000).toISOString() }),
    );
    await post(
      server.baseUrl,
      "AV-095-01",
      body({ movement: "DEPARTING", observedAt: new Date().toISOString() }),
    );
    await operator.waitFor(
      (m) =>
        m.type === "BUS_STATUS" &&
        (m.status as BusStatus).movement === "DEPARTING",
    );

    const seen = operator.messages
      .filter((m) => m.type === "BUS_STATUS")
      .map((m) => (m.status as BusStatus).movement);
    assert.deepEqual(seen, ["POSITIONED_AT_STOP", "DEPARTING"]);
  } finally {
    sockets.forEach((connection) => connection.socket.close());
    await server.close();
  }
});

test("a passenger socket for the same bus never receives bus status", async () => {
  const server = await startTestServer();
  const sockets: Connection[] = [];
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: "status-passenger",
          busService: "95",
          busId: "AV-095-01",
          boardingStop: "18301",
          assistanceTypes: ["WHEELCHAIR_RAMP"],
          source: "MOBILE_APP",
          boardingOrAlighting: "BOARDING",
        }),
      },
    );
    const passenger = await connect(server.wsUrl);
    sockets.push(passenger);
    passenger.socket.send(
      JSON.stringify({ type: "SUBSCRIBE", requestId: created.body.requestId }),
    );
    await passenger.waitFor((m) => m.type === "SUBSCRIBED");

    await post(server.baseUrl, "AV-095-01", body({ movement: "DEPARTING" }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(!passenger.messages.some((m) => m.type === "BUS_STATUS"));
  } finally {
    sockets.forEach((connection) => connection.socket.close());
    await server.close();
  }
});
