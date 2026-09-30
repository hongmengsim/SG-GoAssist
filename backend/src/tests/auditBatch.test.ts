import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationsData } from "../services/operationsData";
import { AuditBatcher } from "../busOperations/auditBatcher";
import { openSqliteDatabase } from "../storage/sqlite";

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

function event(index: number) {
  return {
    eventId: `EVENT-${index}`,
    eventType: "BUS_STATUS_CHANGED",
    actor: "VEHICLE",
    busId: `B${index % 3}`,
    timestamp: new Date(1_800_000_000_000 + index * 1000).toISOString(),
    detail: { index },
  };
}

for (const driver of ["json", "sqlite"]) {
  test(
    `appendAuditBatch writes every event once and they read back in order (${driver})`,
    { skip: driver === "sqlite" && !sqliteAvailable },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "goassist-batch-"));
      const previous = process.env.GOASSIST_STORAGE_DRIVER;
      process.env.GOASSIST_STORAGE_DRIVER = driver;
      try {
        const store = new OperationsData(directory, { retentionTimer: false });
        store.audit.appendBatch([event(1), event(2), event(3)]);
        store.audit.appendBatch([]);
        store.audit.append(event(4));
        const read = await store.audit.read({ limit: 10 });
        assert.deepEqual(
          read.map((item) => item.eventId),
          ["EVENT-4", "EVENT-3", "EVENT-2", "EVENT-1"],
        );
        assert.equal(
          (await store.audit.read({ limit: 10, busId: "B1" })).length,
          2,
        );
      } finally {
        if (previous === undefined) delete process.env.GOASSIST_STORAGE_DRIVER;
        else process.env.GOASSIST_STORAGE_DRIVER = previous;
        try {
          rmSync(directory, { recursive: true, force: true });
        } catch {
          // Windows may hold the database for a moment.
        }
      }
    },
  );
}

class Scheduler {
  pending: Array<() => void> = [];
  schedule = (fn: () => void) => {
    this.pending.push(fn);
    return () => {
      this.pending = this.pending.filter((item) => item !== fn);
    };
  };
  fire() {
    const due = this.pending;
    this.pending = [];
    due.forEach((fn) => fn());
  }
}

test("the batcher holds events briefly and writes them together", () => {
  const written: number[][] = [];
  const scheduler = new Scheduler();
  const batcher = new AuditBatcher(
    (events) => written.push(events.map((e) => Number(e.eventId.slice(6)))),
    { maxSize: 100, schedule: scheduler.schedule },
  );
  batcher.add(event(1));
  batcher.add(event(2));
  assert.deepEqual(written, [], "nothing is written until the delay passes");
  scheduler.fire();
  assert.deepEqual(written, [[1, 2]]);
});

test("a full batch is written at once without waiting for the timer", () => {
  const written: number[] = [];
  const scheduler = new Scheduler();
  const batcher = new AuditBatcher((events) => written.push(events.length), {
    maxSize: 3,
    schedule: scheduler.schedule,
  });
  for (let index = 0; index < 7; index += 1) batcher.add(event(index));
  assert.deepEqual(written, [3, 3]);
  batcher.flush();
  assert.deepEqual(written, [3, 3, 1]);
});

test("flush writes what is waiting and does nothing when nothing is", () => {
  const written: number[] = [];
  const batcher = new AuditBatcher((events) => written.push(events.length), {
    schedule: new Scheduler().schedule,
  });
  batcher.flush();
  batcher.add(event(1));
  batcher.flush();
  batcher.flush();
  assert.deepEqual(written, [1]);
});

test("a failed write keeps the events for the next attempt and reports the error", () => {
  let fail = true;
  const written: number[] = [];
  const errors: string[] = [];
  const batcher = new AuditBatcher(
    (events) => {
      if (fail) throw new Error("disk full");
      written.push(events.length);
    },
    {
      schedule: new Scheduler().schedule,
      onError: (error) => errors.push(String(error)),
    },
  );
  batcher.add(event(1));
  batcher.add(event(2));
  batcher.flush();
  assert.equal(errors.length, 1);
  fail = false;
  batcher.add(event(3));
  batcher.flush();
  assert.deepEqual(
    written,
    [3],
    "the earlier two were kept and written with the third",
  );
});

test("the batcher never holds more than its bound when the store keeps failing", () => {
  const batcher = new AuditBatcher(
    () => {
      throw new Error("down");
    },
    {
      maxSize: 10,
      maxHeld: 25,
      schedule: new Scheduler().schedule,
      onError: () => undefined,
    },
  );
  for (let index = 0; index < 100; index += 1) batcher.add(event(index));
  assert.ok(batcher.held() <= 25);
  assert.ok(
    batcher.dropped() > 0,
    "what had to be dropped is counted, not hidden",
  );
});
