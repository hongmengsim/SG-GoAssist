#!/usr/bin/env node
/**
 * Checks, against a REAL Redis server, that an event published by one backend process reaches
 * an operator connected to another (decision 0005, step 2). It starts two backend processes on
 * different ports with separate data directories, both using the Redis event bus.
 *
 *   npm run build --workspace @buspass/backend
 *   npm install --no-save --workspace @buspass/backend ioredis      # the client is not a dependency
 *   GOASSIST_REDIS_URL=redis://localhost:6379 npm run check:multi-process
 *
 * It does NOT check shared data: each process has its own SQLite files, so a read on the other
 * process still returns 404. The script prints that, so nobody mistakes push sharing for a
 * multi-process backend.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WebSocket = require("ws");

const redisUrl = process.env.GOASSIST_REDIS_URL ?? "redis://localhost:6379";
const server = join(root, "backend", "dist", "server.js");
const ports = [
  Number(process.env.CHECK_PORT_A ?? 3110),
  Number(process.env.CHECK_PORT_B ?? 3120),
];
const children = [];
const directories = [];
const failures = [];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};

function start(port) {
  const data = mkdtempSync(join(tmpdir(), "goassist-xp-"));
  directories.push(data);
  const child = spawn(process.execPath, [server], {
    env: {
      ...process.env,
      PORT: String(port),
      GOASSIST_DATA_DIR: data,
      GOASSIST_EVENT_BUS: "redis",
      GOASSIST_REDIS_URL: redisUrl,
      GOASSIST_AUTO_ACK: "off",
      GOASSIST_OPERATOR_TOKEN: "",
      GOASSIST_DEVICE_SECRET: "",
    },
    stdio: "ignore",
  });
  children.push(child);
  return child;
}

async function waitForHealth(port) {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`http://localhost:${port}/health`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  throw new Error(`backend on port ${port} did not start`);
}

/** Connects an operator socket and returns the messages it receives. */
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

async function postStatus(port, busId) {
  return fetch(
    `http://localhost:${port}/api/operations/vehicles/${busId}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        busService: "95",
        stopCode: "18331",
        movement: "POSITIONED_AT_STOP",
        simulated: true,
        observedAt: new Date().toISOString(),
      }),
    },
  );
}

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

try {
  const [portA, portB] = ports;
  start(portA);
  start(portB);
  await waitForHealth(portA);
  await waitForHealth(portB);

  const onA = await operator(portA);
  const onB = await operator(portB);
  const scopedOnA = await operator(portA, { buses: ["AV-XP-OTHER"] });
  await sleep(300); // let each process join its Redis channels

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
    "an operator on process B receives its own process's event once it has been through Redis",
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
  const onceOnA = onA.messages.filter(
    (m) => m.type === "BUS_STATUS" && m.status?.busId === "AV-XP-01",
  ).length;
  check(
    onceOnA === 1,
    `the operator on A is told once, not twice (${onceOnA})`,
  );
  check(
    !scopedOnA.messages.some((m) => m.type === "BUS_STATUS"),
    "an operator scoped to another bus receives nothing",
  );

  const readOnA = await fetch(
    `http://localhost:${portA}/api/operations/vehicles/AV-XP-01/status`,
  );
  console.log(
    `NOTE  the same bus read from process A returns HTTP ${readOnA.status}: pushes are shared, data is not (each process has its own SQLite files)`,
  );
  for (const w of [onA, onB, scopedOnA]) w.socket.close();
} catch (error) {
  failures.push(String(error));
  console.log(`FAIL  ${error}`);
} finally {
  for (const child of children) child.kill();
  await sleep(400);
  for (const directory of directories) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows may still hold the database files; the temp directory is disposable.
    }
  }
}

console.log(
  failures.length === 0
    ? "\nAll checks passed against a real Redis."
    : `\n${failures.length} check(s) failed.`,
);
process.exit(failures.length === 0 ? 0 : 1);
