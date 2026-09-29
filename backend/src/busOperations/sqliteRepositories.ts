import type { BusMovementState, BusStatus } from "@buspass/shared";
import type { SqliteDatabase, SqliteStatement } from "../storage/sqlite";
import type { BusStatusFilter, BusStatusRepository } from "./ports";

interface BusStatusRow {
  bus_id: string;
  bus_service: string;
  stop_code: string | null;
  bay_id: string | null;
  movement: string;
  simulated: number;
  observed_at: string;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS bus_status (
    bus_id TEXT PRIMARY KEY,
    bus_service TEXT NOT NULL,
    stop_code TEXT,
    bay_id TEXT,
    movement TEXT NOT NULL,
    simulated INTEGER NOT NULL,
    observed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bus_status_stop_code ON bus_status (stop_code, bus_id);
`;

const COLUMNS =
  "bus_id, bus_service, stop_code, bay_id, movement, simulated, observed_at";

function toStatus(row: BusStatusRow): BusStatus {
  const status: BusStatus = {
    busId: row.bus_id,
    busService: row.bus_service,
    movement: row.movement as BusMovementState,
    simulated: row.simulated === 1,
    observedAt: row.observed_at,
  };
  if (row.stop_code !== null) status.stopCode = row.stop_code;
  if (row.bay_id !== null) status.bayId = row.bay_id;
  return status;
}

/**
 * One row per bus, written in place. Every statement is prepared once and uses the primary
 * key or the stop index, so cost per operation does not depend on how many buses exist.
 */
export class SqliteBusStatusRepository implements BusStatusRepository {
  private readonly selectOne: SqliteStatement;
  private readonly upsertOne: SqliteStatement;
  private readonly listAll: SqliteStatement;
  private readonly listByStop: SqliteStatement;
  private readonly countAll: SqliteStatement;
  private readonly deleteAll: SqliteStatement;

  constructor(database: SqliteDatabase) {
    database.exec(SCHEMA);
    this.selectOne = database.prepare(
      `SELECT ${COLUMNS} FROM bus_status WHERE bus_id = ?`,
    );
    this.upsertOne = database.prepare(
      `INSERT INTO bus_status (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bus_id) DO UPDATE SET
         bus_service = excluded.bus_service, stop_code = excluded.stop_code, bay_id = excluded.bay_id,
         movement = excluded.movement, simulated = excluded.simulated, observed_at = excluded.observed_at`,
    );
    this.listAll = database.prepare(
      `SELECT ${COLUMNS} FROM bus_status ORDER BY bus_id LIMIT ?`,
    );
    this.listByStop = database.prepare(
      `SELECT ${COLUMNS} FROM bus_status WHERE stop_code = ? ORDER BY bus_id LIMIT ?`,
    );
    this.countAll = database.prepare(
      "SELECT COUNT(*) AS total FROM bus_status",
    );
    this.deleteAll = database.prepare("DELETE FROM bus_status");
  }

  async get(busId: string): Promise<BusStatus | undefined> {
    const row = this.selectOne.get(busId) as BusStatusRow | undefined;
    return row ? toStatus(row) : undefined;
  }

  async upsert(status: BusStatus): Promise<void> {
    this.upsertOne.run(
      status.busId,
      status.busService,
      status.stopCode ?? null,
      status.bayId ?? null,
      status.movement,
      status.simulated ? 1 : 0,
      status.observedAt,
    );
  }

  async list(filter: BusStatusFilter): Promise<BusStatus[]> {
    const rows = (
      filter.stopCode === undefined
        ? this.listAll.all(filter.limit)
        : this.listByStop.all(filter.stopCode, filter.limit)
    ) as BusStatusRow[];
    return rows.map(toStatus);
  }

  async count(): Promise<number> {
    return Number((this.countAll.get() as { total: number | bigint }).total);
  }

  async clear(): Promise<void> {
    this.deleteAll.run();
  }
}
