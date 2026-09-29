import type { BusStatus } from "@buspass/shared";
import type { BusStatusFilter, BusStatusRepository } from "./ports";

/** In-memory adapter for tests and for runtimes without SQLite. Not durable. */
export class MemoryBusStatusRepository implements BusStatusRepository {
  private readonly records = new Map<string, BusStatus>();

  async get(busId: string): Promise<BusStatus | undefined> {
    const found = this.records.get(busId);
    return found ? { ...found } : undefined;
  }

  async upsert(status: BusStatus): Promise<void> {
    this.records.set(status.busId, { ...status });
  }

  async list(filter: BusStatusFilter): Promise<BusStatus[]> {
    return [...this.records.values()]
      .filter(
        (status) =>
          filter.stopCode === undefined || status.stopCode === filter.stopCode,
      )
      .sort((a, b) => (a.busId < b.busId ? -1 : a.busId > b.busId ? 1 : 0))
      .slice(0, filter.limit)
      .map((status) => ({ ...status }));
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}
