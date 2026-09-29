import test from "node:test";
import assert from "node:assert/strict";
import type { OperatorStatusUpdateMessage } from "@buspass/shared";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";

const BUS = "AV-095-01";

function post(baseUrl: string, path: string, payload: unknown) {
  return requestJson(baseUrl, `/api/operations/vehicles/${BUS}/${path}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

const now = () => new Date().toISOString();

const ramp = { state: "DEPLOYING", simulated: true };
const decision = {
  zoneState: "OCCUPIED",
  permission: "HALT",
  reasons: ["OBJECT_IN_ZONE", "TOF_BLOCKED"],
  tof: { state: "BLOCKED", distanceMm: 340, simulated: true },
  camera: { imageOk: true },
  objectsInZone: [{ className: "person", safety: "UNSAFE", confidence: 0.93 }],
  simulated: true,
};
const help = { reason: "DEPLOYMENT_TIMEOUT", state: "DEPLOYING" };

const cases: Array<{
  name: string;
  path: string;
  readPath: string;
  listPath: string;
  payload: Record<string, unknown>;
  message: OperatorStatusUpdateMessage["type"];
}> = [
  {
    name: "ramp simulation",
    path: "ramp-simulation",
    readPath: "ramp-simulation",
    listPath: "ramp-simulations",
    payload: ramp,
    message: "RAMP_SIMULATION",
  },
  {
    name: "safety decision",
    path: "safety-decision",
    readPath: "safety-decision",
    listPath: "safety-decisions",
    payload: decision,
    message: "RAMP_SAFETY",
  },
  {
    name: "help required",
    path: "help-required",
    readPath: "help-required",
    listPath: "help-required",
    payload: help,
    message: "HELP_REQUIRED",
  },
];

for (const item of cases) {
  test(`${item.name}: posted by the bus, readable by an operator, pushed to a scoped operator`, async () => {
    const server = await startTestServer();
    const sockets: Connection[] = [];
    try {
      const operator = await connect(server.wsUrl);
      sockets.push(operator);
      operator.socket.send(
        JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", buses: [BUS] }),
      );
      await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");

      const created = await post(server.baseUrl, item.path, {
        ...item.payload,
        observedAt: now(),
      });
      assert.equal(created.status, 202);
      assert.equal(created.body.outcome, "CHANGED");

      await operator.waitFor((m) => m.type === item.message);

      const one = await requestJson(
        server.baseUrl,
        `/api/operations/vehicles/${BUS}/${item.readPath}`,
      );
      assert.equal(one.status, 200);
      assert.equal(one.body.busId, BUS);

      const list = await requestJson(
        server.baseUrl,
        `/api/operations/${item.listPath}?limit=10`,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.count, 1);

      const missing = await requestJson(
        server.baseUrl,
        `/api/operations/vehicles/NOBODY/${item.readPath}`,
      );
      assert.equal(missing.status, 404);
    } finally {
      sockets.forEach((connection) => connection.socket.close());
      await server.close();
    }
  });

  test(`${item.name}: invalid reports get 400 and a passenger never receives them`, async () => {
    const server = await startTestServer();
    const sockets: Connection[] = [];
    try {
      const passenger = await connect(server.wsUrl);
      sockets.push(passenger);
      const request = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify({
            sessionId: "reports-passenger",
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
        JSON.stringify({
          type: "SUBSCRIBE",
          requestId: request.body.requestId,
        }),
      );
      await passenger.waitFor((m) => m.type === "SUBSCRIBED");

      assert.equal(
        (await post(server.baseUrl, item.path, { observedAt: now() })).status,
        400,
      );
      assert.equal(
        (await post(server.baseUrl, item.path, "not an object")).status,
        400,
      );
      await post(server.baseUrl, item.path, {
        ...item.payload,
        observedAt: now(),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.ok(!passenger.messages.some((m) => m.type === item.message));
    } finally {
      sockets.forEach((connection) => connection.socket.close());
      await server.close();
    }
  });
}

test("a device secret is required for posting and an operator token for reading", async () => {
  const previousSecret = process.env.DEVICE_SHARED_SECRET;
  const previousToken = process.env.OPERATOR_API_TOKEN;
  process.env.DEVICE_SHARED_SECRET = "reports-secret";
  process.env.OPERATOR_API_TOKEN = "op-token";
  const server = await startTestServer();
  try {
    const unsigned = await post(server.baseUrl, "ramp-simulation", {
      ...ramp,
      observedAt: now(),
    });
    assert.equal(unsigned.status, 401);
    const unauthenticated = await requestJson(
      server.baseUrl,
      "/api/operations/ramp-simulations",
    );
    assert.equal(unauthenticated.status, 401);
  } finally {
    await server.close();
    if (previousSecret === undefined) delete process.env.DEVICE_SHARED_SECRET;
    else process.env.DEVICE_SHARED_SECRET = previousSecret;
    if (previousToken === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previousToken;
  }
});
