import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, startTestServer } from "./helpers/integration";

const REQUEST = {
  sessionId: "ack-passenger",
  busService: "95",
  busId: "AV-095-01",
  boardingStop: "18301",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

async function withAutoAck<T>(
  value: string | undefined,
  work: () => Promise<T>,
) {
  const previous = process.env.GOASSIST_AUTO_ACK;
  if (value === undefined) delete process.env.GOASSIST_AUTO_ACK;
  else process.env.GOASSIST_AUTO_ACK = value;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.GOASSIST_AUTO_ACK;
    else process.env.GOASSIST_AUTO_ACK = previous;
  }
}

function ack(baseUrl: string, busId: string, requestId: string) {
  return requestJson(baseUrl, `/api/operations/vehicles/${busId}/assist-ack`, {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
}

async function statusOf(baseUrl: string, requestId: string) {
  const response = await requestJson(baseUrl, `/api/assistance/${requestId}`);
  return response.body.status as string;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

test("with auto-acknowledge off, nothing acknowledges until the bus does", async () => {
  await withAutoAck("off", async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      await settle();
      assert.equal(
        await statusOf(server.baseUrl, created.body.requestId),
        "SENDING",
      );

      const result = await ack(
        server.baseUrl,
        "AV-095-01",
        created.body.requestId,
      );
      assert.equal(result.status, 200);
      assert.equal(
        await statusOf(server.baseUrl, created.body.requestId),
        "ACKNOWLEDGED",
      );
    } finally {
      await server.close();
    }
  });
});

test("a different bus cannot acknowledge another bus's request", async () => {
  await withAutoAck("off", async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      const result = await ack(
        server.baseUrl,
        "AV-095-02",
        created.body.requestId,
      );
      assert.equal(result.status, 409);
      assert.equal(
        await statusOf(server.baseUrl, created.body.requestId),
        "SENDING",
      );
    } finally {
      await server.close();
    }
  });
});

test("acknowledging an unknown request is a 404 and a missing id a 400", async () => {
  const server = await startTestServer();
  try {
    assert.equal(
      (await ack(server.baseUrl, "AV-095-01", "REQ-NOPE")).status,
      404,
    );
    const bad = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-095-01/assist-ack",
      { method: "POST", body: JSON.stringify({}) },
    );
    assert.equal(bad.status, 400);
  } finally {
    await server.close();
  }
});

test("acknowledging twice is harmless", async () => {
  await withAutoAck("off", async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      assert.equal(
        (await ack(server.baseUrl, "AV-095-01", created.body.requestId)).status,
        200,
      );
      assert.equal(
        (await ack(server.baseUrl, "AV-095-01", created.body.requestId)).status,
        200,
      );
    } finally {
      await server.close();
    }
  });
});

test("with auto-acknowledge off the simulator cannot acknowledge on the bus's behalf", async () => {
  await withAutoAck("off", async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      const forged = await requestJson(
        server.baseUrl,
        "/api/assistance/simulator/command",
        {
          method: "POST",
          body: JSON.stringify({
            requestId: created.body.requestId,
            command: "ACKNOWLEDGE",
          }),
        },
      );
      assert.equal(forged.status, 403);
      assert.equal(
        await statusOf(server.baseUrl, created.body.requestId),
        "SENDING",
      );
    } finally {
      await server.close();
    }
  });
});

test("by default the request is still acknowledged automatically", async () => {
  await withAutoAck(undefined, async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      await settle();
      assert.equal(
        await statusOf(server.baseUrl, created.body.requestId),
        "ACKNOWLEDGED",
      );
    } finally {
      await server.close();
    }
  });
});

test("when a device secret is set, an unsigned acknowledgement is refused", async () => {
  const previous = process.env.DEVICE_SHARED_SECRET;
  process.env.DEVICE_SHARED_SECRET = "ack-secret";
  await withAutoAck("off", async () => {
    const server = await startTestServer();
    try {
      const created = await requestJson(
        server.baseUrl,
        "/api/assistance/request",
        {
          method: "POST",
          body: JSON.stringify(REQUEST),
        },
      );
      assert.equal(
        (await ack(server.baseUrl, "AV-095-01", created.body.requestId)).status,
        401,
      );
    } finally {
      await server.close();
      if (previous === undefined) delete process.env.DEVICE_SHARED_SECRET;
      else process.env.DEVICE_SHARED_SECRET = previous;
    }
  });
});
