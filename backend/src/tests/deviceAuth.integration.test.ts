import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { classifyRequest } from "../platform/rateLimit";
import { responseSignature } from "../routes/auth";
import { requestJson, startTestServer } from "./helpers/integration";

const stamp = () => new Date().toISOString();

function statusBody(): string {
  return JSON.stringify({
    busService: "95",
    stopCode: "18331",
    movement: "TRAVELLING_TO_STOP",
    simulated: true,
    observedAt: stamp(),
  });
}

function sign(
  secret: string,
  deviceId: string,
  method: string,
  path: string,
  raw: string,
  timestamp = String(Date.now()),
): Record<string, string> {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.${method}.${path}.`)
    .update(raw)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "x-device-id": deviceId,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

async function withSecrets(
  env: Record<string, string>,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const server = await startTestServer();
  try {
    await work(server.baseUrl);
  } finally {
    await server.close();
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const post = (
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  body: string,
) => requestJson(baseUrl, path, { method: "POST", headers, body });

test("a signed request is accepted once and the same request sent again is refused", async () => {
  await withSecrets(
    { DEVICE_SHARED_SECRET: "shared-secret" },
    async (baseUrl) => {
      const path = "/api/operations/vehicles/AV-1/status";
      const raw = statusBody();
      const headers = sign("shared-secret", "AV-1", "POST", path, raw);
      assert.equal((await post(baseUrl, path, headers, raw)).status, 202);
      const replay = await post(baseUrl, path, headers, raw);
      assert.equal(replay.status, 401);
      assert.match(String(replay.body.error), /already used/);
    },
  );
});

test("a signature made for one path cannot be used on another, or with another method", async () => {
  await withSecrets(
    { DEVICE_SHARED_SECRET: "shared-secret" },
    async (baseUrl) => {
      const raw = statusBody();
      const forStatus = sign(
        "shared-secret",
        "AV-1",
        "POST",
        "/api/operations/vehicles/AV-1/status",
        raw,
      );
      const elsewhere = await post(
        baseUrl,
        "/api/operations/vehicles/AV-1/ramp-simulation",
        forStatus,
        raw,
      );
      assert.equal(elsewhere.status, 401);
      const asPut = await requestJson(
        baseUrl,
        "/api/operations/vehicles/AV-1/status",
        {
          method: "PUT",
          headers: forStatus,
          body: raw,
        },
      );
      assert.notEqual(asPut.status, 202);
    },
  );
});

test("a bus can act only for itself", async () => {
  await withSecrets(
    { DEVICE_SHARED_SECRET: "shared-secret" },
    async (baseUrl) => {
      const path = "/api/operations/vehicles/AV-2/status";
      const raw = statusBody();
      // AV-1 holds a valid signature, but the route is for AV-2.
      const headers = sign("shared-secret", "AV-1", "POST", path, raw);
      assert.equal((await post(baseUrl, path, headers, raw)).status, 403);
    },
  );
});

test("a timestamp that is not a number is refused", async () => {
  await withSecrets(
    { DEVICE_SHARED_SECRET: "shared-secret" },
    async (baseUrl) => {
      const path = "/api/operations/vehicles/AV-1/status";
      const raw = statusBody();
      const headers = sign(
        "shared-secret",
        "AV-1",
        "POST",
        path,
        raw,
        "not-a-number",
      );
      assert.equal((await post(baseUrl, path, headers, raw)).status, 401);
    },
  );
});

test("a device with its own secret signs with it, and the fleet secret no longer works for that device", async () => {
  await withSecrets(
    {
      DEVICE_SHARED_SECRET: "fleet-secret",
      DEVICE_SECRETS: JSON.stringify({ "AV-1": "bus-one-secret" }),
    },
    async (baseUrl) => {
      const one = "/api/operations/vehicles/AV-1/status";
      const two = "/api/operations/vehicles/AV-2/status";
      const raw = statusBody();
      assert.equal(
        (
          await post(
            baseUrl,
            one,
            sign("bus-one-secret", "AV-1", "POST", one, raw),
            raw,
          )
        ).status,
        202,
      );
      assert.equal(
        (
          await post(
            baseUrl,
            one,
            sign("fleet-secret", "AV-1", "POST", one, raw),
            raw,
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await post(
            baseUrl,
            two,
            sign("fleet-secret", "AV-2", "POST", two, raw),
            raw,
          )
        ).status,
        202,
      );
    },
  );
});

test("bus traffic gets the never-shed safety class only when its signature was verified", () => {
  const path = "/api/operations/vehicles/AV-1/status";
  assert.equal(classifyRequest("POST", path, true), "safety");
  assert.equal(classifyRequest("POST", path, false), "operator");
  assert.equal(
    classifyRequest("POST", path),
    "safety",
    "trusted by default, as before",
  );
});

test("a response to a signed request is signed too, bound to that request, so a forged answer can be told apart", async () => {
  await withSecrets(
    { DEVICE_SHARED_SECRET: "shared-secret" },
    async (baseUrl) => {
      const path = "/api/operations/vehicles/AV-1/operator-halt";
      const headers = sign("shared-secret", "AV-1", "GET", path, "{}");
      const response = await fetch(`${baseUrl}${path}`, { headers });
      const raw = Buffer.from(await response.arrayBuffer());
      const supplied = response.headers.get("x-response-signature");
      assert.ok(supplied, "the response carries a signature");
      assert.equal(
        supplied,
        responseSignature(
          "shared-secret",
          headers["x-signature"],
          response.status,
          raw,
        ),
      );
      assert.notEqual(
        supplied,
        responseSignature(
          "other-secret",
          headers["x-signature"],
          response.status,
          raw,
        ),
      );
    },
  );
});

test("with no device secret (development) responses are not signed", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(
      `${server.baseUrl}/api/operations/vehicles/AV-1/operator-halt`,
    );
    assert.equal(response.headers.get("x-response-signature"), null);
  } finally {
    await server.close();
  }
});
