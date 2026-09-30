import test from "node:test";
import assert from "node:assert/strict";
import type { PgClient, PgPool, PgResult } from "../storage/postgres";
import { PostgresAuditLog } from "../services/postgresAuditLog";
import {
  makeTestPool,
  postgresSkip,
  registerPostgresCleanup,
} from "./helpers/postgres";

registerPostgresCleanup();

const event = (
  index: number,
  extra: { caseId?: string; busId?: string } = {},
) => ({
  eventId: `EVENT-${index}`,
  eventType: "BUS_STATUS_CHANGED",
  actor: "VEHICLE",
  timestamp: new Date(1_800_000_000_000 + index * 1000).toISOString(),
  detail: { index },
  ...extra,
});

test(
  "postgres audit: newest first, bounded, filtered, and a read sees what was just written",
  { skip: postgresSkip },
  async () => {
    const log = new PostgresAuditLog(makeTestPool());
    log.appendBatch([event(1), event(2), event(3)]);
    log.append(event(4, { caseId: "CASE-1", busId: "B1" }));
    log.append(event(5, { caseId: "CASE-2", busId: "B1" }));
    const page = await log.read({ limit: 3 });
    assert.deepEqual(
      page.map((item) => item.eventId),
      ["EVENT-5", "EVENT-4", "EVENT-3"],
    );
    assert.deepEqual(page[2].detail, { index: 3 });
    assert.deepEqual(
      (await log.read({ limit: 10, busId: "B1" })).map((item) => item.eventId),
      ["EVENT-5", "EVENT-4"],
    );
    assert.deepEqual(
      (await log.read({ limit: 10, caseId: "CASE-1" })).map(
        (item) => item.eventId,
      ),
      ["EVENT-4"],
    );
    assert.equal(await log.count(), 5);
  },
);

test(
  "postgres audit: an event written twice is stored once, and an empty batch does nothing",
  { skip: postgresSkip },
  async () => {
    const log = new PostgresAuditLog(makeTestPool());
    log.appendBatch([]);
    log.append(event(1));
    log.append(event(1));
    assert.equal(await log.count(), 1);
  },
);

test(
  "postgres audit: reset empties the log",
  { skip: postgresSkip },
  async () => {
    const log = new PostgresAuditLog(makeTestPool());
    log.append(event(1));
    await log.reset(false);
    assert.deepEqual(await log.read({ limit: 10 }), []);
  },
);

test("postgres audit: events survive a failed write and are written, in order, on the next flush", async () => {
  let failNext = true;
  const written: string[] = [];
  const client: PgClient = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => undefined,
  };
  const pool: PgPool = {
    connect: async () => client,
    end: async () => undefined,
    query: async (text: string, values?: unknown[]): Promise<PgResult> => {
      if (text.startsWith("INSERT INTO audit_events")) {
        if (failNext) {
          failNext = false;
          throw new Error("database away");
        }
        for (let i = 0; i < (values?.length ?? 0); i += 7)
          written.push(String(values?.[i]));
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const log = new PostgresAuditLog(pool);
  log.append(event(1));
  await log.flush();
  assert.deepEqual(written, [], "the first write failed");
  log.append(event(2));
  await log.flush();
  assert.deepEqual(written, ["EVENT-1", "EVENT-2"]);
});
