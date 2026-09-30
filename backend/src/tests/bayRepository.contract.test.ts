import test from "node:test";
import assert from "node:assert/strict";
import type { BayStatus } from "@buspass/shared";
import { MemoryBayRepository } from "../busOperations/memoryRepositories";
import { SqliteBayRepository } from "../busOperations/sqliteRepositories";
import type { BayRepository } from "../busOperations/ports";
import {
  DocumentBayRepository,
  bayTableSpec,
} from "../busOperations/documentRepositories";
import { MemoryDocumentTable } from "../storage/documentTable";
import { openSqliteDatabase } from "../storage/sqlite";
import { PostgresDocumentTable } from "../storage/postgresTables";
import {
  makeTestPool,
  postgresSkip,
  registerPostgresCleanup,
} from "./helpers/postgres";

registerPostgresCleanup();

function bay(stopCode: string, overrides: Partial<BayStatus> = {}): BayStatus {
  return {
    stopCode,
    bayId: "BAY-1",
    occupantBusId: null,
    waitingBusIds: [],
    grantedBusId: null,
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

const adapters: Array<{
  name: string;
  create: () => BayRepository;
  skip?: string;
}> = [
  { name: "memory", create: () => new MemoryBayRepository() },
  {
    name: "document table (memory)",
    create: () =>
      new DocumentBayRepository(new MemoryDocumentTable(bayTableSpec)),
  },
  {
    name: "postgres",
    skip: postgresSkip,
    create: () =>
      new DocumentBayRepository(
        new PostgresDocumentTable(makeTestPool(), bayTableSpec),
      ),
  },
  {
    name: "sqlite",
    skip: sqliteAvailable
      ? undefined
      : "node:sqlite is not available on this runtime",
    create: () => {
      const database = openSqliteDatabase(":memory:");
      if (!database) throw new Error("sqlite unavailable");
      return new SqliteBayRepository(database);
    },
  },
];

for (const adapter of adapters) {
  test(
    `bay repository (${adapter.name}): stores one bay per stop and keeps the queue order`,
    { skip: adapter.skip },
    async () => {
      const repository = adapter.create();
      assert.equal(await repository.get("18331"), undefined);
      await repository.upsert(
        bay("18331", { occupantBusId: "B1", waitingBusIds: ["B3", "B2"] }),
      );
      await repository.upsert(bay("18301"));
      await repository.upsert(
        bay("18331", { grantedBusId: "B3", waitingBusIds: ["B2"] }),
      );
      assert.equal(await repository.count(), 2);
      const stored = await repository.get("18331");
      assert.deepEqual(stored?.waitingBusIds, ["B2"]);
      assert.equal(stored?.grantedBusId, "B3");
      assert.equal(stored?.occupantBusId, null);
    },
  );

  test(
    `bay repository (${adapter.name}): a returned bay cannot alter what is stored`,
    { skip: adapter.skip },
    async () => {
      const repository = adapter.create();
      await repository.upsert(bay("18331", { waitingBusIds: ["B2"] }));
      const first = await repository.get("18331");
      first?.waitingBusIds.push("HACK");
      assert.deepEqual((await repository.get("18331"))?.waitingBusIds, ["B2"]);
    },
  );

  test(
    `bay repository (${adapter.name}): clear removes everything`,
    { skip: adapter.skip },
    async () => {
      const repository = adapter.create();
      await repository.upsert(bay("18331"));
      await repository.clear();
      assert.equal(await repository.count(), 0);
    },
  );
}
