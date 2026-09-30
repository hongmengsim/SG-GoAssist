#!/usr/bin/env node
/**
 * Load test for the backend's bus ingest and overload behaviour (scalability plan, section 9).
 *
 *   node scripts/load-test.mjs                      default: 100 status messages/s for 10 s
 *   node scripts/load-test.mjs --rate 1000 --seconds 20 --buses 2000
 *   node scripts/load-test.mjs --overload           browsing flood must not stop acknowledgements
 *   node scripts/load-test.mjs --processes 2        two backend processes, requests alternate between them
 *                                                   (set GOASSIST_DATABASE_URL, GOASSIST_REDIS_URL,
 *                                                   GOASSIST_EVENT_BUS=redis and GOASSIST_LOCKS=database
 *                                                   to share data, events and locks; without them each
 *                                                   process keeps its own SQLite files)
 *
 * It starts the built backend on a free port with its real SQLite storage, then drives it open
 * loop (requests are issued on schedule whether or not earlier ones finished, as real buses do).
 * Pass/fail thresholds: --p95-ms (default 100) and --min-success (default 0.99). It reports what it
 * measured on this machine; it proves the shape, not production capacity.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(args[index + 1]);
};
const RATE = flag("rate", 100);
const SECONDS = flag("seconds", 10);
const BUSES = flag("buses", 500);
const CHANGE_RATIO = flag("change-ratio", 0.05);
const P95_LIMIT = flag("p95-ms", 100);
const MIN_SUCCESS = flag("min-success", 0.99);
const OVERLOAD = args.includes("--overload");
const PROCESSES = Math.max(1, Math.trunc(flag("processes", 1)));
// By default every bus has already reported once, as in a running system. The one-time storm of first
// reports (each is a change, so each is audited) is a different question: pass --cold to include it.
const COLD = args.includes("--cold");

const agent = new http.Agent({ keepAlive: true, maxSockets: 128 });

/** One request over a kept-alive connection; resolves to the status code. */
function request(base, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(
      {
        agent,
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const freePort = () =>
  new Promise((done) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const percentile = (sorted, rank) =>
  sorted.length === 0
    ? 0
    : sorted[Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1)];

async function startBackend() {
  const entry = join(root, "backend", "dist", "server.js");
  if (!existsSync(entry))
    throw new Error(
      "backend/dist/server.js is missing: run npm run build first",
    );
  const port = await freePort();
  const data = mkdtempSync(join(tmpdir(), "goassist-load-"));
  const child = spawn(process.execPath, [entry], {
    cwd: join(root, "backend"),
    env: {
      ...process.env,
      PORT: String(port),
      GOASSIST_DATA_DIR: data,
      GOASSIST_AUTO_ACK: "off",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { base, child, data };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill();
  throw new Error("the backend did not start");
}

async function stopBackend({ child, data }) {
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  try {
    rmSync(data, { recursive: true, force: true });
  } catch {
    // Windows may hold the database file for a moment; the folder is disposable.
  }
}

const MOVEMENTS = ["TRAVELLING_TO_STOP", "WAITING_FOR_BAY", "DEPARTING"];

/** Sends status messages at RATE per second for SECONDS, open loop. */
async function drive(
  base,
  { rate, seconds, buses, changeRatio, headers = {} },
) {
  const latencies = [];
  const statuses = {};
  const state = new Map();
  let sent = 0;
  let pending = 0;
  const started = performance.now();
  const total = Math.round(rate * seconds);

  const send = async () => {
    const index = sent % buses;
    const busId = `LOAD-${String(index).padStart(5, "0")}`;
    sent += 1;
    let movement = state.get(busId) ?? MOVEMENTS[0];
    if (Math.random() < changeRatio) {
      movement =
        MOVEMENTS[(MOVEMENTS.indexOf(movement) + 1) % MOVEMENTS.length];
    }
    state.set(busId, movement);
    pending += 1;
    const t0 = performance.now();
    const target = Array.isArray(base) ? base[(sent - 1) % base.length] : base;
    try {
      const payload = JSON.stringify({
        busService: "95",
        movement,
        simulated: true,
        observedAt: new Date().toISOString(),
      });
      const status = await request(
        target,
        "POST",
        `/api/operations/vehicles/${busId}/status`,
        {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "x-device-id": busId,
          ...headers,
        },
        payload,
      );
      statuses[status] = (statuses[status] ?? 0) + 1;
    } catch {
      statuses.error = (statuses.error ?? 0) + 1;
    } finally {
      latencies.push(performance.now() - t0);
      pending -= 1;
    }
  };

  while (sent < total) {
    const due = Math.floor(((performance.now() - started) / 1000) * rate) + 1;
    while (sent < Math.min(due, total)) void send();
    await new Promise((r) => setTimeout(r, 5));
  }
  const deadline = performance.now() + 10_000;
  while (pending > 0 && performance.now() < deadline)
    await new Promise((r) => setTimeout(r, 20));
  const sorted = [...latencies].sort((a, b) => a - b);
  const ok = (statuses[202] ?? 0) / Math.max(1, total);
  return {
    sent: total,
    unfinished: pending,
    seconds: (performance.now() - started) / 1000,
    statuses,
    successRatio: ok,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.at(-1) ?? 0,
  };
}

/** Every bus reports once before measuring, gently, so the measurement is the steady state. */
async function warmUp(base) {
  const WARM_RATE = 100;
  await drive(base, {
    rate: WARM_RATE,
    seconds: Math.ceil(BUSES / WARM_RATE),
    buses: BUSES,
    changeRatio: 0,
  });
}

async function sustained(backend) {
  if (!COLD) await warmUp(backend.base);
  console.log(
    `${COLD ? "Cold start (first reports included)" : "Steady state"}. Sustained ingest: ${RATE} status messages/s for ${SECONDS}s from ${BUSES} buses (${Math.round(CHANGE_RATIO * 100)}% change movement)`,
  );
  const result = await drive(backend.base, {
    rate: RATE,
    seconds: SECONDS,
    buses: BUSES,
    changeRatio: CHANGE_RATIO,
  });
  const achieved = result.sent / result.seconds;
  console.log(
    `  achieved ${achieved.toFixed(0)} msg/s, statuses ${JSON.stringify(result.statuses)}, unfinished ${result.unfinished}`,
  );
  console.log(
    `  latency ms: p50 ${result.p50.toFixed(1)}  p95 ${result.p95.toFixed(1)}  p99 ${result.p99.toFixed(1)}  max ${result.max.toFixed(1)}`,
  );
  const pass =
    result.p95 <= P95_LIMIT &&
    result.successRatio >= MIN_SUCCESS &&
    result.unfinished === 0;
  console.log(
    `  ${pass ? "PASS" : "FAIL"}: p95 <= ${P95_LIMIT} ms and success >= ${MIN_SUCCESS} (was ${(result.successRatio * 100).toFixed(2)}%)`,
  );
  return pass;
}

async function overload(backend) {
  if (!COLD) await warmUp(backend.base);
  console.log(
    "Overload: a browsing flood from one client while buses keep reporting",
  );
  const flood = (async () => {
    const counts = {};
    const end = performance.now() + SECONDS * 1000;
    while (performance.now() < end) {
      const batch = await Promise.all(
        Array.from({ length: 50 }, () =>
          request(
            backend.base[0],
            "GET",
            "/api/bus-stops/nearby?lat=1.3&lng=103.8",
          ).catch(() => "error"),
        ),
      );
      for (const status of batch) counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  })();
  const buses = await drive(backend.base, {
    rate: RATE,
    seconds: SECONDS,
    buses: BUSES,
    changeRatio: CHANGE_RATIO,
  });
  const browsing = await flood;
  console.log(`  browsing responses ${JSON.stringify(browsing)}`);
  console.log(
    `  bus status: ${JSON.stringify(buses.statuses)}, p95 ${buses.p95.toFixed(1)} ms`,
  );
  const shed = (browsing[429] ?? 0) > 0;
  const heard = buses.successRatio >= MIN_SUCCESS;
  console.log(
    `  ${shed && heard ? "PASS" : "FAIL"}: browsing was refused (429) ${shed ? "yes" : "no"}; buses still heard ${heard ? "yes" : "no"}`,
  );
  return shed && heard;
}

const started = [];
for (let i = 0; i < PROCESSES; i += 1) started.push(await startBackend());
const backend = { base: started.map((b) => b.base), started };
if (PROCESSES > 1)
  console.log(
    `Running ${PROCESSES} backend processes; requests alternate between them`,
  );
let pass = false;
try {
  pass = OVERLOAD ? await overload(backend) : await sustained(backend);
} finally {
  for (const one of started) await stopBackend(one);
}
process.exit(pass ? 0 : 1);
