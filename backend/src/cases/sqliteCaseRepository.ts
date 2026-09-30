import type { AssistanceCase, AssistanceCaseState } from "@buspass/shared";
import type { SqliteDatabase, SqliteStatement } from "../storage/sqlite";
import {
  TERMINAL_CASE_STATES,
  type CaseListFilter,
  type CaseRepository,
  type OpenCaseQuery,
} from "./ports";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cases (
    case_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    bus_id TEXT,
    stop_code TEXT NOT NULL,
    phase TEXT NOT NULL,
    is_open INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    body_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS cases_open_stop ON cases (is_open, stop_code, phase);
  CREATE INDEX IF NOT EXISTS cases_bus ON cases (bus_id, updated_at);
  CREATE INDEX IF NOT EXISTS cases_open_bus ON cases (is_open, bus_id);
  CREATE INDEX IF NOT EXISTS cases_state ON cases (state, updated_at);
  CREATE INDEX IF NOT EXISTS cases_finished ON cases (is_open, updated_at);
  CREATE TABLE IF NOT EXISTS case_signals (
    signal_id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS case_signals_case ON case_signals (case_id);
`;

interface BodyRow {
  body_json: string;
}

const parse = (row: unknown): AssistanceCase =>
  JSON.parse((row as BodyRow).body_json) as AssistanceCase;

/**
 * One row per case, written in place. The whole case is kept as JSON so its shape can grow;
 * the fields the service looks cases up by are separate, indexed columns, and each signal
 * that created an intent is indexed. Rows keep their insertion order (the implicit rowid),
 * because an update never replaces the row.
 */
export class SqliteCaseRepository implements CaseRepository {
  private readonly selectOne: SqliteStatement;
  private readonly upsertOne: SqliteStatement;
  private readonly upsertSignal: SqliteStatement;
  private readonly bySignal: SqliteStatement;
  private readonly openMatches = new Map<string, SqliteStatement>();
  private readonly openList: SqliteStatement;
  private readonly openForBus: SqliteStatement;
  private readonly finishedOldest: SqliteStatement;
  private readonly finishedBefore: SqliteStatement;
  private readonly countFinishedStatement: SqliteStatement;
  private readonly deleteCase: SqliteStatement;
  private readonly deleteSignals: SqliteStatement;
  private readonly countAll: SqliteStatement;
  private readonly countStates: SqliteStatement;
  private readonly clearCases: SqliteStatement;
  private readonly clearSignals: SqliteStatement;

  constructor(private readonly database: SqliteDatabase) {
    database.exec(SCHEMA);
    this.selectOne = database.prepare(
      "SELECT body_json FROM cases WHERE case_id = ?",
    );
    this.upsertOne = database.prepare(
      `INSERT INTO cases (case_id, state, bus_id, stop_code, phase, is_open, updated_at, body_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(case_id) DO UPDATE SET
         state = excluded.state, bus_id = excluded.bus_id, stop_code = excluded.stop_code,
         phase = excluded.phase, is_open = excluded.is_open, updated_at = excluded.updated_at,
         body_json = excluded.body_json`,
    );
    this.upsertSignal = database.prepare(
      `INSERT INTO case_signals (signal_id, case_id) VALUES (?, ?)
       ON CONFLICT(signal_id) DO UPDATE SET case_id = excluded.case_id`,
    );
    this.bySignal = database.prepare(
      `SELECT c.body_json FROM case_signals s JOIN cases c ON c.case_id = s.case_id
       WHERE s.signal_id = ?`,
    );
    this.openList = database.prepare(
      "SELECT body_json FROM cases WHERE is_open = 1 ORDER BY rowid LIMIT ?",
    );
    this.openForBus = database.prepare(
      "SELECT body_json FROM cases WHERE is_open = 1 AND bus_id = ? ORDER BY rowid LIMIT ?",
    );
    this.finishedOldest = database.prepare(
      "SELECT body_json FROM cases WHERE is_open = 0 ORDER BY updated_at, rowid LIMIT ?",
    );
    this.finishedBefore = database.prepare(
      "SELECT body_json FROM cases WHERE is_open = 0 AND updated_at < ? ORDER BY updated_at, rowid LIMIT ?",
    );
    this.countFinishedStatement = database.prepare(
      "SELECT COUNT(*) AS total FROM cases WHERE is_open = 0",
    );
    this.deleteCase = database.prepare("DELETE FROM cases WHERE case_id = ?");
    this.deleteSignals = database.prepare(
      "DELETE FROM case_signals WHERE case_id = ?",
    );
    this.countAll = database.prepare("SELECT COUNT(*) AS total FROM cases");
    this.countStates = database.prepare(
      "SELECT state, COUNT(*) AS total FROM cases GROUP BY state",
    );
    this.clearCases = database.prepare("DELETE FROM cases");
    this.clearSignals = database.prepare("DELETE FROM case_signals");
  }

  async get(caseId: string): Promise<AssistanceCase | undefined> {
    const row = this.selectOne.get(caseId);
    return row ? parse(row) : undefined;
  }

  async upsert(item: AssistanceCase): Promise<void> {
    const open = TERMINAL_CASE_STATES.includes(item.state) ? 0 : 1;
    this.database.exec("BEGIN");
    try {
      this.upsertOne.run(
        item.caseId,
        item.state,
        item.busId ?? null,
        item.stopCode,
        item.phase,
        open,
        item.updatedAt,
        JSON.stringify(item),
      );
      for (const intent of item.intents)
        this.upsertSignal.run(intent.signalId, item.caseId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async findBySignalId(signalId: string): Promise<AssistanceCase | undefined> {
    const row = this.bySignal.get(signalId);
    return row ? parse(row) : undefined;
  }

  async findOpen(query: OpenCaseQuery): Promise<AssistanceCase | undefined> {
    const values: unknown[] = [];
    const conditions = ["is_open = 1"];
    if (query.stopCode !== undefined) {
      conditions.push("stop_code = ?");
      values.push(query.stopCode);
    }
    if (query.phase !== undefined) {
      conditions.push("phase = ?");
      values.push(query.phase);
    }
    if (query.busId === null) conditions.push("bus_id IS NULL");
    else if (query.busId !== undefined) {
      conditions.push("bus_id = ?");
      values.push(query.busId);
    }
    const row = this.openMatchStatement(conditions).get(...values);
    return row ? parse(row) : undefined;
  }

  /** The statement for one combination of conditions, prepared once and reused. */
  openMatchStatement(conditions: string[]): SqliteStatement {
    const sql = `SELECT body_json FROM cases WHERE ${conditions.join(" AND ")} ORDER BY rowid LIMIT 1`;
    let statement = this.openMatches.get(sql);
    if (!statement) {
      statement = this.database.prepare(sql);
      this.openMatches.set(sql, statement);
    }
    return statement;
  }

  async list(filter: CaseListFilter): Promise<AssistanceCase[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.busId !== undefined) {
      conditions.push("bus_id = ?");
      values.push(filter.busId);
    }
    if (filter.state !== undefined) {
      conditions.push("state = ?");
      values.push(filter.state);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return this.database
      .prepare(
        `SELECT body_json FROM cases ${where} ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      )
      .all(...values, filter.limit)
      .map(parse);
  }

  async listOpen(limit: number): Promise<AssistanceCase[]> {
    return this.openList.all(limit).map(parse);
  }

  async listOpenForBus(
    busId: string,
    limit: number,
  ): Promise<AssistanceCase[]> {
    return this.openForBus.all(busId, limit).map(parse);
  }

  async listFinishedOldest(limit: number): Promise<AssistanceCase[]> {
    return this.finishedOldest.all(limit).map(parse);
  }

  async listFinishedBefore(
    isoTime: string,
    limit: number,
  ): Promise<AssistanceCase[]> {
    return this.finishedBefore.all(isoTime, limit).map(parse);
  }

  async countFinished(): Promise<number> {
    return (this.countFinishedStatement.get() as { total: number }).total;
  }

  async delete(caseId: string): Promise<void> {
    this.deleteCase.run(caseId);
    this.deleteSignals.run(caseId);
  }

  async count(): Promise<number> {
    return (this.countAll.get() as { total: number }).total;
  }

  async countByState(): Promise<Partial<Record<AssistanceCaseState, number>>> {
    const counts: Partial<Record<AssistanceCaseState, number>> = {};
    for (const row of this.countStates.all() as Array<{
      state: AssistanceCaseState;
      total: number;
    }>)
      counts[row.state] = row.total;
    return counts;
  }

  async clear(): Promise<void> {
    this.clearCases.run();
    this.clearSignals.run();
  }
}
