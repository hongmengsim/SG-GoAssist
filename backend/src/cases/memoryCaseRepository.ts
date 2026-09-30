import type { AssistanceCase, AssistanceCaseState } from "@buspass/shared";
import {
  TERMINAL_CASE_STATES,
  type CaseListFilter,
  type CaseRepository,
  type OpenCaseQuery,
} from "./ports";

const isOpen = (item: AssistanceCase): boolean =>
  !TERMINAL_CASE_STATES.includes(item.state);

/** In-memory adapter for tests and for runtimes without SQLite. Not durable. */
export class MemoryCaseRepository implements CaseRepository {
  // A Map keeps insertion order, and set() on an existing key keeps its position.
  private readonly cases = new Map<string, AssistanceCase>();

  get(caseId: string): AssistanceCase | undefined {
    const found = this.cases.get(caseId);
    return found ? structuredClone(found) : undefined;
  }

  upsert(item: AssistanceCase): void {
    this.cases.set(item.caseId, structuredClone(item));
  }

  findBySignalId(signalId: string): AssistanceCase | undefined {
    for (const item of this.cases.values()) {
      if (item.intents.some((intent) => intent.signalId === signalId))
        return structuredClone(item);
    }
    return undefined;
  }

  findOpen(query: OpenCaseQuery): AssistanceCase | undefined {
    for (const item of this.cases.values()) {
      if (
        isOpen(item) &&
        (query.stopCode === undefined || item.stopCode === query.stopCode) &&
        (query.phase === undefined || item.phase === query.phase) &&
        (query.busId === undefined || (item.busId ?? null) === query.busId)
      )
        return structuredClone(item);
    }
    return undefined;
  }

  list(filter: CaseListFilter): AssistanceCase[] {
    // Newest update first; equal times list the later-inserted case first, as SQLite does.
    return [...this.cases.values()]
      .reverse()
      .filter(
        (item) =>
          (filter.busId === undefined || item.busId === filter.busId) &&
          (filter.state === undefined || item.state === filter.state),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, filter.limit)
      .map((item) => structuredClone(item));
  }

  listOpen(limit: number): AssistanceCase[] {
    return [...this.cases.values()]
      .filter(isOpen)
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  listFinishedOldest(limit: number): AssistanceCase[] {
    return [...this.cases.values()]
      .filter((item) => !isOpen(item))
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  listFinishedBefore(isoTime: string, limit: number): AssistanceCase[] {
    return this.listFinishedOldest(Number.MAX_SAFE_INTEGER)
      .filter((item) => item.updatedAt < isoTime)
      .slice(0, limit);
  }

  countFinished(): number {
    let total = 0;
    for (const item of this.cases.values()) if (!isOpen(item)) total += 1;
    return total;
  }

  delete(caseId: string): void {
    this.cases.delete(caseId);
  }

  count(): number {
    return this.cases.size;
  }

  countByState(): Partial<Record<AssistanceCaseState, number>> {
    const counts: Partial<Record<AssistanceCaseState, number>> = {};
    for (const item of this.cases.values())
      counts[item.state] = (counts[item.state] ?? 0) + 1;
    return counts;
  }

  clear(): void {
    this.cases.clear();
  }
}
