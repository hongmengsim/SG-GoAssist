import test from "node:test";
import assert from "node:assert/strict";
import type { AssistanceCase } from "@buspass/shared";
import { SqliteCaseRepository } from "../cases/sqliteCaseRepository";
import { openSqliteDatabase } from "../storage/sqlite";

/**
 * Scale requirement (docs/architecture/scalability.md, method SM3): the cost of one write
 * must not grow with the amount already stored. The whole-state store the case service
 * uses today is far slower at 20,000 cases than at none. The bound is generous so the test
 * is not flaky; the measured ratio is close to 1.
 */
const RECORDS = 20_000;
const BATCH = 500;
const MAX_SLOWDOWN = 3;

const sqlite = openSqliteDatabase(":memory:");
const skip = sqlite
  ? undefined
  : "node:sqlite is not available on this runtime";

function makeCase(index: number): AssistanceCase {
  const stamp = new Date(1_800_000_000_000 + index).toISOString();
  return {
    caseId: `CASE-${String(index).padStart(6, "0")}`,
    stopCode: String(10000 + (index % 500)),
    busId: `BUS-${index % 200}`,
    phase: "BOARDING",
    intents: [{ intentId: `I-${index}`, signalId: `SIG-${index}` }],
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    passengerCount: 1,
    confidence: 0.9,
    state: index % 2 === 0 ? "COMPLETED" : "REQUESTED",
    actionPlan: [],
    outcome: { operatorInterventions: 0 },
    createdAt: stamp,
    updatedAt: stamp,
  } as unknown as AssistanceCase;
}

function timePerWriteMs(
  repository: SqliteCaseRepository,
  from: number,
  count: number,
): number {
  const started = process.hrtime.bigint();
  for (let index = from; index < from + count; index += 1)
    repository.upsert(makeCase(index));
  return Number(process.hrtime.bigint() - started) / 1e6 / count;
}

test(
  "case write time stays flat as stored cases grow to 20,000, and lookups stay indexed",
  { skip },
  () => {
    assert.ok(sqlite);
    const repository = new SqliteCaseRepository(sqlite);
    const firstBatch = timePerWriteMs(repository, 0, BATCH);
    timePerWriteMs(repository, BATCH, RECORDS - 2 * BATCH);
    const lastBatch = timePerWriteMs(repository, RECORDS - BATCH, BATCH);
    assert.equal(repository.count(), RECORDS);
    const slowdown = lastBatch / firstBatch;
    console.log(
      `# case write: ${firstBatch.toFixed(3)} ms at 0 cases, ${lastBatch.toFixed(3)} ms at ${RECORDS - BATCH} cases (x${slowdown.toFixed(2)})`,
    );
    assert.ok(slowdown < MAX_SLOWDOWN, `slowdown was ${slowdown.toFixed(2)}x`);

    // The lookups the service makes must not read every case either.
    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT body_json FROM cases WHERE is_open = 1 AND stop_code = ? AND phase = ? ORDER BY rowid LIMIT 1",
      )
      .all("10001", "BOARDING") as Array<{ detail: string }>;
    // findOpen builds exactly this statement for a stop and a phase.
    assert.equal(
      repository.findOpen({ stopCode: "10001", phase: "BOARDING" })?.caseId,
      "CASE-000001",
    );
    assert.ok(
      plan.some((row) => row.detail.includes("cases_open_stop")),
      `the open-case lookup did not use its index: ${JSON.stringify(plan)}`,
    );
  },
);
