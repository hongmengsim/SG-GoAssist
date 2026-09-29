import type { BayStatus, BusStatus } from "@buspass/shared";

export interface BusStatusFilter {
  stopCode?: string;
  /** Callers always pass a bound; adapters must honour it. */
  limit: number;
}

/**
 * Latest known status per bus. The interface is asynchronous so a network database can
 * replace the SQLite adapter without changing the service.
 *
 * Contract every adapter must meet: one record per bus id, a write costs the same
 * however many buses are stored, and list never returns more than the limit.
 */
export interface BusStatusRepository {
  get(busId: string): Promise<BusStatus | undefined>;
  upsert(status: BusStatus): Promise<void>;
  list(filter: BusStatusFilter): Promise<BusStatus[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * One row per stop (the partition key). Cost of a read or write never depends on how many
 * stops exist.
 */
export interface BayRepository {
  get(stopCode: string): Promise<BayStatus | undefined>;
  upsert(bay: BayStatus): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
