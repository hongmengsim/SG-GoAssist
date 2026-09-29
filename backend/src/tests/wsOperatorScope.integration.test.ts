import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import type {
  BusStatus,
  BusStatusUpdateMessage,
  RampSafetyUpdateMessage,
} from "@buspass/shared";
import { getEventHub, publishEvent } from "../events/eventHub";
import { requestJson, startTestServer } from "./helpers/integration";

interface Connection {
  socket: WebSocket;
  messages: Array<Record<string, unknown>>;
  waitFor: (
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ) => Promise<Record<string, unknown>>;
}

async function connect(wsUrl: string): Promise<Connection> {
  const socket = new WebSocket(wsUrl);
  const messages: Array<Record<string, unknown>> = [];
  socket.on("message", (data) => messages.push(JSON.parse(String(data))));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const waitFor: Connection["waitFor"] = (predicate, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const found = messages.find(predicate);
        if (found) return resolve(found);
        if (Date.now() - started > timeoutMs) {
          return reject(
            new Error(`Timed out. Saw ${JSON.stringify(messages)}`),
          );
        }
        setTimeout(check, 10);
      };
      check();
    });
  return { socket, messages, waitFor };
}

async function waitForSubscriberCount(
  expected: number,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (
    getEventHub().subscriberCount() !== expected &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(getEventHub().subscriberCount(), expected);
}

function busStatus(busId: string, stopCode = "18331"): BusStatusUpdateMessage {
  const status: BusStatus = {
    busId,
    busService: "95",
    stopCode,
    movement: "POSITIONED_AT_STOP",
    simulated: true,
    observedAt: new Date().toISOString(),
  };
  return { type: "BUS_STATUS", status, timestamp: new Date().toISOString() };
}

function rampSafety(busId: string): RampSafetyUpdateMessage {
  return {
    type: "RAMP_SAFETY",
    timestamp: new Date().toISOString(),
    decision: {
      busId,
      zoneState: "CLEAR",
      permission: "CONTINUE",
      reasons: [],
      tof: { state: "BEAM_CLEAR", simulated: true },
      camera: { imageOk: true },
      objectsInZone: [],
      simulated: true,
      observedAt: new Date().toISOString(),
    },
  };
}

async function subscribeOperator(
  wsUrl: string,
  scope: Record<string, unknown> = {},
) {
  const connection = await connect(wsUrl);
  connection.socket.send(
    JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", ...scope }),
  );
  return connection;
}

test("an unscoped operator receives every operator message", async () => {
  const server = await startTestServer();
  try {
    const operator = await subscribeOperator(server.wsUrl);
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    publishEvent(busStatus("B-ONE"));
    publishEvent(busStatus("B-TWO"));
    await operator.waitFor(
      (m) =>
        m.type === "BUS_STATUS" && (m.status as BusStatus).busId === "B-TWO",
    );
    const buses = operator.messages
      .filter((m) => m.type === "BUS_STATUS")
      .map((m) => (m.status as BusStatus).busId);
    assert.deepEqual(buses, ["B-ONE", "B-TWO"]);
    operator.socket.close();
  } finally {
    await server.close();
  }
});

test("a scoped operator receives only messages for its buses", async () => {
  const server = await startTestServer();
  try {
    const operator = await subscribeOperator(server.wsUrl, {
      buses: ["B-ONE"],
    });
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    publishEvent(busStatus("B-TWO"));
    publishEvent(rampSafety("B-TWO"));
    publishEvent(busStatus("B-ONE"));
    await operator.waitFor((m) => m.type === "BUS_STATUS");
    const seen = operator.messages.filter(
      (m) => m.type !== "SUBSCRIBED_OPERATIONS",
    );
    assert.equal(seen.length, 1);
    assert.equal((seen[0].status as BusStatus).busId, "B-ONE");
    operator.socket.close();
  } finally {
    await server.close();
  }
});

test("a scoped operator can watch a stop, and sees the buses that report it", async () => {
  const server = await startTestServer();
  try {
    const operator = await subscribeOperator(server.wsUrl, {
      stops: ["18331"],
    });
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    publishEvent(busStatus("B-ELSEWHERE", "99999"));
    publishEvent(busStatus("B-HERE", "18331"));
    await operator.waitFor((m) => m.type === "BUS_STATUS");
    const seen = operator.messages.filter((m) => m.type === "BUS_STATUS");
    assert.equal(seen.length, 1);
    assert.equal((seen[0].status as BusStatus).busId, "B-HERE");
    operator.socket.close();
  } finally {
    await server.close();
  }
});

test("a passenger socket never receives operator-only messages, even for its own bus", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: "scope-passenger",
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
    passenger.socket.send(
      JSON.stringify({ type: "SUBSCRIBE", requestId: created.body.requestId }),
    );
    await passenger.waitFor((m) => m.type === "SUBSCRIBED");

    publishEvent(rampSafety("AV-095-01"));
    publishEvent(busStatus("AV-095-01"));
    await requestJson(server.baseUrl, "/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({
        busId: "AV-095-01",
        status: "APPROACHING",
        busService: "95",
      }),
    });
    await passenger.waitFor((m) => m.type === "VEHICLE_STATUS");

    const types = passenger.messages.map((m) => m.type);
    assert.ok(!types.includes("RAMP_SAFETY"), types.join(","));
    assert.ok(!types.includes("BUS_STATUS"), types.join(","));
    passenger.socket.close();
  } finally {
    await server.close();
  }
});

test("an invalid scope is rejected and nothing is subscribed", async () => {
  const server = await startTestServer();
  try {
    await waitForSubscriberCount(0);
    for (const scope of [
      { buses: "B-ONE" },
      { stops: [1, 2] },
      { buses: Array.from({ length: 201 }, (_, i) => `B${i}`) },
    ]) {
      const operator = await subscribeOperator(server.wsUrl, scope);
      await operator.waitFor((m) => m.type === "INVALID_OPERATIONS_SCOPE");
      operator.socket.close();
    }
    await waitForSubscriberCount(0);
  } finally {
    await server.close();
  }
});

test("closing a socket removes all of its subscriptions", async () => {
  const server = await startTestServer();
  try {
    await waitForSubscriberCount(0);
    const operator = await subscribeOperator(server.wsUrl, {
      buses: ["B-ONE", "B-TWO"],
      stops: ["18331"],
    });
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    assert.equal(getEventHub().subscriberCount(), 3);
    operator.socket.close();
    await waitForSubscriberCount(0);
  } finally {
    await server.close();
  }
});

test("operator authentication still applies to scoped subscriptions", async () => {
  const previous = process.env.OPERATOR_API_TOKEN;
  process.env.OPERATOR_API_TOKEN = "secret-token";
  const server = await startTestServer();
  try {
    const denied = await subscribeOperator(server.wsUrl, {
      buses: ["B-ONE"],
      token: "wrong",
    });
    await denied.waitFor((m) => m.type === "AUTH_REQUIRED");
    publishEvent(busStatus("B-ONE"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(!denied.messages.some((m) => m.type === "BUS_STATUS"));
    denied.socket.close();

    const allowed = await subscribeOperator(server.wsUrl, {
      buses: ["B-ONE"],
      token: "secret-token",
    });
    await allowed.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    allowed.socket.close();
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previous;
  }
});
