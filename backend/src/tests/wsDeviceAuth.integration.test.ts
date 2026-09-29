import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";
import { DEVICE_SUBSCRIBE_BODY, verifyDeviceSignature } from "../routes/auth";

const SECRET = "device-ws-secret";
const BUS = "AV-095-01";

function sign(
  deviceId: string,
  timestamp: string,
  body: string,
  secret = SECRET,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.`)
    .update(body)
    .digest("hex");
}

function subscribeMessage(overrides: Record<string, unknown> = {}) {
  const timestamp = String(Date.now());
  return {
    type: "SUBSCRIBE_DEVICE",
    busId: BUS,
    deviceId: BUS,
    timestamp,
    signature: sign(BUS, timestamp, DEVICE_SUBSCRIBE_BODY),
    ...overrides,
  };
}

async function withSecret<T>(work: () => Promise<T>): Promise<T> {
  const previousSecret = process.env.DEVICE_SHARED_SECRET;
  const previousToken = process.env.OPERATOR_API_TOKEN;
  process.env.DEVICE_SHARED_SECRET = SECRET;
  process.env.OPERATOR_API_TOKEN = "op-token";
  try {
    return await work();
  } finally {
    if (previousSecret === undefined) delete process.env.DEVICE_SHARED_SECRET;
    else process.env.DEVICE_SHARED_SECRET = previousSecret;
    if (previousToken === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previousToken;
  }
}

test("verifyDeviceSignature accepts a good signature and refuses each kind of bad one", () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now);
  const good = sign("D1", timestamp, "body");
  const check = (
    over: Partial<Parameters<typeof verifyDeviceSignature>[0]> = {},
  ) =>
    verifyDeviceSignature({
      secret: SECRET,
      deviceId: "D1",
      timestamp,
      signature: good,
      body: "body",
      now,
      ...over,
    });
  assert.equal(check(), true);
  assert.equal(check({ signature: "0".repeat(64) }), false);
  assert.equal(check({ body: "other" }), false);
  assert.equal(check({ deviceId: "D2" }), false);
  assert.equal(check({ secret: "wrong" }), false);
  assert.equal(check({ now: now + 61_000 }), false, "too old");
  assert.equal(check({ now: now - 61_000 }), false, "too far ahead");
  assert.equal(check({ signature: "" }), false);
  assert.equal(check({ timestamp: "soon" }), false);
});

test("a bus with a valid signature receives its own requests and nothing else, without the operator token", async () => {
  await withSecret(async () => {
    const server = await startTestServer();
    const sockets: Connection[] = [];
    try {
      const bus = await connect(server.wsUrl);
      sockets.push(bus);
      bus.socket.send(JSON.stringify(subscribeMessage()));
      await bus.waitFor((m) => m.type === "SUBSCRIBED_DEVICE");

      const create = (busId: string) =>
        requestJson(server.baseUrl, "/api/assistance/request", {
          method: "POST",
          body: JSON.stringify({
            sessionId: `s-${busId}`,
            busService: busId.includes("095") ? "95" : "191",
            busId,
            boardingStop: "18301",
            assistanceTypes: ["WHEELCHAIR_RAMP"],
            source: "MOBILE_APP",
            boardingOrAlighting: "BOARDING",
          }),
        });
      await create("AV-191-03");
      const mine = await create(BUS);
      const pushed = await bus.waitFor((m) => m.type === "ASSIST_REQUESTED");
      assert.equal(
        (pushed.request as { requestId: string }).requestId,
        mine.body.requestId,
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(
        bus.messages.filter((m) => m.type === "ASSIST_REQUESTED").length,
        1,
        "only its own bus's request",
      );
    } finally {
      sockets.forEach((c) => c.socket.close());
      await server.close();
    }
  });
});

test("a bad signature, a stale time or a device id that is not the bus is refused and subscribes nothing", async () => {
  await withSecret(async () => {
    const server = await startTestServer();
    const sockets: Connection[] = [];
    try {
      const attempts = [
        subscribeMessage({ signature: "0".repeat(64) }),
        subscribeMessage({
          timestamp: String(Date.now() - 5 * 60_000),
          signature: sign(
            BUS,
            String(Date.now() - 5 * 60_000),
            DEVICE_SUBSCRIBE_BODY,
          ),
        }),
        subscribeMessage({
          deviceId: "AV-095-02",
          signature: sign(
            "AV-095-02",
            String(Date.now()),
            DEVICE_SUBSCRIBE_BODY,
          ),
        }),
        { type: "SUBSCRIBE_DEVICE", busId: BUS },
      ];
      for (const attempt of attempts) {
        const bus = await connect(server.wsUrl);
        sockets.push(bus);
        bus.socket.send(JSON.stringify(attempt));
        await bus.waitFor((m) => m.type === "AUTH_REQUIRED");
        assert.ok(!bus.messages.some((m) => m.type === "SUBSCRIBED_DEVICE"));
      }
    } finally {
      sockets.forEach((c) => c.socket.close());
      await server.close();
    }
  });
});

test("with no device secret configured (development) a device may subscribe unsigned", async () => {
  const previous = process.env.DEVICE_SHARED_SECRET;
  delete process.env.DEVICE_SHARED_SECRET;
  const server = await startTestServer();
  let bus: Connection | undefined;
  try {
    bus = await connect(server.wsUrl);
    bus.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_DEVICE", busId: BUS, deviceId: BUS }),
    );
    await bus.waitFor((m) => m.type === "SUBSCRIBED_DEVICE");
  } finally {
    bus?.socket.close();
    if (previous !== undefined) process.env.DEVICE_SHARED_SECRET = previous;
    await server.close();
  }
});

test("a device subscription with no bus id is refused", async () => {
  await withSecret(async () => {
    const server = await startTestServer();
    let bus: Connection | undefined;
    try {
      bus = await connect(server.wsUrl);
      bus.socket.send(JSON.stringify(subscribeMessage({ busId: "" })));
      await bus.waitFor(
        (m) =>
          m.type === "AUTH_REQUIRED" ||
          m.type === "INVALID_DEVICE_SUBSCRIPTION",
      );
    } finally {
      bus?.socket.close();
      await server.close();
    }
  });
});
