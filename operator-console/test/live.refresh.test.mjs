// A quiet, healthy bus must not look offline: its heartbeats refresh the stored report time on the
// backend but are not pushed, so the console re-reads the reports every few seconds.
import test from "node:test";
import assert from "node:assert/strict";
import { createLiveSource } from "../src/live/source.js";
import { reportAge } from "../src/viewmodel.js";

let statusTime = "2026-10-05T00:00:00.000Z";
const metrics = {
  totalCases: 0,
  activeCases: 0,
  escalatedCases: 0,
  failedCases: 0,
  completedCases: 0,
};

function fetchFn() {
  return async (url) => {
    const { pathname } = new URL(url);
    const body = {
      "/api/operations/bus-status": {
        statuses: [
          {
            busId: "AV-1",
            busService: "95",
            stopCode: "18331",
            movement: "POSITIONED_AT_STOP",
            simulated: false,
            observedAt: statusTime,
          },
        ],
      },
      "/api/operations/metrics": metrics,
      "/api/operations/devices": {
        devices: [
          {
            deviceId: "AV-1",
            busId: "AV-1",
            networkOnline: true,
            observedAt: new Date().toISOString(),
          },
        ],
      },
    }[pathname] ?? { records: [], requests: [], events: [], cases: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
}

const socket = class {
  constructor() {
    this.readyState = 1;
  }
  send() {}
  close() {}
};

test("the console re-reads the bus reports on a timer, so a heartbeat keeps a quiet bus fresh", async () => {
  const scheduled = [];
  const source = createLiveSource({
    baseUrl: "http://x",
    fetchFn: fetchFn(),
    WebSocketCtor: socket,
    schedule: (fn, ms) => {
      scheduled.push({ fn, ms });
      return () => {};
    },
  });
  source.start();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    source.state.buses["AV-1"].status.observedAt,
    "2026-10-05T00:00:00.000Z",
  );
  statusTime = "2026-10-05T00:00:20.000Z"; // heartbeats refreshed it; nothing was pushed
  const refresh = scheduled.find(
    (entry) => entry.ms >= 1000 && entry.ms <= 10000,
  );
  assert.ok(refresh, "a refresh was scheduled every few seconds");
  await refresh.fn();
  assert.equal(
    source.state.buses["AV-1"].status.observedAt,
    "2026-10-05T00:00:20.000Z",
  );
  const age = reportAge(
    source.state,
    "AV-1",
    Date.parse("2026-10-05T00:00:25.000Z"),
  );
  assert.equal(age.stale, false);
  source.stop();
});
