import test from "node:test";
import assert from "node:assert/strict";
import type { BusStatus } from "@buspass/shared";
import { SqliteBusStatusRepository } from "../busOperations/sqliteRepositories";
import { openSqliteDatabase } from "../storage/sqlite";

/**
 * Scale requirement (docs/architecture/scalability.md, method SM3): the cost of one write
 * must not grow with the amount already stored. The whole-state store this replaces was
 * about 450 times slower at 20,000 records than at none. The bound below is deliberately
 * generous so the test is not flaky; the measured ratio is close to 1.
 */
const RECORDS = 20_000;
const BATCH = 500;
const MAX_SLOWDOWN = 3;

const sqlite = openSqliteDatabase(":memory:");
const skip = sqlite
  ? undefined
  : "node:sqlite is not available on this runtime";

function status(index: number): BusStatus {
  return {
    busId: `BUS-${String(index).padStart(6, "0")}`,
    busService: String(index % 200),
    stopCode: String(10000 + (index % 500)),
    movement: "TRAVELLING_TO_STOP",
    simulated: false,
    observedAt: new Date(1_800_000_000_000 + index).toISOString(),
  };
}

async function timePerWriteMs(
  repository: SqliteBusStatusRepository,
  from: number,
  count: number,
): Promise<number> {
  const started = process.hrtime.bigint();
  for (let index = from; index < from + count; index += 1)
    await repository.upsert(status(index));
  return Number(process.hrtime.bigint() - started) / 1e6 / count;
}

test(
  "write time stays flat as stored bus records grow to 20,000",
  { skip },
  async () => {
    assert.ok(sqlite);
    const repository = new SqliteBusStatusRepository(sqlite);
    const firstBatch = await timePerWriteMs(repository, 0, BATCH);
    await timePerWriteMs(repository, BATCH, RECORDS - 2 * BATCH);
    const lastBatch = await timePerWriteMs(repository, RECORDS - BATCH, BATCH);
    assert.equal(await repository.count(), RECORDS);
    const slowdown = lastBatch / firstBatch;
    console.log(
      `# bus status write: ${firstBatch.toFixed(3)} ms at 0 records, ${lastBatch.toFixed(3)} ms at ${RECORDS - BATCH} records (x${slowdown.toFixed(2)})`,
    );
    assert.ok(slowdown < MAX_SLOWDOWN, `slowdown was ${slowdown.toFixed(2)}x`);
  },
);

test(
  "reading one bus and a bounded list stay fast with 20,000 records stored",
  { skip },
  async () => {
    assert.ok(sqlite);
    const repository = new SqliteBusStatusRepository(sqlite);
    const started = process.hrtime.bigint();
    for (let index = 0; index < 1000; index += 1)
      await repository.get(status((index * 17) % RECORDS).busId);
    const readMs = Number(process.hrtime.bigint() - started) / 1e6 / 1000;
    const listStarted = process.hrtime.bigint();
    const page = await repository.list({ stopCode: "10007", limit: 100 });
    const listMs = Number(process.hrtime.bigint() - listStarted) / 1e6;
    assert.ok(readMs < 5, `single read took ${readMs.toFixed(3)} ms`);
    assert.ok(listMs < 50, `bounded list took ${listMs.toFixed(3)} ms`);
    assert.ok(page.length <= 100);
    assert.ok(page.every((item) => item.stopCode === "10007"));
  },
);
