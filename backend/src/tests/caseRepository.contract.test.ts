import test from "node:test";
import assert from "node:assert/strict";
import type { AssistanceCase } from "@buspass/shared";
import { MemoryCaseRepository } from "../cases/memoryCaseRepository";
import { SqliteCaseRepository } from "../cases/sqliteCaseRepository";
import type { CaseRepository } from "../cases/ports";
import { openSqliteDatabase } from "../storage/sqlite";

function makeCase(
  id: string,
  overrides: Partial<AssistanceCase> = {},
  signals: string[] = [`SIG-${id}`],
): AssistanceCase {
  return {
    caseId: id,
    stopCode: "18331",
    busId: "AV-095-01",
    busService: "95",
    phase: "BOARDING",
    intents: signals.map((signalId) => ({
      intentId: `I-${signalId}`,
      signalId,
    })),
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    passengerCount: 1,
    confidence: 0.9,
    state: "REQUESTED",
    actionPlan: [],
    outcome: { operatorInterventions: 0 },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  } as unknown as AssistanceCase;
}

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

// The repository holds only prepared statements; keep the databases referenced.
const openDatabases: unknown[] = [];

const adapters: Array<{
  name: string;
  create: () => CaseRepository;
  skip?: string;
}> = [
  { name: "memory", create: () => new MemoryCaseRepository() },
  {
    name: "sqlite",
    skip: sqliteAvailable ? undefined : "node:sqlite is not available",
    create: () => {
      const database = openSqliteDatabase(":memory:");
      if (!database) throw new Error("sqlite unavailable");
      openDatabases.push(database);
      return new SqliteCaseRepository(database);
    },
  },
];

for (const adapter of adapters) {
  const options = { skip: adapter.skip };
  const label = `CaseRepository (${adapter.name})`;

  test(`${label}: get, upsert and replace in place`, options, () => {
    const repository = adapter.create();
    assert.equal(repository.get("C1"), undefined);
    repository.upsert(makeCase("C1"));
    repository.upsert(makeCase("C1", { state: "READY" }));
    repository.upsert(makeCase("C2"));
    assert.equal(repository.count(), 2);
    assert.equal(repository.get("C1")?.state, "READY");
    assert.deepEqual(repository.get("C1")?.assistanceTypes, [
      "WHEELCHAIR_RAMP",
    ]);
  });

  test(`${label}: a returned case cannot alter what is stored`, options, () => {
    const repository = adapter.create();
    repository.upsert(makeCase("C1"));
    repository.get("C1")?.assistanceTypes.push("EXTRA" as never);
    assert.deepEqual(repository.get("C1")?.assistanceTypes, [
      "WHEELCHAIR_RAMP",
    ]);
  });

  test(
    `${label}: a case is found by any signal that created one of its intents`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("C1", {}, ["S1", "S2"]));
      repository.upsert(makeCase("C2", {}, ["S3"]));
      assert.equal(repository.findBySignalId("S2")?.caseId, "C1");
      assert.equal(repository.findBySignalId("S3")?.caseId, "C2");
      assert.equal(repository.findBySignalId("nope"), undefined);
      repository.upsert(makeCase("C1", {}, ["S1", "S2", "S4"]));
      assert.equal(repository.findBySignalId("S4")?.caseId, "C1");
    },
  );

  test(
    `${label}: findOpen returns the oldest open case that matches, never a finished one`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("DONE", { state: "COMPLETED" }));
      repository.upsert(makeCase("FIRST"));
      repository.upsert(makeCase("SECOND"));
      repository.upsert(makeCase("OTHER-STOP", { stopCode: "99999" }));
      repository.upsert(makeCase("ALIGHT", { phase: "ALIGHTING" }));
      assert.equal(repository.findOpen({ stopCode: "18331" })?.caseId, "FIRST");
      assert.equal(
        repository.findOpen({ stopCode: "18331", phase: "ALIGHTING" })?.caseId,
        "ALIGHT",
      );
      assert.equal(
        repository.findOpen({ stopCode: "99999" })?.caseId,
        "OTHER-STOP",
      );
      assert.equal(repository.findOpen({ stopCode: "00000" }), undefined);
      repository.upsert(makeCase("FIRST", { state: "CANCELLED" }));
      assert.equal(
        repository.findOpen({ stopCode: "18331" })?.caseId,
        "SECOND",
      );
    },
  );

  test(
    `${label}: an updated case keeps its place in the open order`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("A"));
      repository.upsert(makeCase("B"));
      repository.upsert(makeCase("A", { state: "ESCALATED" }));
      assert.equal(repository.findOpen({})?.caseId, "A");
      assert.deepEqual(
        repository.listOpen(10).map((item) => item.caseId),
        ["A", "B"],
      );
    },
  );

  test(
    `${label}: a bus filter can mean any bus, no bus yet, or one bus`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("NOBUS", { busId: undefined }));
      repository.upsert(makeCase("B1", { busId: "AV-095-01" }));
      assert.equal(repository.findOpen({})?.caseId, "NOBUS");
      assert.equal(repository.findOpen({ busId: null })?.caseId, "NOBUS");
      assert.equal(repository.findOpen({ busId: "AV-095-01" })?.caseId, "B1");
      assert.equal(repository.findOpen({ busId: "AV-000-00" }), undefined);
    },
  );

  test(
    `${label}: list filters, puts the newest update first and honours the limit`,
    options,
    () => {
      const repository = adapter.create();
      const at = (n: number) => `2026-10-01T00:00:0${n}.000Z`;
      repository.upsert(makeCase("A", { updatedAt: at(1) }));
      repository.upsert(
        makeCase("B", { updatedAt: at(3), busId: "AV-095-02" }),
      );
      repository.upsert(makeCase("C", { updatedAt: at(2), state: "BLOCKED" }));
      repository.upsert(makeCase("D", { updatedAt: at(2) }));
      assert.deepEqual(
        repository.list({ limit: 10 }).map((item) => item.caseId),
        ["B", "D", "C", "A"],
      );
      assert.deepEqual(
        repository
          .list({ limit: 10, busId: "AV-095-01" })
          .map((item) => item.caseId),
        ["D", "C", "A"],
      );
      assert.deepEqual(
        repository
          .list({ limit: 10, state: "BLOCKED" })
          .map((item) => item.caseId),
        ["C"],
      );
      assert.equal(repository.list({ limit: 2 }).length, 2);
    },
  );

  test(
    `${label}: listOpen is bounded and skips finished cases`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("DONE", { state: "FAILED" }));
      for (const id of ["A", "B", "C"]) repository.upsert(makeCase(id));
      assert.deepEqual(
        repository.listOpen(2).map((item) => item.caseId),
        ["A", "B"],
      );
    },
  );

  test(
    `${label}: counts by state, and clear empties everything`,
    options,
    () => {
      const repository = adapter.create();
      repository.upsert(makeCase("A"));
      repository.upsert(makeCase("B", { state: "COMPLETED" }));
      repository.upsert(makeCase("C", { state: "COMPLETED" }));
      assert.deepEqual(repository.countByState(), {
        REQUESTED: 1,
        COMPLETED: 2,
      });
      repository.clear();
      assert.equal(repository.count(), 0);
      assert.equal(repository.findBySignalId("SIG-A"), undefined);
    },
  );
}

for (const adapter of adapters) {
  const options = { skip: adapter.skip };
  const label = `CaseRepository (${adapter.name})`;

  test(
    `${label}: finished cases can be listed oldest first, counted and deleted`,
    options,
    () => {
      const repository = adapter.create();
      const at = (n: number) => `2026-10-01T00:00:0${n}.000Z`;
      repository.upsert(makeCase("OPEN", { updatedAt: at(0) }));
      repository.upsert(
        makeCase("D3", { state: "COMPLETED", updatedAt: at(3) }),
      );
      repository.upsert(makeCase("D1", { state: "FAILED", updatedAt: at(1) }));
      repository.upsert(
        makeCase("D2", { state: "CANCELLED", updatedAt: at(2) }),
      );
      assert.equal(repository.countFinished(), 3);
      assert.deepEqual(
        repository.listFinishedOldest(2).map((item) => item.caseId),
        ["D1", "D2"],
      );
      assert.deepEqual(
        repository.listFinishedBefore(at(3), 10).map((item) => item.caseId),
        ["D1", "D2"],
      );
      repository.delete("D1");
      assert.equal(repository.get("D1"), undefined);
      assert.equal(repository.findBySignalId("SIG-D1"), undefined);
      assert.equal(repository.countFinished(), 2);
      assert.equal(repository.count(), 3);
    },
  );
}
