import test from "node:test";
import assert from "node:assert/strict";
import { createLiveSource } from "../src/live/source.js";

test("a 401 after the console has loaded asks for the token instead of staying Connected", async () => {
  let unauthorised = false;
  const fetchFn = async (url) => {
    if (unauthorised)
      return { ok: false, status: 401, json: async () => ({ error: "Operator token required" }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ statuses: [], records: [], requests: [], events: [], cases: [] }),
    };
  };
  const source = createLiveSource({
    baseUrl: "http://x",
    fetchFn,
    WebSocketCtor: class {
      constructor() {
        this.readyState = 1;
      }
      send() {}
      close() {}
    },
    schedule: () => () => {},
  });
  source.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  unauthorised = true; // the token expired or was changed on the backend
  const result = await source.perform("halt", { busId: "AV-1", release: false });
  assert.equal(result.ok, false);
  assert.equal(source.connection.status, "auth-required");
  source.stop();
});

test("one bay that cannot be read does not abort the whole snapshot", async () => {
  const fetchFn = async (url) => {
    const { pathname } = new URL(url);
    if (pathname.startsWith("/api/operations/bays/"))
      return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
    const data = {
      "/api/operations/bus-status": {
        statuses: [
          { busId: "AV-1", busService: "95", stopCode: "18331", movement: "POSITIONED_AT_STOP", simulated: true, observedAt: "2026-09-30T00:00:00.000Z" },
        ],
      },
    };
    return {
      ok: true,
      status: 200,
      json: async () => data[pathname] ?? { records: [], requests: [], events: [], cases: [] },
    };
  };
  const source = createLiveSource({
    baseUrl: "http://x",
    fetchFn,
    WebSocketCtor: class {
      constructor() {
        this.readyState = 1;
      }
      send() {}
      close() {}
    },
    schedule: () => () => {},
  });
  source.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(source.state.buses["AV-1"], "the bus from the same snapshot is shown");
  source.stop();
});
