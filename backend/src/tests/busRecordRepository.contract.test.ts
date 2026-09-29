import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryBusRecordRepository,
  SqliteBusRecordRepository,
} from "../busOperations/busRecordRepositories";
import type { BusRecord, BusRecordRepository } from "../busOperations/ports";
import { openSqliteDatabase } from "../storage/sqlite";

interface Sample extends BusRecord {
  note: string;
  nested: { values: number[] };
}

function sample(busId: string, note = "a"): Sample {
  return {
    busId,
    observedAt: "2026-09-30T00:00:00.000Z",
    note,
    nested: { values: [1, 2] },
  };
}

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

const adapters: Array<{
  name: string;
  create: () => BusRecordRepository<Sample>;
  skip?: string;
}> = [
  { name: "memory", create: () => new MemoryBusRecordRepository<Sample>() },
  {
    name: "sqlite",
    skip: sqliteAvailable
      ? undefined
      : "node:sqlite is not available on this runtime",
    create: () => {
      const database = openSqliteDatabase(":memory:");
      if (!database) throw new Error("sqlite unavailable");
      return new SqliteBusRecordRepository<Sample>(database, "sample_records");
    },
  },
];

for (const adapter of adapters) {
  const options = { skip: adapter.skip };
  const label = `BusRecordRepository (${adapter.name})`;

  test(
    `${label}: one record per bus, the latest write wins`,
    options,
    async () => {
      const repository = adapter.create();
      assert.equal(await repository.get("B1"), undefined);
      await repository.upsert(sample("B1", "first"));
      await repository.upsert(sample("B1", "second"));
      await repository.upsert(sample("B2"));
      assert.equal(await repository.count(), 2);
      assert.equal((await repository.get("B1"))?.note, "second");
      assert.deepEqual((await repository.get("B1"))?.nested, {
        values: [1, 2],
      });
    },
  );

  test(
    `${label}: list is ordered and bounded, clear empties`,
    options,
    async () => {
      const repository = adapter.create();
      for (const id of ["B3", "B1", "B2"]) await repository.upsert(sample(id));
      assert.deepEqual(
        (await repository.list(2)).map((record) => record.busId),
        ["B1", "B2"],
      );
      await repository.clear();
      assert.equal(await repository.count(), 0);
    },
  );

  test(
    `${label}: a returned record cannot alter what is stored`,
    options,
    async () => {
      const repository = adapter.create();
      await repository.upsert(sample("B1"));
      const loaded = await repository.get("B1");
      loaded?.nested.values.push(99);
      assert.deepEqual((await repository.get("B1"))?.nested.values, [1, 2]);
    },
  );
}

test("a table name that is not lower-case letters is refused", () => {
  const database = openSqliteDatabase(":memory:");
  if (!database) return;
  assert.throws(
    () => new SqliteBusRecordRepository(database, "x; DROP TABLE y"),
  );
});
