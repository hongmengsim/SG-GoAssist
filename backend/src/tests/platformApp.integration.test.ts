import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { createApp } from "../app";
import { requestJson } from "./helpers/integration";
import { resetBusOperations } from "../busOperations/composition";
import type { LimitConfig } from "../platform/rateLimit";

async function serve(options: Parameters<typeof createApp>[0]) {
  resetBusOperations();
  const server = http.createServer(createApp(options));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const NEARBY = "/api/bus-stops/nearby?lat=1.3&lng=103.8";
const ONE_STOP = "/api/bus-stops/18301";

test("a process started with the passenger role serves no operations routes", async () => {
  const server = await serve({ roles: "passenger" });
  try {
    assert.notEqual((await requestJson(server.base, NEARBY)).status, 404);
    assert.equal(
      (await requestJson(server.base, "/api/operations/cases")).status,
      404,
    );
    assert.equal(
      (await requestJson(server.base, "/api/operations/bus-status")).status,
      404,
    );
    assert.equal((await requestJson(server.base, "/health")).status, 200);
  } finally {
    await server.close();
  }
});

test("a process started with the operations role serves no passenger routes", async () => {
  const server = await serve({ roles: "operations" });
  try {
    assert.equal(
      (await requestJson(server.base, "/api/operations/cases")).status,
      200,
    );
    assert.equal((await requestJson(server.base, NEARBY)).status, 404);
    assert.equal(
      (await requestJson(server.base, "/api/assistance")).status,
      404,
    );
  } finally {
    await server.close();
  }
});

test("with no role set every route is served, as before", async () => {
  const server = await serve({});
  try {
    assert.equal(
      (await requestJson(server.base, "/api/operations/cases")).status,
      200,
    );
    assert.notEqual((await requestJson(server.base, NEARBY)).status, 404);
  } finally {
    await server.close();
  }
});

test("an unknown role stops the process from starting", () => {
  assert.throws(() => createApp({ roles: "passanger" }), /passanger/);
});

test("readiness reports each dependency and health stays a plain liveness check", async () => {
  const server = await serve({});
  try {
    const ready = await requestJson(server.base, "/ready");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.ready, true);
    assert.ok("operationsStore" in ready.body.checks);
    assert.ok("busOperations" in ready.body.checks);
    assert.equal((await requestJson(server.base, "/health")).body.status, "ok");
  } finally {
    await server.close();
  }
});

test("metrics count traffic by workload and need the operator token when one is set", async () => {
  const previous = process.env.OPERATOR_API_TOKEN;
  const server = await serve({});
  try {
    await requestJson(server.base, NEARBY);
    await requestJson(server.base, "/api/operations/vehicles/AV-1/status", {
      method: "POST",
      body: JSON.stringify({
        busService: "95",
        movement: "DEPARTING",
        simulated: true,
        observedAt: new Date().toISOString(),
      }),
    });
    const metrics = await requestJson(server.base, "/admin/metrics");
    assert.equal(metrics.status, 200);
    assert.ok(metrics.body.groups.browse.count >= 1);
    assert.ok(metrics.body.groups.safety.count >= 1);
    assert.equal(typeof metrics.body.groups.safety.p95Ms, "number");
    assert.ok("connectedWebSocketClients" in metrics.body);
    assert.ok("eventSubscribers" in metrics.body);

    process.env.OPERATOR_API_TOKEN = "op-token";
    assert.equal(
      (await requestJson(server.base, "/admin/metrics")).status,
      401,
    );
  } finally {
    if (previous === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previous;
    await server.close();
  }
});

test("read-only bus stop data is cacheable and answers a repeat with 304", async () => {
  const server = await serve({});
  try {
    const first = await fetch(`${server.base}${ONE_STOP}`);
    assert.equal(first.status, 200);
    assert.match(
      first.headers.get("cache-control") ?? "",
      /public, max-age=\d+/,
    );
    const etag = first.headers.get("etag");
    assert.ok(etag);
    // The plain http client is used here: fetch adds its own cache directives to conditional requests.
    const second = await new Promise<number>((resolve, reject) => {
      http
        .get(
          `${server.base}${ONE_STOP}`,
          { headers: { "If-None-Match": etag } },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        )
        .on("error", reject);
    });
    assert.equal(second, 304);
    // Live operational data is never cached.
    const live = await fetch(`${server.base}/api/operations/cases`);
    assert.doesNotMatch(live.headers.get("cache-control") ?? "", /public/);
  } finally {
    await server.close();
  }
});

const tight: LimitConfig = {
  safety: { perSecond: 1000, burst: 1000, shedAbove: Infinity },
  operator: { perSecond: 1000, burst: 1000, shedAbove: 1000 },
  passenger: { perSecond: 1000, burst: 1000, shedAbove: 1000 },
  browse: { perSecond: 0.001, burst: 3, shedAbove: 1000 },
};

test("a client over its rate gets 429 with Retry-After while a bus keeps being heard", async () => {
  const server = await serve({ rateLimit: tight });
  try {
    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${server.base}${NEARBY}`);
      statuses.push(response.status);
      if (response.status === 429)
        assert.ok(Number(response.headers.get("retry-after")) >= 1);
    }
    assert.ok(statuses.includes(429), `expected a 429 in ${statuses}`);
    for (let index = 0; index < 20; index += 1) {
      const posted = await requestJson(
        server.base,
        "/api/operations/vehicles/AV-1/status",
        {
          method: "POST",
          body: JSON.stringify({
            busService: "95",
            movement: "DEPARTING",
            simulated: true,
            observedAt: new Date().toISOString(),
          }),
        },
      );
      assert.equal(posted.status, 202);
    }
  } finally {
    await server.close();
  }
});

test("under overload browsing is shed first and acknowledgements still succeed", async () => {
  const shed: LimitConfig = {
    ...tight,
    browse: { perSecond: 1000, burst: 1000, shedAbove: -1 },
  };
  const server = await serve({ rateLimit: shed });
  try {
    assert.equal((await fetch(`${server.base}${NEARBY}`)).status, 429);
    const ack = await requestJson(
      server.base,
      "/api/operations/vehicles/AV-1/assist-ack",
      {
        method: "POST",
        body: JSON.stringify({ requestId: "REQ-NOPE" }),
      },
    );
    assert.equal(
      ack.status,
      404,
      "the acknowledgement was processed, not shed",
    );
  } finally {
    await server.close();
  }
});

test("rate limiting can be switched off", async () => {
  const server = await serve({ rateLimit: false });
  try {
    for (let index = 0; index < 20; index += 1) {
      assert.notEqual((await fetch(`${server.base}${NEARBY}`)).status, 429);
    }
  } finally {
    await server.close();
  }
});
