#!/usr/bin/env node
/**
 * Checks, with two REAL backend processes, what decision 0005 promises about running more
 * than one.
 *
 *   Part 1 (needs Redis): an event published by one process reaches an operator connected to
 *   the other exactly once, and a scoped operator still sees nothing outside its scope.
 *
 *   Part 2 (also needs Postgres): the two processes share their data and their locks. A bus
 *   status posted to one is readable from the other, its audit event is visible from both,
 *   and 20 passengers asking at the same moment through BOTH processes end up on ONE case
 *   with nobody lost. A control run with per-process locks shows the race the shared lock
 *   removes (informational: it can occasionally pass by luck).
 *
 *   npm run build --workspace @buspass/backend
 *   npm install --no-save --workspace @buspass/backend ioredis pg     # neither is a dependency
 *   GOASSIST_REDIS_URL=redis://localhost:6379 \
 *   GOASSIST_DATABASE_URL=postgres://user:PASSWORD@localhost:5432/dbname \
 *   npm run check:multi-process
 *
 * Without GOASSIST_DATABASE_URL only part 1 runs. Part 2 works in a throwaway schema that is
 * dropped afterwards. Secrets come from the environment only.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WebSocket = require("ws");

const redisUrl = process.env.GOASSIST_REDIS_URL ?? "redis://localhost:6379";
const databaseUrl = process.env.GOASSIST_DATABASE_URL;
const server = join(root, "backend", "dist", "server.js");
const ports = [
  Number(process.env.CHECK_PORT_A ?? 3110),
  Number(process.env.CHECK_PORT_B ?? 3120),
];
const failures = [];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};
const note = (message) => console.log(`NOTE  ${message}`);

/** Starts the two processes with `extraEnv`, runs `work`, then stops them. */
async function withTwoProcesses(extraEnv, work) {
  const children = [];
  const directories = [];
  try {
    for (const port of ports) {
      const data = mkdtempSync(join(tmpdir(), "goassist-xp-"));
      directories.push(data);
      children.push(
        spawn(process.execPath, [server], {
          env: {
            ...process.env,
            PORT: String(port),
            GOASSIST_DATA_DIR: data,
            GOASSIST_EVENT_BUS: "redis",
            GOASSIST_REDIS_URL: redisUrl,
            GOASSIST_AUTO_ACK: "off",
            GOASSIST_OPERATOR_TOKEN: "",
            GOASSIST_DEVICE_SECRET: "",
            GOASSIST_RATE_LIMIT: "off",
            // Part 1 must not inherit the shared database: each process keeps its own data.
            GOASSIST_DATABASE_URL: "",
            GOASSIST_LOCKS: "memory",
            ...extraEnv,
          },
          stdio: "ignore",
        }),
      );
    }
    for (const port of ports) await waitForHealth(port);
    await work(ports);
  } finally {
    for (const child of children) child.kill();
    await sleep(500);
    for (const directory of directories) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the files; the temp directory is disposable.
      }
    }
  }
}

async function waitForHealth(port) {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`http://localhost:${port}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error(`backend on port ${port} did not start`);
}

async function operator(port, scope = {}) {
  const socket = new WebSocket(`ws://localhost:${port}`);
  const messages = [];
  socket.on("message", (data) => messages.push(JSON.parse(String(data))));
  await new Promise((open, fail) => {
    socket.on("open", open);
    socket.on("error", fail);
  });
  socket.send(JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", ...scope }));
  for (
    let i = 0;
    i < 50 && !messages.some((m) => m.type === "SUBSCRIBED_OPERATIONS");
    i += 1
  )
    await sleep(50);
  return { socket, messages };
}

const postStatus = (port, busId) =>
  fetch(`http://localhost:${port}/api/operations/vehicles/${busId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      busService: "95",
      stopCode: "18331",
      movement: "POSITIONED_AT_STOP",
      simulated: true,
      observedAt: new Date().toISOString(),
    }),
  });

async function received(watcher, busId, milliseconds = 4000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (
      watcher.messages.some(
        (m) => m.type === "BUS_STATUS" && m.status?.busId === busId,
      )
    )
      return true;
    await sleep(50);
  }
  return false;
}

const getJson = async (port, path) => {
  const response = await fetch(`http://localhost:${port}${path}`);
  return {
    status: response.status,
    body: response.ok ? await response.json() : undefined,
  };
};

/** Twenty passengers ask at once, alternating between the two processes. */
async function burst([portA, portB], stopCode) {
  const passengers = 20;
  await Promise.all(
    Array.from({ length: passengers }, (_, n) =>
      fetch(
        `http://localhost:${n % 2 === 0 ? portA : portB}/api/operations/passenger-help`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stopCode,
            busId: "BUS-95-01",
            busService: "95",
            anonymousToken: `passenger-${stopCode}-${n}`,
            idempotencyKey: `burst-${stopCode}-${n}`,
          }),
        },
      ),
    ),
  );
  const { body } = await getJson(
    portA,
    "/api/operations/cases?busId=BUS-95-01",
  );
  const cases = (body?.cases ?? []).filter(
    (item) => item.stopCode === stopCode,
  );
  const intents = cases.reduce((sum, item) => sum + item.intents.length, 0);
  return { passengers, cases: cases.length, intents };
}

async function partOneEvents() {
  console.log(
    "\n-- Part 1: events shared through Redis (each process keeps its own data) --",
  );
  await withTwoProcesses({}, async ([portA, portB]) => {
    const onA = await operator(portA);
    const onB = await operator(portB);
    const scopedOnA = await operator(portA, { buses: ["AV-XP-OTHER"] });
    await sleep(300);
    const first = await postStatus(portB, "AV-XP-01");
    check(
      first.status === 202,
      `bus status accepted by process B (HTTP ${first.status})`,
    );
    check(
      await received(onA, "AV-XP-01"),
      "an operator on process A receives the event published by process B",
    );
    check(
      await received(onB, "AV-XP-01"),
      "an operator on process B receives its own process's event through Redis",
    );
    const second = await postStatus(portA, "AV-XP-02");
    check(
      second.status === 202,
      `bus status accepted by process A (HTTP ${second.status})`,
    );
    check(
      await received(onB, "AV-XP-02"),
      "an operator on process B receives the event published by process A",
    );
    await sleep(300);
    const once = onA.messages.filter(
      (m) => m.type === "BUS_STATUS" && m.status?.busId === "AV-XP-01",
    ).length;
    check(once === 1, `the operator on A is told once, not twice (${once})`);
    check(
      !scopedOnA.messages.some((m) => m.type === "BUS_STATUS"),
      "an operator scoped to another bus receives nothing",
    );
    const read = await getJson(
      portA,
      "/api/operations/vehicles/AV-XP-01/status",
    );
    note(
      `the same bus read from process A returns HTTP ${read.status}: with separate SQLite files pushes are shared, data is not`,
    );
    for (const w of [onA, onB, scopedOnA]) w.socket.close();
  });
}

async function partTwoSharedData() {
  console.log("\n-- Part 2: data and locks shared through Postgres --");
  const { Pool } = require("pg");
  const schema = `xp_${crypto.randomBytes(5).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const joiner = databaseUrl.includes("?") ? "&" : "?";
  const url = `${databaseUrl}${joiner}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
  try {
    await withTwoProcesses(
      { GOASSIST_DATABASE_URL: url, GOASSIST_LOCKS: "database" },
      async (both) => {
        const [portA, portB] = both;
        const posted = await postStatus(portB, "AV-XP-SHARED");
        check(
          posted.status === 202,
          `bus status accepted by process B (HTTP ${posted.status})`,
        );
        const read = await getJson(
          portA,
          "/api/operations/vehicles/AV-XP-SHARED/status",
        );
        check(
          read.status === 200 && read.body?.busId === "AV-XP-SHARED",
          "the bus status posted to B is readable from A (shared data)",
        );
        await sleep(150);
        const audit = await getJson(
          portA,
          "/api/operations/audit?busId=AV-XP-SHARED&limit=10",
        );
        check(
          audit.status === 200 &&
            audit.body.events.some((e) => e.eventType === "BUS_STATUS_CHANGED"),
          "the audit event written by B is visible from A",
        );
        const result = await burst(both, "18331");
        check(
          result.cases === 1 && result.intents === result.passengers,
          `${result.passengers} passengers asking at once through both processes end on one case with nobody lost (${result.cases} case, ${result.intents} intents)`,
        );
      },
    );
    console.log(
      "\n-- Control: the same burst with each process holding only its own lock --",
    );
    await withTwoProcesses(
      { GOASSIST_DATABASE_URL: url, GOASSIST_LOCKS: "memory" },
      async (both) => {
        const result = await burst(both, "18332");
        note(
          result.cases === 1 && result.intents === result.passengers
            ? `no race showed this time (${result.cases} case, ${result.intents} intents); it can pass by luck`
            : `the race shows without the shared lock: ${result.cases} cases, ${result.intents} of ${result.passengers} intents`,
        );
      },
    );
  } finally {
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}

try {
  await partOneEvents();
  if (databaseUrl) await partTwoSharedData();
  else
    note(
      "GOASSIST_DATABASE_URL is not set, so part 2 (shared data and locks) was not run",
    );
} catch (error) {
  failures.push(String(error));
  console.log(`FAIL  ${error}`);
}

console.log(
  failures.length === 0
    ? "\nAll checks passed."
    : `\n${failures.length} check(s) failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
