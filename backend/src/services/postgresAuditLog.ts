import fs from "fs";
import {
  createSchemaObjects,
  toNumber,
  type PgPool,
} from "../storage/postgres";
import type { AuditQuery, AuditSink, OperationsAuditEvent } from "./auditLog";
import { logger } from "./logger";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS audit_events (
    sequence BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    case_id TEXT,
    bus_id TEXT,
    actor TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    detail_json TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS audit_events_case ON audit_events (case_id, sequence)",
  "CREATE INDEX IF NOT EXISTS audit_events_bus ON audit_events (bus_id, sequence)",
];

/** How long events wait so that many are written in one statement. */
const FLUSH_DELAY_MS = 20;
/** If the database stays away, keep at most this many events before dropping the oldest. */
const MAX_BUFFERED = 10_000;

/**
 * The audit trail on Postgres. Writes are buffered and sent in one multi-row statement a few
 * milliseconds later, so a request never waits for the database; a crash can lose the events
 * of that short window (the same trade the SQLite audit batcher makes). A read first writes
 * whatever is buffered, so it sees every event written before it. Every event is also
 * appended to an ndjson file when a path is given, as the readable copy.
 */
export class PostgresAuditLog implements AuditSink {
  private readonly ready: Promise<void>;
  private buffer: OperationsAuditEvent[] = [];
  private timer: NodeJS.Timeout | undefined;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly pool: PgPool,
    private readonly path?: string,
  ) {
    this.ready = createSchemaObjects(pool, SCHEMA);
    this.ready.catch(() => undefined);
  }

  append(event: OperationsAuditEvent): void {
    this.appendBatch([event]);
  }

  appendBatch(events: OperationsAuditEvent[]): void {
    if (events.length === 0) return;
    this.buffer.push(...events);
    if (this.buffer.length > MAX_BUFFERED) {
      const dropped = this.buffer.length - MAX_BUFFERED;
      this.buffer.splice(0, dropped);
      logger.error(
        "Audit buffer full; the oldest events were dropped",
        undefined,
        {
          dropped,
        },
      );
    }
    if (this.path)
      fs.appendFileSync(
        this.path,
        events.map((event) => `${JSON.stringify(event)}\n`).join(""),
        "utf8",
      );
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, FLUSH_DELAY_MS);
    this.timer.unref?.();
  }

  /** Writes what is buffered; resolves when it (and any write already running) is done. */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(() => this.writeBuffered());
    return this.flushing;
  }

  private async writeBuffered(): Promise<void> {
    if (this.buffer.length === 0) return;
    const events = this.buffer;
    this.buffer = [];
    try {
      await this.ready;
      const values: unknown[] = [];
      const rows = events.map((event) => {
        const base = values.length;
        values.push(
          event.eventId,
          event.eventType,
          event.caseId ?? null,
          event.busId ?? null,
          event.actor,
          event.timestamp,
          JSON.stringify(event.detail ?? {}),
        );
        return `(${[1, 2, 3, 4, 5, 6, 7].map((n) => `$${base + n}`).join(", ")})`;
      });
      await this.pool.query(
        `INSERT INTO audit_events (event_id, event_type, case_id, bus_id, actor, timestamp, detail_json)
         VALUES ${rows.join(", ")} ON CONFLICT (event_id) DO NOTHING`,
        values,
      );
    } catch (error) {
      // Put them back in front so the next flush retries; they keep their order.
      this.buffer = [...events, ...this.buffer];
      logger.error("Audit events could not be written", undefined, {
        error: String(error),
        buffered: this.buffer.length,
      });
    }
  }

  async read(query: AuditQuery): Promise<OperationsAuditEvent[]> {
    await this.flush();
    await this.ready;
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (query.caseId !== undefined) {
      values.push(query.caseId);
      conditions.push(`case_id = $${values.length}`);
    }
    if (query.busId !== undefined) {
      values.push(query.busId);
      conditions.push(`bus_id = $${values.length}`);
    }
    values.push(query.limit);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT event_id, event_type, case_id, bus_id, actor, timestamp, detail_json
       FROM audit_events ${where} ORDER BY sequence DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      ...(row.case_id !== null ? { caseId: String(row.case_id) } : {}),
      ...(row.bus_id !== null ? { busId: String(row.bus_id) } : {}),
      actor: String(row.actor),
      timestamp: String(row.timestamp),
      detail: JSON.parse(String(row.detail_json)) as Record<string, unknown>,
    }));
  }

  async count(): Promise<number> {
    await this.flush();
    await this.ready;
    const result = await this.pool.query(
      "SELECT COUNT(*) AS total FROM audit_events",
    );
    return toNumber(result.rows[0].total);
  }

  async reset(removeFile: boolean): Promise<void> {
    this.buffer = [];
    await this.flush();
    await this.ready;
    await this.pool.query("DELETE FROM audit_events");
    if (removeFile && this.path && fs.existsSync(this.path))
      fs.unlinkSync(this.path);
  }
}
