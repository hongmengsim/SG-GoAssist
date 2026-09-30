import fs from "fs";
import type { SqliteDatabase } from "../storage/sqlite";
import { logger } from "./logger";

export interface OperationsAuditEvent {
  eventId: string;
  eventType: string;
  caseId?: string;
  busId?: string;
  actor: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  /** Callers always pass a bound. */
  limit: number;
  caseId?: string;
  busId?: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    case_id TEXT,
    bus_id TEXT,
    actor TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    detail_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_events_case ON audit_events (case_id, sequence);
  CREATE INDEX IF NOT EXISTS audit_events_bus ON audit_events (bus_id, sequence);
`;

const INSERT =
  "INSERT INTO audit_events (event_id, event_type, case_id, bus_id, actor, timestamp, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)";

interface AuditRow {
  event_id: string;
  event_type: string;
  case_id: string | null;
  bus_id: string | null;
  actor: string;
  timestamp: string;
  detail_json: string;
}

/**
 * The append-only audit trail. With SQLite it is a table read through indexes; without it,
 * an ndjson file that has to be read whole (acceptable for a demo-sized log). Either way
 * every event is also appended to the ndjson file, which is the human-readable copy.
 */
export class AuditLog {
  constructor(
    private readonly database: SqliteDatabase | undefined,
    readonly path: string,
  ) {
    database?.exec(SCHEMA);
  }

  append(event: OperationsAuditEvent): void {
    this.appendBatch([event]);
  }

  /**
   * Writes several events in one transaction (one flush to disk) and one file append. The
   * events keep their order; an empty batch does nothing.
   */
  appendBatch(events: OperationsAuditEvent[]): void {
    if (events.length === 0) return;
    if (this.database) {
      const insert = this.database.prepare(INSERT);
      this.database.exec("BEGIN");
      try {
        for (const event of events) {
          insert.run(
            event.eventId,
            event.eventType,
            event.caseId ?? null,
            event.busId ?? null,
            event.actor,
            event.timestamp,
            JSON.stringify(event.detail ?? {}),
          );
        }
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
    fs.appendFileSync(
      this.path,
      events.map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8",
    );
  }

  /** Newest events first. Asynchronous so a network database can back it. */
  async read(query: AuditQuery): Promise<OperationsAuditEvent[]> {
    return this.database
      ? this.readFromDatabase(query)
      : this.readFromFile(query);
  }

  private readFromDatabase(query: AuditQuery): OperationsAuditEvent[] {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.caseId !== undefined) {
      conditions.push("case_id = ?");
      values.push(query.caseId);
    }
    if (query.busId !== undefined) {
      conditions.push("bus_id = ?");
      values.push(query.busId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      ?.prepare(
        `SELECT event_id, event_type, case_id, bus_id, actor, timestamp, detail_json FROM audit_events ${where} ORDER BY sequence DESC LIMIT ?`,
      )
      .all(...values, query.limit) as AuditRow[];
    return (rows ?? []).map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      ...(row.case_id !== null ? { caseId: row.case_id } : {}),
      ...(row.bus_id !== null ? { busId: row.bus_id } : {}),
      actor: row.actor,
      timestamp: row.timestamp,
      detail: JSON.parse(row.detail_json) as Record<string, unknown>,
    }));
  }

  private readFromFile(query: AuditQuery): OperationsAuditEvent[] {
    if (!fs.existsSync(this.path)) return [];
    const matches: OperationsAuditEvent[] = [];
    const lines = fs.readFileSync(this.path, "utf8").split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (!lines[index]) continue;
      let parsed: OperationsAuditEvent;
      try {
        parsed = JSON.parse(lines[index]) as OperationsAuditEvent;
      } catch (error) {
        logger.warn("Skipped an unreadable audit line", undefined, {
          error: String(error),
        });
        continue;
      }
      if (query.caseId !== undefined && parsed.caseId !== query.caseId)
        continue;
      if (query.busId !== undefined && parsed.busId !== query.busId) continue;
      matches.push(parsed);
      if (matches.length >= query.limit) break;
    }
    return matches;
  }

  /** Empties the log (and removes its file when asked). */
  reset(removeFile: boolean): void {
    this.database?.exec("DELETE FROM audit_events");
    if (removeFile && fs.existsSync(this.path)) fs.unlinkSync(this.path);
  }
}
