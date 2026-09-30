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
  get(caseId: string): AssistanceCase | undefined;
  /** Creates the case, or replaces it in place (its position in insertion order is kept). */
  upsert(item: AssistanceCase): void;
  /** The case that holds an intent created from this signal. */
  findBySignalId(signalId: string): AssistanceCase | undefined;
  /** The oldest open case that matches every given field. */
  findOpen(query: OpenCaseQuery): AssistanceCase | undefined;
  /** Newest update first. */
  list(filter: CaseListFilter): AssistanceCase[];
  /** Open cases, oldest first, at most `limit`. */
  listOpen(limit: number): AssistanceCase[];
  count(): number;
  countByState(): Partial<Record<AssistanceCaseState, number>>;
  clear(): void;
}
