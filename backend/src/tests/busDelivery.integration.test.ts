import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";

function passengerRequest(busId: string, sessionId = "delivery-passenger") {
  return {
    sessionId,
    busService: "95",
    busId,
    boardingStop: "18301",
    stopCode: "18301",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
    boardingOrAlighting: "BOARDING",
  };
}

async function create(baseUrl: string, busId: string, sessionId?: string) {
  return requestJson(baseUrl, "/api/assistance/request", {
    method: "POST",
    body: JSON.stringify(passengerRequest(busId, sessionId)),
  });
}

async function subscribeBus(wsUrl: string, buses: string[]) {
  const connection = await connect(wsUrl);
  connection.socket.send(
    JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", buses }),
  );
  await connection.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
  return connection;
}

async function withAutoAckOff(work: () => Promise<void>) {
  const previous = process.env.GOASSIST_AUTO_ACK;
  process.env.GOASSIST_AUTO_ACK = "off";
  try {
    await work();
  } finally {
    if (previous === undefined) delete process.env.GOASSIST_AUTO_ACK;
    else process.env.GOASSIST_AUTO_ACK = previous;
  }
}

test("a new request is pushed to its bus and to no other bus or passenger", async () => {
  await withAutoAckOff(async () => {
    const server = await startTestServer();
    const sockets: Connection[] = [];
    try {
      const bus1 = await subscribeBus(server.wsUrl, ["AV-095-01"]);
      const bus2 = await subscribeBus(server.wsUrl, ["AV-095-02"]);
      const created = await create(server.baseUrl, "AV-095-01");
      const passenger = await connect(server.wsUrl);
      sockets.push(bus1, bus2, passenger);
      passenger.socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          requestId: created.body.requestId,
        }),
      );
      await passenger.waitFor((m) => m.type === "SUBSCRIBED");

      const pushed = await bus1.waitFor((m) => m.type === "ASSIST_REQUESTED");
      const request = pushed.request as Record<string, unknown>;
      assert.equal(request.requestId, created.body.requestId);
      assert.equal(request.busId, "AV-095-01");
      assert.equal(request.boardingStop, "18301");
      assert.deepEqual(request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
      assert.equal(
        "sessionId" in request,
        false,
        "no passenger identity goes to the bus",
      );

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.ok(!bus2.messages.some((m) => m.type === "ASSIST_REQUESTED"));
      assert.ok(!passenger.messages.some((m) => m.type === "ASSIST_REQUESTED"));
    } finally {
      sockets.forEach((connection) => connection.socket.close());
      await server.close();
    }
  });
});

test("a duplicate request is not delivered twice", async () => {
  await withAutoAckOff(async () => {
    const server = await startTestServer();
    let bus: Connection | undefined;
    try {
      bus = await subscribeBus(server.wsUrl, ["AV-095-01"]);
      await create(server.baseUrl, "AV-095-01", "first");
      await create(server.baseUrl, "AV-095-01", "second");
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(
        bus.messages.filter((m) => m.type === "ASSIST_REQUESTED").length,
        1,
      );
    } finally {
      bus?.socket.close();
      await server.close();
    }
  });
});

test("a bus can pull the requests still waiting for it, and only its own", async () => {
  await withAutoAckOff(async () => {
    const server = await startTestServer();
    try {
      const mine = await create(server.baseUrl, "AV-095-01");
      await create(server.baseUrl, "AV-095-02");

      const before = await requestJson(
        server.baseUrl,
        "/api/operations/vehicles/AV-095-01/requests",
      );
      assert.equal(before.status, 200);
      assert.equal(before.body.count, 1);
      assert.equal(before.body.requests[0].requestId, mine.body.requestId);
      assert.equal("sessionId" in before.body.requests[0], false);

      await requestJson(
        server.baseUrl,
        "/api/operations/vehicles/AV-095-01/assist-ack",
        {
          method: "POST",
          body: JSON.stringify({ requestId: mine.body.requestId }),
        },
      );
      const after = await requestJson(
        server.baseUrl,
        "/api/operations/vehicles/AV-095-01/requests",
      );
      assert.equal(
        after.body.count,
        0,
        "an acknowledged request is no longer waiting",
      );
    } finally {
      await server.close();
    }
  });
});

test("the pull is bounded by limit and signed when a device secret is set", async () => {
  const previous = process.env.DEVICE_SHARED_SECRET;
  await withAutoAckOff(async () => {
    const server = await startTestServer();
    try {
      const wide = await requestJson(
        server.baseUrl,
        "/api/operations/vehicles/AV-095-01/requests?limit=1",
      );
      assert.equal(wide.status, 200);
      process.env.DEVICE_SHARED_SECRET = "delivery-secret";
      const unsigned = await requestJson(
        server.baseUrl,
        "/api/operations/vehicles/AV-095-01/requests",
      );
      assert.equal(unsigned.status, 401);
    } finally {
      if (previous === undefined) delete process.env.DEVICE_SHARED_SECRET;
      else process.env.DEVICE_SHARED_SECRET = previous;
      await server.close();
    }
  });
});

test("a bus can pull its acknowledged requests whose case is still open, to take them back after a restart", async () => {
  await withAutoAckOff(async () => {
    const server = await startTestServer();
    try {
      const mine = await create(server.baseUrl, "AV-095-01");
      const cancelled = await create(server.baseUrl, "AV-095-02");
      for (const [bus, created] of [
        ["AV-095-01", mine],
        ["AV-095-02", cancelled],
      ] as const) {
        await requestJson(
          server.baseUrl,
          `/api/operations/vehicles/${bus}/assist-ack`,
          {
            method: "POST",
            body: JSON.stringify({ requestId: created.body.requestId }),
          },
        );
      }
      const list = (bus: string) =>
        requestJson(
          server.baseUrl,
          `/api/operations/vehicles/${bus}/requests?status=ACKNOWLEDGED`,
        );
      const open = await list("AV-095-01");
      assert.equal(open.status, 200);
      assert.deepEqual(
        open.body.requests.map((item: { requestId: string }) => item.requestId),
        [mine.body.requestId],
      );
      // Once its case is cancelled the request is no longer something the bus should hold.
      await requestJson(
        server.baseUrl,
        `/api/operations/cases/${cancelled.body.caseId}/operator`,
        { method: "POST", body: JSON.stringify({ action: "CANCEL" }) },
      );
      assert.equal((await list("AV-095-02")).body.count, 0);
      // The default listing is unchanged: only requests still waiting.
      assert.equal(
        (
          await requestJson(
            server.baseUrl,
            "/api/operations/vehicles/AV-095-01/requests",
          )
        ).body.count,
        0,
      );
    } finally {
      await server.close();
    }
  });
});
