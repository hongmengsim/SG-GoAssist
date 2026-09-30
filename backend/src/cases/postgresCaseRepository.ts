import type { AssistanceCase, AssistanceCaseState } from "@buspass/shared";
import {
  createSchemaObjects,
  inTransaction,
  toNumber,
  type PgPool,
} from "../storage/postgres";
import {
  TERMINAL_CASE_STATES,
  type CaseListFilter,
  type CaseRepository,
  type OpenCaseQuery,
} from "./ports";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS cases (
    seq BIGSERIAL,
    case_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    bus_id TEXT,
    stop_code TEXT NOT NULL,
    phase TEXT NOT NULL,
    is_open INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    body_json TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS cases_seq ON cases (seq)",
  "CREATE INDEX IF NOT EXISTS cases_open_stop ON cases (is_open, stop_code, phase)",
  "CREATE INDEX IF NOT EXISTS cases_bus ON cases (bus_id, updated_at)",
  "CREATE INDEX IF NOT EXISTS cases_open_bus ON cases (is_open, bus_id)",
  "CREATE INDEX IF NOT EXISTS cases_state ON cases (state, updated_at)",
  "CREATE INDEX IF NOT EXISTS cases_finished ON cases (is_open, updated_at)",
  `CREATE TABLE IF NOT EXISTS case_signals (
    signal_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS case_signals_case ON case_signals (case_id)",
];

const parse = (row: Record<string, unknown>): AssistanceCase =>
  JSON.parse(String(row.body_json)) as AssistanceCase;

/**
 * One row per case on Postgres, with the same columns, indexes and ordering rules as the
 * SQLite adapter (the contract tests run against both). Created on first use.
 */
export class PostgresCaseRepository implements CaseRepository {
  private readonly ready: Promise<void>;

  constructor(private readonly pool: PgPool) {
    this.ready = createSchemaObjects(pool, SCHEMA);
    this.ready.catch(() => undefined);
  }

  private async query(text: string, values: unknown[] = []) {
    await this.ready;
    return this.pool.query(text, values);
  }

  async get(caseId: string): Promise<AssistanceCase | undefined> {
    const result = await this.query(
      "SELECT body_json FROM cases WHERE case_id = $1",
      [caseId],
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }

  async upsert(item: AssistanceCase): Promise<void> {
    await this.ready;
    const open = TERMINAL_CASE_STATES.includes(item.state) ? 0 : 1;
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO cases (case_id, state, bus_id, stop_code, phase, is_open, updated_at, body_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (case_id) DO UPDATE SET
           state = EXCLUDED.state, bus_id = EXCLUDED.bus_id, stop_code = EXCLUDED.stop_code,
           phase = EXCLUDED.phase, is_open = EXCLUDED.is_open, updated_at = EXCLUDED.updated_at,
           body_json = EXCLUDED.body_json`,
        [
          item.caseId,
          item.state,
          item.busId ?? null,
          item.stopCode,
          item.phase,
          open,
          item.updatedAt,
          JSON.stringify(item),
        ],
      );
      for (const intent of item.intents)
        await client.query(
          `INSERT INTO case_signals (signal_id, case_id) VALUES ($1, $2)
           ON CONFLICT (signal_id) DO UPDATE SET case_id = EXCLUDED.case_id`,
          [intent.signalId, item.caseId],
        );
    });
  }

  async findBySignalId(signalId: string): Promise<AssistanceCase | undefined> {
    const result = await this.query(
      `SELECT c.body_json FROM case_signals s JOIN cases c ON c.case_id = s.case_id
       WHERE s.signal_id = $1`,
      [signalId],
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }

  async findOpen(query: OpenCaseQuery): Promise<AssistanceCase | undefined> {
    const values: unknown[] = [];
    const conditions = ["is_open = 1"];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (query.stopCode !== undefined)
      conditions.push(`stop_code = ${bind(query.stopCode)}`);
    if (query.phase !== undefined)
      conditions.push(`phase = ${bind(query.phase)}`);
    if (query.busId === null) conditions.push("bus_id IS NULL");
    else if (query.busId !== undefined)
      conditions.push(`bus_id = ${bind(query.busId)}`);
    const result = await this.query(
      `SELECT body_json FROM cases WHERE ${conditions.join(" AND ")} ORDER BY seq LIMIT 1`,
      values,
    );
    return result.rows[0] ? parse(result.rows[0]) : undefined;
  }

  async list(filter: CaseListFilter): Promise<AssistanceCase[]> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filter.busId !== undefined)
      conditions.push(`bus_id = ${bind(filter.busId)}`);
    if (filter.state !== undefined)
      conditions.push(`state = ${bind(filter.state)}`);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.query(
      `SELECT body_json FROM cases ${where} ORDER BY updated_at DESC, seq DESC LIMIT ${bind(filter.limit)}`,
      values,
    );
    return result.rows.map(parse);
  }

  async listOpen(limit: number): Promise<AssistanceCase[]> {
    const result = await this.query(
      "SELECT body_json FROM cases WHERE is_open = 1 ORDER BY seq LIMIT $1",
      [limit],
    );
    return result.rows.map(parse);
  }

  async listOpenForBus(
    busId: string,
    limit: number,
  ): Promise<AssistanceCase[]> {
    const result = await this.query(
      "SELECT body_json FROM cases WHERE is_open = 1 AND bus_id = $1 ORDER BY seq LIMIT $2",
      [busId, limit],
    );
    return result.rows.map(parse);
  }

  async listFinishedOldest(limit: number): Promise<AssistanceCase[]> {
    const result = await this.query(
      "SELECT body_json FROM cases WHERE is_open = 0 ORDER BY updated_at, seq LIMIT $1",
      [limit],
    );
    return result.rows.map(parse);
  }

  async listFinishedBefore(
    isoTime: string,
    limit: number,
  ): Promise<AssistanceCase[]> {
    const result = await this.query(
      "SELECT body_json FROM cases WHERE is_open = 0 AND updated_at < $1 ORDER BY updated_at, seq LIMIT $2",
      [isoTime, limit],
    );
    return result.rows.map(parse);
  }

  async countFinished(): Promise<number> {
    const result = await this.query(
      "SELECT COUNT(*) AS total FROM cases WHERE is_open = 0",
    );
    return toNumber(result.rows[0].total);
  }

  async delete(caseId: string): Promise<void> {
    await this.ready;
    await inTransaction(this.pool, async (client) => {
      await client.query("DELETE FROM cases WHERE case_id = $1", [caseId]);
      await client.query("DELETE FROM case_signals WHERE case_id = $1", [
        caseId,
      ]);
    });
  }

  async count(): Promise<number> {
    const result = await this.query("SELECT COUNT(*) AS total FROM cases");
    return toNumber(result.rows[0].total);
  }

  async countByState(): Promise<Partial<Record<AssistanceCaseState, number>>> {
    const result = await this.query(
      "SELECT state, COUNT(*) AS total FROM cases GROUP BY state",
    );
    const counts: Partial<Record<AssistanceCaseState, number>> = {};
    for (const row of result.rows)
      counts[row.state as AssistanceCaseState] = toNumber(row.total);
    return counts;
  }

  async clear(): Promise<void> {
    await this.ready;
    await inTransaction(this.pool, async (client) => {
      await client.query("DELETE FROM cases");
      await client.query("DELETE FROM case_signals");
    });
  }
}
