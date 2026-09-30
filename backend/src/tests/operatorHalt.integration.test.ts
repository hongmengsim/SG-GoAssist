import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { OperatorHalt } from "@buspass/shared";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";

const BUS = "AV-095-01";
const OTHER = "AV-095-02";

const setHalt = (base: string, busId: string, body: unknown) =>
  requestJson(base, `/api/operations/vehicles/${busId}/operator-halt`, {
    method: "POST",
    body: JSON.stringify(body),
  });
const getHalt = (
  base: string,
  busId: string,
  headers: Record<string, string> = {},
) =>
  requestJson(base, `/api/operations/vehicles/${busId}/operator-halt`, {
    headers: { "Content-Type": "application/json", ...headers },
  });

test("an operator halts a bus, the bus can read it, and releasing it is a second change", async () => {
  const server = await startTestServer();
  try {
    assert.equal((await getHalt(server.baseUrl, BUS)).body.halted, false);
    const on = await setHalt(server.baseUrl, BUS, {
      halted: true,
      reason: "Inspect the ramp",
    });
    assert.equal(on.status, 200);
    assert.equal(on.body.halted, true);
    assert.equal(on.body.reason, "Inspect the ramp");
    assert.equal((await getHalt(server.baseUrl, BUS)).body.halted, true);
    assert.equal(
      (await getHalt(server.baseUrl, OTHER)).body.halted,
      false,
      "only that bus",
    );
    const off = await setHalt(server.baseUrl, BUS, { halted: false });
    assert.equal(off.body.halted, false);
    const audit = await requestJson(
      server.baseUrl,
      `/api/operations/audit?busId=${BUS}&limit=20`,
    );
    const events = audit.body.events.filter(
      (e: { eventType: string }) => e.eventType === "OPERATOR_HALT_SET",
    );
    assert.equal(events.length, 2);
    assert.ok(events.every((e: { actor: string }) => e.actor === "OPERATOR"));
  } finally {
    await server.close();
  }
});

test("repeating the same state changes nothing and is not audited or pushed again", async () => {
  const BUS = "AV-151-01"; // its own bus: the audit store is shared between tests
  const server = await startTestServer();
  const sockets: Connection[] = [];
  try {
    const operator = await connect(server.wsUrl);
    sockets.push(operator);
    operator.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", buses: [BUS] }),
    );
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    await setHalt(server.baseUrl, BUS, { halted: true });
    await setHalt(server.baseUrl, BUS, { halted: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      operator.messages.filter((m) => m.type === "OPERATOR_HALT").length,
      1,
    );
    const audit = await requestJson(
      server.baseUrl,
      `/api/operations/audit?busId=${BUS}&limit=20`,
    );
    assert.equal(
      audit.body.events.filter(
        (e: { eventType: string }) => e.eventType === "OPERATOR_HALT_SET",
      ).length,
      1,
    );
  } finally {
    sockets.forEach((c) => c.socket.close());
    await server.close();
  }
});

test("the halted bus and a scoped operator receive it; another bus and a passenger do not", async () => {
  const server = await startTestServer();
  const sockets: Connection[] = [];
  try {
    const bus = await connect(server.wsUrl);
    const other = await connect(server.wsUrl);
    const passenger = await connect(server.wsUrl);
    sockets.push(bus, other, passenger);
    bus.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_DEVICE", busId: BUS, deviceId: BUS }),
    );
    other.socket.send(
      JSON.stringify({
        type: "SUBSCRIBE_DEVICE",
        busId: OTHER,
        deviceId: OTHER,
      }),
    );
    await bus.waitFor((m) => m.type === "SUBSCRIBED_DEVICE");
    await other.waitFor((m) => m.type === "SUBSCRIBED_DEVICE");
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: "halt-passenger",
          busService: "95",
          busId: BUS,
          boardingStop: "18301",
          assistanceTypes: ["WHEELCHAIR_RAMP"],
          source: "MOBILE_APP",
          boardingOrAlighting: "BOARDING",
        }),
      },
    );
    passenger.socket.send(
      JSON.stringify({ type: "SUBSCRIBE", requestId: created.body.requestId }),
    );
    await passenger.waitFor((m) => m.type === "SUBSCRIBED");

    await setHalt(server.baseUrl, BUS, { halted: true });
    const pushed = await bus.waitFor((m) => m.type === "OPERATOR_HALT");
    assert.equal((pushed.halt as OperatorHalt).busId, BUS);
    assert.equal((pushed.halt as OperatorHalt).halted, true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(!other.messages.some((m) => m.type === "OPERATOR_HALT"));
    assert.ok(!passenger.messages.some((m) => m.type === "OPERATOR_HALT"));
  } finally {
    sockets.forEach((c) => c.socket.close());
    await server.close();
  }
});

test("invalid halts are refused", async () => {
  const server = await startTestServer();
  try {
    for (const bad of [
      {},
      { halted: "yes" },
      { halted: true, reason: 5 },
      { halted: true, reason: "x".repeat(300) },
      "nope",
    ]) {
      assert.equal(
        (await setHalt(server.baseUrl, BUS, bad)).status,
        400,
        JSON.stringify(bad),
      );
    }
    assert.equal((await getHalt(server.baseUrl, BUS)).body.halted, false);
  } finally {
    await server.close();
  }
});

test("setting a halt needs the operator token, and a bus read needs its signature, when those are configured", async () => {
  const previousToken = process.env.OPERATOR_API_TOKEN;
  const previousSecret = process.env.DEVICE_SHARED_SECRET;
  process.env.OPERATOR_API_TOKEN = "op-token";
  process.env.DEVICE_SHARED_SECRET = "halt-secret";
  const server = await startTestServer();
  try {
    assert.equal(
      (await setHalt(server.baseUrl, BUS, { halted: true })).status,
      401,
    );
    const allowed = await requestJson(
      server.baseUrl,
      `/api/operations/vehicles/${BUS}/operator-halt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer op-token",
        },
        body: JSON.stringify({ halted: true }),
      },
    );
    assert.equal(allowed.status, 200);
    assert.equal(
      (await getHalt(server.baseUrl, BUS)).status,
      401,
      "unsigned device read refused",
    );
    const timestamp = String(Date.now());
    const signature = crypto
      .createHmac("sha256", "halt-secret")
      .update(
        `${BUS}.${timestamp}.GET./api/operations/vehicles/${BUS}/operator-halt.`,
      )
      .update("{}")
      .digest("hex");
    const signed = await getHalt(server.baseUrl, BUS, {
      "x-device-id": BUS,
      "x-timestamp": timestamp,
      "x-signature": signature,
    });
    assert.equal(signed.status, 200);
    assert.equal(signed.body.halted, true);
  } finally {
    if (previousToken === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.DEVICE_SHARED_SECRET;
    else process.env.DEVICE_SHARED_SECRET = previousSecret;
    await server.close();
  }
});

test("operators can list which buses are halted", async () => {
  const server = await startTestServer();
  try {
    await setHalt(server.baseUrl, BUS, { halted: true });
    await setHalt(server.baseUrl, OTHER, { halted: true });
    await setHalt(server.baseUrl, OTHER, { halted: false });
    const list = await requestJson(
      server.baseUrl,
      "/api/operations/operator-halts?limit=10",
    );
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.records
        .filter((r: OperatorHalt) => r.halted)
        .map((r: OperatorHalt) => r.busId),
      [BUS],
    );
  } finally {
    await server.close();
  }
});
