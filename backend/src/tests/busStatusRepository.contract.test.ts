import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BusStatus } from "@buspass/shared";
import { MemoryBusStatusRepository } from "../busOperations/memoryRepositories";
import { SqliteBusStatusRepository } from "../busOperations/sqliteRepositories";
import type { BusStatusRepository } from "../busOperations/ports";
import { openSqliteDatabase } from "../storage/sqlite";

function status(busId: string, overrides: Partial<BusStatus> = {}): BusStatus {
  return {
    busId,
    busService: "95",
    stopCode: "18331",
    movement: "TRAVELLING_TO_STOP",
    simulated: false,
    observedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

interface Subject {
  repository: BusStatusRepository;
  cleanup: () => void;
}

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

const adapters: Array<{ name: string; create: () => Subject; skip?: string }> =
  [
    {
      name: "memory",
      create: () => ({
        repository: new MemoryBusStatusRepository(),
        cleanup: () => undefined,
      }),
    },
    {
      name: "sqlite",
      skip: sqliteAvailable
        ? undefined
        : "node:sqlite is not available on this runtime",
      create: () => {
        const database = openSqliteDatabase(":memory:");
        if (!database) throw new Error("sqlite unavailable");
        return {
          repository: new SqliteBusStatusRepository(database),
          cleanup: () => database.close(),
        };
      },
    },
  ];

for (const adapter of adapters) {
  const label = `BusStatusRepository (${adapter.name})`;
  const options = { skip: adapter.skip };

  test(`${label}: an unknown bus is undefined`, options, async () => {
    const { repository, cleanup } = adapter.create();
    assert.equal(await repository.get("NOPE"), undefined);
    cleanup();
  });

  test(
    `${label}: upsert then get returns the same status`,
    options,
    async () => {
      const { repository, cleanup } = adapter.create();
      const saved = status("B1", { bayId: "BAY-A", simulated: true });
      await repository.upsert(saved);
      assert.deepEqual(await repository.get("B1"), saved);
      cleanup();
    },
  );

  test(
    `${label}: optional fields stay absent when not given`,
    options,
    async () => {
      const { repository, cleanup } = adapter.create();
      await repository.upsert({
        busId: "B1",
        busService: "95",
        movement: "DEPARTING",
        simulated: false,
        observedAt: "2026-09-30T00:00:00.000Z",
      });
      const loaded = await repository.get("B1");
      assert.equal(loaded?.stopCode, undefined);
      assert.equal(loaded?.bayId, undefined);
      assert.ok(
        !("stopCode" in (loaded ?? {})) || loaded?.stopCode === undefined,
      );
      cleanup();
    },
  );

  test(
    `${label}: upserting the same bus replaces it and keeps one record`,
    options,
    async () => {
      const { repository, cleanup } = adapter.create();
      await repository.upsert(status("B1"));
      await repository.upsert(
        status("B1", {
          movement: "POSITIONED_AT_STOP",
          observedAt: "2026-09-30T00:00:05.000Z",
        }),
      );
      assert.equal(await repository.count(), 1);
      assert.equal(
        (await repository.get("B1"))?.movement,
        "POSITIONED_AT_STOP",
      );
      cleanup();
    },
  );

  test(
    `${label}: list filters by stop and is ordered by bus id`,
    options,
    async () => {
      const { repository, cleanup } = adapter.create();
      await repository.upsert(status("B3", { stopCode: "S1" }));
      await repository.upsert(status("B1", { stopCode: "S1" }));
      await repository.upsert(status("B2", { stopCode: "S2" }));
      assert.deepEqual(
        (await repository.list({ stopCode: "S1", limit: 10 })).map(
          (s) => s.busId,
        ),
        ["B1", "B3"],
      );
      assert.deepEqual(
        (await repository.list({ limit: 10 })).map((s) => s.busId),
        ["B1", "B2", "B3"],
      );
      cleanup();
    },
  );

  test(`${label}: clear removes every record`, options, async () => {
    const { repository, cleanup } = adapter.create();
    await repository.upsert(status("B1"));
    await repository.upsert(status("B2"));
    await repository.clear();
    assert.equal(await repository.count(), 0);
    assert.equal(await repository.get("B1"), undefined);
    cleanup();
  });

  test(
    `${label}: list never returns more than the limit`,
    options,
    async () => {
      const { repository, cleanup } = adapter.create();
      for (let index = 0; index < 25; index += 1)
        await repository.upsert(status(`B${String(index).padStart(2, "0")}`));
      assert.equal((await repository.list({ limit: 10 })).length, 10);
      cleanup();
    },
  );
}

test(
  "BusStatusRepository (sqlite): data survives closing and reopening the file",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-busops-"));
    const file = join(directory, "bus-operations.sqlite");
    try {
      const first = openSqliteDatabase(file);
      assert.ok(first);
      await new SqliteBusStatusRepository(first).upsert(
        status("B1", { bayId: "BAY-A" }),
      );
      first.close();

      const second = openSqliteDatabase(file);
      assert.ok(second);
      const reopened = await new SqliteBusStatusRepository(second).get("B1");
      assert.equal(reopened?.bayId, "BAY-A");
      second.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // A leftover temp folder is harmless.
      }
    }
  },
);
