import type { AssistanceCase, AssistanceCaseState } from "@buspass/shared";

/** A case that no longer needs anyone; every other state is "open". */
export const TERMINAL_CASE_STATES: readonly AssistanceCaseState[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

export interface OpenCaseQuery {
  stopCode?: string;
  phase?: string;
  /** A bus id to match, null for a case with no bus yet, undefined for any. */
  busId?: string | null;
}

export interface CaseListFilter {
  busId?: string;
  state?: AssistanceCaseState;
  /** Callers always pass a bound; adapters must honour it. */
  limit: number;
}

/**
 * One record per case. This port is synchronous on purpose: the case service and the store
 * it replaces are synchronous, and making them asynchronous would touch every caller. A
 * network database would need the service made asynchronous first.
 *
 * Contract every adapter must meet: a write touches only that case, every lookup used by
 * the service is answered from an index (none reads all cases), list never returns more
 * than the limit, and a returned case cannot alter what is stored.
 */
export interface CaseRepository {
  get(caseId: string): Promise<AssistanceCase | undefined>;
  /** Creates the case, or replaces it in place (its position in insertion order is kept). */
  upsert(item: AssistanceCase): Promise<void>;
  /** The case that holds an intent created from this signal. */
  findBySignalId(signalId: string): Promise<AssistanceCase | undefined>;
  /** The oldest open case that matches every given field. */
  findOpen(query: OpenCaseQuery): Promise<AssistanceCase | undefined>;
  /** Newest update first. */
  list(filter: CaseListFilter): Promise<AssistanceCase[]>;
  /** Open cases, oldest first, at most `limit`. */
  listOpen(limit: number): Promise<AssistanceCase[]>;
  /** Open cases of one bus, oldest first, at most `limit`, answered from an index. */
  listOpenForBus(busId: string, limit: number): Promise<AssistanceCase[]>;
  /** Finished cases, least recently updated first, at most `limit`. */
  listFinishedOldest(limit: number): Promise<AssistanceCase[]>;
  /** Finished cases last updated before this ISO time, oldest first, at most `limit`. */
  listFinishedBefore(isoTime: string, limit: number): Promise<AssistanceCase[]>;
  countFinished(): Promise<number>;
  delete(caseId: string): Promise<void>;
  count(): Promise<number>;
  countByState(): Promise<Partial<Record<AssistanceCaseState, number>>>;
  clear(): Promise<void>;
}
