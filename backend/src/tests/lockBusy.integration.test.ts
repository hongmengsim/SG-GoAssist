import test from "node:test";
import assert from "node:assert/strict";
import { configureLock } from "../concurrency/locks";
import { InProcessKeyedLock, LockBusyError } from "../concurrency/keyedLock";
import { requestJson, startTestServer } from "./helpers/integration";

test("a route whose lock queue is full answers 503 with a retry hint, not 500", async () => {
  configureLock({
    run: async () => {
      throw new LockBusyError("bus:AV-1", 1000);
    },
  });
  const server = await startTestServer();
  try {
    const response = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-1/status",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          busService: "95",
          stopCode: "18331",
          movement: "TRAVELLING_TO_STOP",
          simulated: true,
          observedAt: new Date().toISOString(),
        }),
      },
    );
    assert.equal(response.status, 503);
  } finally {
    configureLock(new InProcessKeyedLock());
    await server.close();
  }
});
