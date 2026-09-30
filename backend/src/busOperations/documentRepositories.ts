import type { BayStatus, BusStatus } from "@buspass/shared";
import type { DocumentTable, TableSpec } from "../storage/documentTable";
import type {
  BayRepository,
  BusRecord,
  BusRecordRepository,
  BusStatusFilter,
  BusStatusRepository,
} from "./ports";

/**
 * The bus-operations repositories built on the generic keyed table, so they work on any
 * table adapter (Postgres in particular) without a hand-written SQL version of each. The
 * SQLite adapters stay as they are; the contract tests hold both to the same behaviour.
 */

export const busStatusTableSpec: TableSpec<BusStatus> = {
  name: "bus_status",
  key: (status) => status.busId,
  indexes: { stopCode: (status) => status.stopCode },
  orderBy: "key",
};

export const bayTableSpec: TableSpec<BayStatus> = {
  name: "bay_status",
  key: (bay) => bay.stopCode,
};

export function busRecordTableSpec<T extends BusRecord>(
  name: string,
): TableSpec<T> {
  return { name, key: (record) => record.busId, orderBy: "key" };
}

export class DocumentBusStatusRepository implements BusStatusRepository {
  constructor(private readonly table: DocumentTable<BusStatus>) {}

  get(busId: string): Promise<BusStatus | undefined> {
    return this.table.get(busId);
  }

  upsert(status: BusStatus): Promise<void> {
    return this.table.put(status);
  }

  list(filter: BusStatusFilter): Promise<BusStatus[]> {
    return filter.stopCode === undefined
      ? this.table.list(filter.limit)
      : this.table.find("stopCode", filter.stopCode, filter.limit);
  }

  count(): Promise<number> {
    return this.table.count();
  }

  clear(): Promise<void> {
    return this.table.clear();
  }
}

export class DocumentBayRepository implements BayRepository {
  constructor(private readonly table: DocumentTable<BayStatus>) {}

  get(stopCode: string): Promise<BayStatus | undefined> {
    return this.table.get(stopCode);
  }

  upsert(bay: BayStatus): Promise<void> {
    return this.table.put(bay);
  }

  count(): Promise<number> {
    return this.table.count();
  }

  clear(): Promise<void> {
    return this.table.clear();
  }
}

export class DocumentBusRecordRepository<
  T extends BusRecord = BusRecord,
> implements BusRecordRepository<T> {
  constructor(private readonly table: DocumentTable<T>) {}

  get(busId: string): Promise<T | undefined> {
    return this.table.get(busId);
  }

  upsert(record: T): Promise<void> {
    return this.table.put(record);
  }

  list(limit: number): Promise<T[]> {
    return this.table.list(limit);
  }

  count(): Promise<number> {
    return this.table.count();
  }

  clear(): Promise<void> {
    return this.table.clear();
  }
}
