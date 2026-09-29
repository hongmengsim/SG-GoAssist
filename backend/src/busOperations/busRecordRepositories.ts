import type { SqliteDatabase, SqliteStatement } from "../storage/sqlite";
import type { BusRecord, BusRecordRepository } from "./ports";

/** In-memory adapter for tests and for runtimes without SQLite. Not durable. */
export class MemoryBusRecordRepository<
  T extends BusRecord = BusRecord,
> implements BusRecordRepository<T> {
  private readonly records = new Map<string, T>();

  async get(busId: string): Promise<T | undefined> {
    const found = this.records.get(busId);
    return found ? structuredClone(found) : undefined;
  }

  async upsert(record: T): Promise<void> {
    this.records.set(record.busId, structuredClone(record));
  }

  async list(limit: number): Promise<T[]> {
    return [...this.records.values()]
      .sort((a, b) => (a.busId < b.busId ? -1 : a.busId > b.busId ? 1 : 0))
      .slice(0, limit)
      .map((record) => structuredClone(record));
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

const TABLE_NAME = /^[a-z_]+$/;

/** One row per bus holding the record as JSON; the bus id is the primary key. */
export class SqliteBusRecordRepository<
  T extends BusRecord = BusRecord,
> implements BusRecordRepository<T> {
  private readonly selectOne: SqliteStatement;
  private readonly upsertOne: SqliteStatement;
  private readonly listAll: SqliteStatement;
  private readonly countAll: SqliteStatement;
  private readonly deleteAll: SqliteStatement;

  constructor(database: SqliteDatabase, table: string) {
    if (!TABLE_NAME.test(table)) throw new Error("Invalid table name");
    database.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (bus_id TEXT PRIMARY KEY, observed_at TEXT NOT NULL, record_json TEXT NOT NULL)`,
    );
    this.selectOne = database.prepare(
      `SELECT record_json FROM ${table} WHERE bus_id = ?`,
    );
    this.upsertOne = database.prepare(
      `INSERT INTO ${table} (bus_id, observed_at, record_json) VALUES (?, ?, ?)
       ON CONFLICT(bus_id) DO UPDATE SET observed_at = excluded.observed_at, record_json = excluded.record_json`,
    );
    this.listAll = database.prepare(
      `SELECT record_json FROM ${table} ORDER BY bus_id LIMIT ?`,
    );
    this.countAll = database.prepare(`SELECT COUNT(*) AS total FROM ${table}`);
    this.deleteAll = database.prepare(`DELETE FROM ${table}`);
  }

  async get(busId: string): Promise<T | undefined> {
    const row = this.selectOne.get(busId) as
      { record_json: string } | undefined;
    return row ? (JSON.parse(row.record_json) as T) : undefined;
  }

  async upsert(record: T): Promise<void> {
    this.upsertOne.run(record.busId, record.observedAt, JSON.stringify(record));
  }

  async list(limit: number): Promise<T[]> {
    return (this.listAll.all(limit) as Array<{ record_json: string }>).map(
      (row) => JSON.parse(row.record_json) as T,
    );
  }

  async count(): Promise<number> {
    return Number((this.countAll.get() as { total: number | bigint }).total);
  }

  async clear(): Promise<void> {
    this.deleteAll.run();
  }
}
