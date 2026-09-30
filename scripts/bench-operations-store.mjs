#!/usr/bin/env node
/**
 * Reproducible measurement of the cost of one case write as the number of stored cases grows.
 *
 * The old store rewrote its entire state on every update (about 450 times slower at 20,000
 * cases). Cases are now one row each, so a write should cost the same at every size; this
 * script measures that for the SQLite and memory storage and prints a Markdown table that
 * can be pasted into docs/architecture/scalability.md.
 *
 *   npm run build --workspace @buspass/backend     # once, so backend/dist exists
 *   npm run bench:store
 *
 * Optional environment: BENCH_SIZES="0,100,1000,5000,20000" BENCH_REPS=20
 * Results depend on the machine; the shape (flat, not growing with the number of cases) is the finding, not the numbers.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { OperationsData } = require(
  join(root, "backend", "dist", "services", "operationsData.js"),
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

async function measure(label, driver) {
  const directory = mkdtempSync(join(tmpdir(), PREFIX));
  createdDirectories.push(directory);
  // Retention is set far above the sizes measured, so it never trims during the run.
  const data = new OperationsData(directory, {
    driver,
    retentionTimer: false,
    retention: {
      finishedCaseMaxAgeMs: 1e15,
      maxFinishedCases: 1e9,
      maxSeriesRecords: 1e9,
    },
  });
  try {
    await data.ready;
    let stored = 0;
    const rows = [];
    for (const target of sizes) {
      for (let i = stored; i < target; i += 1)
        await data.cases.upsert(syntheticCase(i));
      stored = Math.max(stored, target);
      const first = syntheticCase(0);
      const updateStart = process.hrtime.bigint();
      for (let r = 0; r < reps; r += 1)
        await data.cases.upsert({
          ...first,
          updatedAt: new Date().toISOString(),
        });
      const updateMs =
        Number(process.hrtime.bigint() - updateStart) / 1e6 / reps;
      const readStart = process.hrtime.bigint();
      for (let r = 0; r < reps; r += 1)
        await data.cases.get(`CASE-${stored - 1}`);
      const readMs = Number(process.hrtime.bigint() - readStart) / 1e6 / reps;
      rows.push({
        cases: stored,
        updateMs,
        readMs,
        perSecond: 1000 / updateMs,
      });
    }
    return { label, rows };
  } finally {
    data.close();
  }
}

const results = [
  await measure("SQLite", "sqlite"),
  await measure("Memory", "memory"),
];

console.log(
  `Machine: ${cpus()[0]?.model ?? "unknown CPU"}, Node ${process.version}, ${reps} repetitions per size.\n`,
);
for (const { label, rows } of results) {
  console.log(`**${label}**
`);
  console.log(
    "| Cases stored | Time per update (ms) | Updates per second | Time per read (ms) |",
  );
  console.log("|---:|---:|---:|---:|");
  for (const row of rows) {
    console.log(
      `| ${row.cases} | ${row.updateMs.toFixed(3)} | ${row.perSecond.toFixed(0)} | ${row.readMs.toFixed(3)} |`,
    );
  }
  console.log("");
}

for (const directory of createdDirectories) removeQuietly(directory);
