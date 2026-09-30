import type { BayStatus, BusMovementState, BusStatus } from "@buspass/shared";
import type { SqliteDatabase, SqliteStatement } from "../storage/sqlite";
import type {
  BayRepository,
  BusStatusFilter,
  BusStatusRepository,
} from "./ports";

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
  private readonly insertIfAbsent: SqliteStatement;
  private readonly swap: SqliteStatement;
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
    this.insertIfAbsent = database.prepare(
      `INSERT INTO bus_status (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bus_id) DO NOTHING`,
    );
    // Every column must still match what the caller read; IS compares NULLs as equal.
    this.swap = database.prepare(
      `UPDATE bus_status SET bus_service = ?, stop_code = ?, bay_id = ?, movement = ?, simulated = ?, observed_at = ?
       WHERE bus_id = ? AND bus_service IS ? AND stop_code IS ? AND bay_id IS ?
         AND movement IS ? AND simulated IS ? AND observed_at IS ?`,
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

  async compareAndUpsert(
    expected: BusStatus | undefined,
    next: BusStatus,
  ): Promise<boolean> {
    const values = (status: BusStatus) => [
      status.busService,
      status.stopCode ?? null,
      status.bayId ?? null,
      status.movement,
      status.simulated ? 1 : 0,
      status.observedAt,
    ];
    const result = (
      expected === undefined
        ? this.insertIfAbsent.run(next.busId, ...values(next))
        : this.swap.run(...values(next), next.busId, ...values(expected))
    ) as { changes: number | bigint };
    return Number(result.changes) === 1;
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

interface BayRow {
  stop_code: string;
  bay_id: string;
  occupant_bus_id: string | null;
  waiting_bus_ids: string;
  granted_bus_id: string | null;
  updated_at: string;
}

const BAY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS bay_status (
    stop_code TEXT PRIMARY KEY,
    bay_id TEXT NOT NULL,
    occupant_bus_id TEXT,
    waiting_bus_ids TEXT NOT NULL,
    granted_bus_id TEXT,
    updated_at TEXT NOT NULL
  );
`;

/** One row per stop, written in place; the queue is a short JSON array. */
export class SqliteBayRepository implements BayRepository {
  private readonly selectOne: SqliteStatement;
  private readonly upsertOne: SqliteStatement;
  private readonly countAll: SqliteStatement;
  private readonly deleteAll: SqliteStatement;

  constructor(database: SqliteDatabase) {
    database.exec(BAY_SCHEMA);
    this.selectOne = database.prepare(
      "SELECT * FROM bay_status WHERE stop_code = ?",
    );
    this.upsertOne = database.prepare(
      `INSERT INTO bay_status (stop_code, bay_id, occupant_bus_id, waiting_bus_ids, granted_bus_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(stop_code) DO UPDATE SET
         bay_id = excluded.bay_id, occupant_bus_id = excluded.occupant_bus_id,
         waiting_bus_ids = excluded.waiting_bus_ids, granted_bus_id = excluded.granted_bus_id,
         updated_at = excluded.updated_at`,
    );
    this.countAll = database.prepare(
      "SELECT COUNT(*) AS total FROM bay_status",
    );
    this.deleteAll = database.prepare("DELETE FROM bay_status");
  }

  async get(stopCode: string): Promise<BayStatus | undefined> {
    const row = this.selectOne.get(stopCode) as BayRow | undefined;
    if (!row) return undefined;
    return {
      stopCode: row.stop_code,
      bayId: row.bay_id,
      occupantBusId: row.occupant_bus_id,
      waitingBusIds: JSON.parse(row.waiting_bus_ids) as string[],
      grantedBusId: row.granted_bus_id,
      updatedAt: row.updated_at,
    };
  }

  async upsert(bay: BayStatus): Promise<void> {
    this.upsertOne.run(
      bay.stopCode,
      bay.bayId,
      bay.occupantBusId,
      JSON.stringify(bay.waitingBusIds),
      bay.grantedBusId,
      bay.updatedAt,
    );
  }

  async count(): Promise<number> {
    return Number((this.countAll.get() as { total: number | bigint }).total);
  }

  async clear(): Promise<void> {
    this.deleteAll.run();
  }
}
