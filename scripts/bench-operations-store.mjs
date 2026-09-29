#!/usr/bin/env node
/**
 * Reproducible measurement of the backend's whole-state persistence cost.
 *
 * The OperationsStore rewrites its entire state on every update and clones it on every
 * snapshot, so the cost of one write grows with everything ever stored. This script
 * measures that growth for both storage drivers and prints a Markdown table that can be
 * pasted into docs/architecture/scalability.md.
 *
 *   npm run build --workspace @buspass/backend     # once, so backend/dist exists
 *   npm run bench:store
 *
 * Optional environment: BENCH_SIZES="0,100,1000,5000,20000" BENCH_REPS=20
 * Results depend on the machine; the shape (linear growth) is the finding, not the numbers.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { OperationsStore } = require(
  join(root, "backend", "dist", "services", "operationsStore.js"),
);

const sizes = (process.env.BENCH_SIZES ?? "0,100,1000,5000,20000")
  .split(",")
  .map(Number);
const reps = Number(process.env.BENCH_REPS ?? 20);

// The store has no close(), so on Windows its SQLite file stays locked until this process
// exits. Cleanup is therefore best effort, and each run also sweeps folders left by earlier runs.
const PREFIX = "goassist-bench-";
function removeQuietly(directory) {
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // Still locked by this process; the next run removes it.
  }
}
for (const entry of readdirSync(tmpdir())) {
  if (entry.startsWith(PREFIX)) removeQuietly(join(tmpdir(), entry));
}
const createdDirectories = [];

function syntheticCase(index) {
  const now = new Date().toISOString();
  return {
    caseId: `CASE-${index}`,
    stopCode: "18331",
    busId: `AV-${index % 50}`,
    busService: "95",
    phase: "BOARDING",
    intents: [
      {
        intentId: `I-${index}`,
        signalId: `S-${index}`,
        source: "APP",
        anonymousToken: "token".repeat(6),
        assistanceTypes: ["WHEELCHAIR_RAMP", "EXTENDED_DWELL_TIME"],
        confidence: 1,
        confirmed: true,
        createdAt: now,
      },
    ],
    assistanceTypes: ["WHEELCHAIR_RAMP", "EXTENDED_DWELL_TIME"],
    passengerCount: 1,
    confidence: 1,
    boardingIntent: {
      decision: "CONFIRMED",
      confidence: 1,
      reason: "explicit request",
      evidence: [],
      assessedAt: now,
    },
    state: "COMPLETED",
    actionPlan: [
      {
        assistanceType: "WHEELCHAIR_RAMP",
        action: "DEPLOY_RAMP",
        requiresSafetyClearance: true,
        status: "COMPLETED",
      },
    ],
    outcome: {
      caseId: `CASE-${index}`,
      operatorInterventions: 0,
      safetyBlocks: 0,
      failures: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function measure(label, environment) {
  const directory = mkdtempSync(join(tmpdir(), PREFIX));
  createdDirectories.push(directory);
  const previous = process.env.GOASSIST_STORAGE_DRIVER;
  if (environment.GOASSIST_STORAGE_DRIVER)
    process.env.GOASSIST_STORAGE_DRIVER = environment.GOASSIST_STORAGE_DRIVER;
  else delete process.env.GOASSIST_STORAGE_DRIVER;
  try {
    const store = new OperationsStore(directory);
    let stored = 0;
    const rows = [];
    for (const target of sizes) {
      if (target > stored) {
        store.update((state) => {
          for (let i = stored; i < target; i += 1)
            state.cases.push(syntheticCase(i));
        });
        stored = target;
      }
      const updateStart = process.hrtime.bigint();
      for (let r = 0; r < reps; r += 1) {
        store.update((state) => {
          if (state.cases.length === 0) state.cases.push(syntheticCase(0));
          state.cases[0] = {
            ...state.cases[0],
            updatedAt: new Date().toISOString(),
          };
        });
      }
      const updateMs =
        Number(process.hrtime.bigint() - updateStart) / 1e6 / reps;
      const snapshotStart = process.hrtime.bigint();
      for (let r = 0; r < reps; r += 1) store.snapshot();
      const snapshotMs =
        Number(process.hrtime.bigint() - snapshotStart) / 1e6 / reps;
      const stateMb = JSON.stringify(store.snapshot()).length / 1e6;
      rows.push({
        cases: stored,
        stateMb,
        updateMs,
        snapshotMs,
        perSecond: 1000 / updateMs,
      });
    }
    return { label, rows };
  } finally {
    if (previous === undefined) delete process.env.GOASSIST_STORAGE_DRIVER;
    else process.env.GOASSIST_STORAGE_DRIVER = previous;
  }
}

const results = [
  measure("JSON file driver", { GOASSIST_STORAGE_DRIVER: "json" }),
  measure("SQLite driver", {}),
];

console.log(
  `Machine: ${cpus()[0]?.model ?? "unknown CPU"}, Node ${process.version}, ${reps} repetitions per size.\n`,
);
for (const { label, rows } of results) {
  console.log(`**${label}**\n`);
  console.log(
    "| Cases stored | State size (MB) | Time per update (ms) | Updates per second | Time per snapshot (ms) |",
  );
  console.log("|---:|---:|---:|---:|---:|");
  for (const row of rows) {
    console.log(
      `| ${row.cases} | ${row.stateMb.toFixed(2)} | ${row.updateMs.toFixed(1)} | ${row.perSecond.toFixed(0)} | ${row.snapshotMs.toFixed(1)} |`,
    );
  }
  console.log("");
}

for (const directory of createdDirectories) removeQuietly(directory);
