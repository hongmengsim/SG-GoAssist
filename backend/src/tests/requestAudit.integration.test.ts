// Who acknowledged a request must be on the record, and a real bus must be told apart from the
// auto-acknowledge timer and from the simulator route.
import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, startTestServer } from "./helpers/integration";

const REQUEST = {
  sessionId: "audit-ack-passenger",
  busService: "95",
  busId: "AV-095-01",
  boardingStop: "18301",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

async function withEnv<T>(name: string, value: string, work: () => Promise<T>) {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

interface AuditEvent {
  eventType: string;
  actor: string;
  busId?: string;
  detail?: Record<string, unknown>;
}

async function auditOf(baseUrl: string, type: string): Promise<AuditEvent[]> {
  const response = await requestJson(
    baseUrl,
    "/api/operations/audit?limit=200",
  );
  return (response.body.events as AuditEvent[]).filter(
    (event) => event.eventType === type,
  );
}

const create = (baseUrl: string, body = REQUEST) =>
  requestJson(baseUrl, "/api/assistance/request", {
    method: "POST",
    body: JSON.stringify(body),
  });

test("a real bus acknowledgement is audited as the vehicle's, once, with the request and bus", async () => {
  await withEnv("GOASSIST_AUTO_ACK", "off", async () => {
    const server = await startTestServer();
    try {
      const created = await create(server.baseUrl);
      const url = `/api/operations/vehicles/AV-095-01/assist-ack`;
      const body = JSON.stringify({ requestId: created.body.requestId });
      await requestJson(server.baseUrl, url, { method: "POST", body });
      await requestJson(server.baseUrl, url, { method: "POST", body }); // a repeat
      const events = await auditOf(server.baseUrl, "REQUEST_ACKNOWLEDGED");
      assert.equal(events.length, 1, "a repeat is not audited again");
      assert.equal(events[0].actor, "VEHICLE");
      assert.equal(events[0].busId, "AV-095-01");
      assert.equal(events[0].detail?.requestId, created.body.requestId);
    } finally {
      await server.close();
    }
  });
});

test("the auto-acknowledge timer is audited under its own name, never as the vehicle", async () => {
  await withEnv("GOASSIST_AUTO_ACK", "on", async () => {
    const server = await startTestServer();
    try {
      await create(server.baseUrl);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const events = await auditOf(server.baseUrl, "REQUEST_ACKNOWLEDGED");
      assert.equal(events.length, 1);
      assert.equal(events[0].actor, "AUTO_ACK");
    } finally {
      await server.close();
    }
  });
});

test("an acknowledgement through the simulator route is audited as the simulator's, not a vehicle's", async () => {
  await withEnv("GOASSIST_AUTO_ACK", "on", async () => {
    const server = await startTestServer();
    try {
      const created = await create(server.baseUrl);
      // Before the 300 ms timer fires, the simulator route acknowledges on the bus's behalf.
      await requestJson(server.baseUrl, "/api/assistance/simulator/command", {
        method: "POST",
        body: JSON.stringify({
          requestId: created.body.requestId,
          command: "ACKNOWLEDGE",
        }),
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const events = await auditOf(server.baseUrl, "REQUEST_ACKNOWLEDGED");
      assert.equal(events.length, 1);
      assert.equal(events[0].actor, "SIMULATOR");
    } finally {
      await server.close();
    }
  });
});

test("a request merged into an active one is audited with both ids", async () => {
  await withEnv("GOASSIST_AUTO_ACK", "off", async () => {
    const server = await startTestServer();
    try {
      const first = await create(server.baseUrl);
      const second = await create(server.baseUrl, {
        ...REQUEST,
        sessionId: "second-passenger",
      });
      assert.equal(second.body.duplicateOfRequestId, first.body.requestId);
      const merged = await auditOf(server.baseUrl, "REQUEST_MERGED");
      assert.equal(merged.length, 1);
      assert.equal(merged[0].detail?.mergedInto, first.body.requestId);
    } finally {
      await server.close();
    }
  });
});
