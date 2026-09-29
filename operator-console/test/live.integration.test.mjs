// Runs the built backend for real and checks that the console's live source, given only what
// the backend actually sends, builds the picture the views expect. Skipped when the backend has
// not been built (npm run build --workspace @buspass/backend).
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLiveSource } from "../src/live/source.js";
import { busCategories, stopView } from "../src/viewmodel.js";

const entry = fileURLToPath(
  new URL("../../backend/dist/server.js", import.meta.url),
);
const skip = existsSync(entry)
  ? undefined
  : "backend/dist/server.js is missing: build the backend first";
const STOP = "18331";
const B1 = "AV-095-01";
const B2 = "AV-095-02";

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

async function until(condition, message, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for: ${message}`);
}

async function withBackend(work) {
  const port = await freePort();
  const data = mkdtempSync(join(tmpdir(), "console-live-"));
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      PORT: String(port),
      GOASSIST_DATA_DIR: data,
      GOASSIST_AUTO_ACK: "off",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100; i += 1) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await work(base);
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      rmSync(data, { recursive: true, force: true });
    } catch {
      // Windows may still hold the database file for a moment; the folder is disposable.
    }
  }
}

const post = (base, path, body, method = "POST") =>
  fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const now = () => new Date().toISOString();

test(
  "the live source builds the console's picture from a real backend",
  { skip },
  async () => {
    await withBackend(async (base) => {
      const source = createLiveSource({ baseUrl: base });
      source.start();
      try {
        await until(
          () => source.connection.status === "connected",
          "the socket to subscribe",
        );

        const bus = (id, movement) =>
          post(base, `/api/operations/vehicles/${id}/status`, {
            busService: "95",
            stopCode: STOP,
            movement,
            simulated: true,
            observedAt: now(),
          });
        assert.equal((await bus(B1, "POSITIONED_AT_STOP")).status, 202);
        assert.equal((await bus(B2, "WAITING_FOR_BAY")).status, 202);
        await post(base, `/api/operations/vehicles/${B1}/ramp-simulation`, {
          state: "STOWED",
          simulated: true,
          observedAt: now(),
        });
        await post(base, `/api/operations/vehicles/${B1}/safety-decision`, {
          zoneState: "CLEAR",
          permission: "CONTINUE",
          reasons: [],
          tof: { state: "BEAM_CLEAR", simulated: true },
          camera: { imageOk: true },
          objectsInZone: [],
          simulated: true,
          observedAt: now(),
        });

        await until(
          () =>
            source.state.buses[B1]?.status &&
            source.state.buses[B2]?.status &&
            source.state.bays[STOP],
          "buses and bay pushed to the console",
        );
        assert.equal(source.state.bays[STOP].occupantBusId, B1);
        assert.deepEqual(source.state.bays[STOP].waitingBusIds, [B2]);
        await until(
          () => source.state.buses[B1].decision && source.state.buses[B1].ramp,
          "the decision and the ramp state to arrive",
        );

        const cats = busCategories(source.state, B1);
        assert.equal(cats[0].value, "Positioned at stop");
        assert.equal(cats[2].value, "Stowed");
        assert.equal(cats[3].value, "Continue");

        await until(
          () => source.state.audit.length > 0,
          "the audit log to load",
        );
        assert.ok(
          source.state.audit.some(
            (event) => event.eventType === "BUS_STATUS_CHANGED",
          ),
        );

        // Bus 1 leaves; the console offers to proceed; doing so grants Bus 2 through the backend.
        await bus(B1, "DEPARTING");
        await until(
          () => stopView(source.state, STOP).canProceed,
          "proceed to become available",
        );
        assert.equal(source.actionsFor(undefined, STOP).proceed.enabled, true);
        const result = await source.perform("proceed", { stopCode: STOP });
        assert.deepEqual([result.ok, result.message], [true, "Done."]);
        await until(
          () => source.state.bays[STOP].grantedBusId === B2,
          "the grant to reach the console",
        );
        await until(
          () =>
            source.state.audit.some(
              (event) => event.eventType === "BAY_ENTRY_GRANTED",
            ),
          "the grant to appear in the audit log",
        );
      } finally {
        source.stop();
      }
    });
  },
);

test(
  "a passenger request shows up with its case, and the operator can cancel it",
  { skip },
  async () => {
    await withBackend(async (base) => {
      const source = createLiveSource({ baseUrl: base });
      source.start();
      try {
        await until(
          () => source.connection.status === "connected",
          "the socket to subscribe",
        );
        await post(base, `/api/operations/vehicles/${B1}/status`, {
          busService: "95",
          stopCode: STOP,
          movement: "POSITIONED_AT_STOP",
          simulated: true,
          observedAt: now(),
        });
        const created = await (
          await post(base, "/api/assistance/request", {
            sessionId: "live-test",
            busService: "95",
            busId: B1,
            boardingStop: "18301",
            stopCode: STOP,
            assistanceTypes: ["WHEELCHAIR_RAMP"],
            source: "MOBILE_APP",
            boardingOrAlighting: "BOARDING",
          })
        ).json();

        await until(
          () => source.state.requests[created.requestId]?.caseId,
          "the request and its case to reach the console",
        );
        assert.equal(
          "sessionId" in source.state.requests[created.requestId],
          false,
        );
        await until(
          () => source.actionsFor(B1, STOP).cancel.enabled,
          "cancel to become available",
        );
        assert.equal(source.actionsFor(B1, STOP).deploy.enabled, false);
        assert.equal(source.actionsFor(B1, STOP).halt.enabled, true);

        const result = await source.perform("cancel", { busId: B1 });
        assert.equal(result.ok, true, result.message);
      } finally {
        source.stop();
      }
    });
  },
);
