import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationsStore } from "../services/operationsStore";
import { openSqliteDatabase } from "../storage/sqlite";

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

function event(index: number, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `EVENT-${index}`,
    eventType: "TEST_EVENT",
    actor: "SYSTEM",
    timestamp: new Date(1_800_000_000_000 + index * 1000).toISOString(),
    detail: { index },
    ...overrides,
  };
}

const drivers: Array<{ name: string; env: string; skip?: string }> = [
  { name: "ndjson file", env: "json" },
  {
    name: "sqlite",
    env: "sqlite",
    skip: sqliteAvailable ? undefined : "node:sqlite is not available",
  },
];

for (const driver of drivers) {
  function withStore(work: (store: OperationsStore) => void) {
    const directory = mkdtempSync(join(tmpdir(), "goassist-audit-"));
    const previous = process.env.GOASSIST_STORAGE_DRIVER;
    process.env.GOASSIST_STORAGE_DRIVER = driver.env;
    try {
      work(new OperationsStore(directory));
    } finally {
      if (previous === undefined) delete process.env.GOASSIST_STORAGE_DRIVER;
      else process.env.GOASSIST_STORAGE_DRIVER = previous;
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file; the temp directory is disposable.
      }
    }
  }

  test(
    `audit read (${driver.name}): newest first, bounded by the limit`,
    { skip: driver.skip },
    () => {
      withStore((store) => {
        for (let index = 0; index < 10; index += 1)
          store.appendAudit(event(index));
        const page = store.readAudit({ limit: 3 });
        assert.deepEqual(
          page.map((item) => item.eventId),
          ["EVENT-9", "EVENT-8", "EVENT-7"],
        );
        assert.deepEqual(page[0].detail, { index: 9 });
      });
    },
  );

  test(
    `audit read (${driver.name}): filters by case and by bus`,
    { skip: driver.skip },
    () => {
      withStore((store) => {
        store.appendAudit(event(1, { caseId: "CASE-1", busId: "B1" }));
        store.appendAudit(event(2, { caseId: "CASE-2", busId: "B1" }));
        store.appendAudit(event(3, { caseId: "CASE-1", busId: "B2" }));
        assert.deepEqual(
          store
            .readAudit({ limit: 10, caseId: "CASE-1" })
            .map((item) => item.eventId),
          ["EVENT-3", "EVENT-1"],
        );
        assert.deepEqual(
          store
            .readAudit({ limit: 10, busId: "B1" })
            .map((item) => item.eventId),
          ["EVENT-2", "EVENT-1"],
        );
        assert.deepEqual(
          store
            .readAudit({ limit: 10, caseId: "CASE-1", busId: "B2" })
            .map((item) => item.eventId),
          ["EVENT-3"],
        );
      });
    },
  );

  test(
    `audit read (${driver.name}): an empty log gives an empty page`,
    { skip: driver.skip },
    () => {
      withStore((store) => {
        assert.deepEqual(store.readAudit({ limit: 10 }), []);
      });
    },
  );
}
