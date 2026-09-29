import test from "node:test";
import assert from "node:assert/strict";
import type { BayStatus } from "@buspass/shared";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";

const STOP = "18331";

function report(busId: string, movement: string, extra = {}) {
  return requestJson(
    baseUrlRef.value,
    `/api/operations/vehicles/${busId}/status`,
    {
      method: "POST",
      body: JSON.stringify({
        busService: "95",
        stopCode: STOP,
        movement,
        simulated: true,
        observedAt: new Date().toISOString(),
        ...extra,
      }),
    },
  );
}

const baseUrlRef = { value: "" };

async function bay(): Promise<BayStatus> {
  const response = await requestJson(
    baseUrlRef.value,
    `/api/operations/bays/${STOP}`,
  );
  assert.equal(response.status, 200);
  return response.body;
}

function proceed() {
  return requestJson(baseUrlRef.value, `/api/operations/bays/${STOP}/proceed`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function withServer(work: () => Promise<void>) {
  const server = await startTestServer();
  baseUrlRef.value = server.baseUrl;
  try {
    await work();
  } finally {
    await server.close();
  }
}

test("a stop with no buses has an empty bay", async () => {
  await withServer(async () => {
    const empty = await bay();
    assert.equal(empty.occupantBusId, null);
    assert.deepEqual(empty.waitingBusIds, []);
  });
});

test("Bus 1 occupies the bay, Bus 2 waits, the controller grants, Bus 2 enters after Bus 1 leaves", async () => {
  await withServer(async () => {
    assert.equal((await report("AV-095-01", "POSITIONED_AT_STOP")).status, 202);
    assert.equal((await bay()).occupantBusId, "AV-095-01");

    await report("AV-095-02", "WAITING_FOR_BAY");
    assert.deepEqual((await bay()).waitingBusIds, ["AV-095-02"]);

    assert.equal((await proceed()).status, 409, "bay is still occupied");

    await report("AV-095-01", "DEPARTING");
    const afterDeparture = await bay();
    assert.equal(afterDeparture.occupantBusId, null);
    assert.equal(afterDeparture.grantedBusId, null, "departure grants nobody");

    const refused = await report("AV-095-02", "POSITIONED_AT_STOP");
    assert.equal(refused.status, 409, "entry without a grant is refused");

    const granted = await proceed();
    assert.equal(granted.status, 200);
    assert.equal(granted.body.grantedBusId, "AV-095-02");

    assert.equal((await report("AV-095-02", "POSITIONED_AT_STOP")).status, 202);
    const final = await bay();
    assert.equal(final.occupantBusId, "AV-095-02");
    assert.equal(final.grantedBusId, null);
  });
});

test("a refused entry does not overwrite the bus's stored status", async () => {
  await withServer(async () => {
    await report("AV-095-01", "POSITIONED_AT_STOP");
    await report("AV-095-02", "WAITING_FOR_BAY");
    assert.equal((await report("AV-095-02", "POSITIONED_AT_STOP")).status, 409);
    const stored = await requestJson(
      baseUrlRef.value,
      "/api/operations/vehicles/AV-095-02/status",
    );
    assert.equal(stored.body.movement, "WAITING_FOR_BAY");
  });
});

test("proceed with nobody waiting is refused", async () => {
  await withServer(async () => {
    assert.equal((await proceed()).status, 409);
  });
});

test("when an operator token is set, reading and granting need it", async () => {
  const previous = process.env.OPERATOR_API_TOKEN;
  process.env.OPERATOR_API_TOKEN = "op-token";
  try {
    await withServer(async () => {
      assert.equal(
        (await requestJson(baseUrlRef.value, `/api/operations/bays/${STOP}`))
          .status,
        401,
      );
      assert.equal((await proceed()).status, 401);
    });
  } finally {
    if (previous === undefined) delete process.env.OPERATOR_API_TOKEN;
    else process.env.OPERATOR_API_TOKEN = previous;
  }
});

test("bay changes reach operators scoped to that stop and no one else", async () => {
  const server = await startTestServer();
  baseUrlRef.value = server.baseUrl;
  const sockets: Connection[] = [];
  try {
    const here = await connect(server.wsUrl);
    const elsewhere = await connect(server.wsUrl);
    sockets.push(here, elsewhere);
    here.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", stops: [STOP] }),
    );
    elsewhere.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", stops: ["99999"] }),
    );
    await here.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    await elsewhere.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");

    await report("AV-095-01", "POSITIONED_AT_STOP");
    await here.waitFor(
      (m) =>
        m.type === "BAY_STATUS" &&
        (m.bay as BayStatus).occupantBusId === "AV-095-01",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(!elsewhere.messages.some((m) => m.type === "BAY_STATUS"));
  } finally {
    sockets.forEach((connection) => connection.socket.close());
    await server.close();
  }
});
