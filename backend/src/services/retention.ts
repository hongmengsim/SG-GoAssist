import type {
  ActuatorCommand,
  ActuatorStatus,
  AssistanceCase,
} from "@buspass/shared";
import type { OperationsState } from "./operationsStore";

/**
 * How much the operations store keeps. Without a limit the store grows for ever and every
 * write rewrites all of it (docs/architecture/scalability.md, SM3 and SC6).
 *
 * The defaults are placeholders chosen to keep a long demo small; they are not agreed values.
 */
export interface RetentionPolicy {
  /** A finished case older than this is archived and removed. */
  finishedCaseMaxAgeMs: number;
  /** At most this many finished cases stay; the oldest are archived first. */
  maxFinishedCases: number;
  /** At most this many records stay in each growing series (newest kept). */
  maxSeriesRecords: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  finishedCaseMaxAgeMs: 7 * DAY_MS,
  maxFinishedCases: 2000,
  maxSeriesRecords: 5000,
};

/** A case that no longer needs anyone. Escalated, blocked and unconfirmed cases are never removed. */
const FINISHED_STATES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export interface ArchivedCase {
  case: AssistanceCase;
  commands: ActuatorCommand[];
  statuses: ActuatorStatus[];
}

export interface RetentionResult {
  state: OperationsState;
  archived: ArchivedCase[];
}

function positiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function retentionPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): RetentionPolicy {
  const days = positiveNumber(env.GOASSIST_RETENTION_CASE_DAYS);
  const cases = positiveNumber(env.GOASSIST_RETENTION_MAX_FINISHED_CASES);
  const series = positiveNumber(env.GOASSIST_RETENTION_MAX_SERIES_RECORDS);
  return {
    finishedCaseMaxAgeMs:
      days === undefined
        ? DEFAULT_RETENTION_POLICY.finishedCaseMaxAgeMs
        : days * DAY_MS,
    maxFinishedCases:
      cases === undefined
        ? DEFAULT_RETENTION_POLICY.maxFinishedCases
        : Math.floor(cases),
    maxSeriesRecords:
      series === undefined
        ? DEFAULT_RETENTION_POLICY.maxSeriesRecords
        : Math.floor(series),
  };
}

function newest<T>(records: T[], limit: number): T[] {
  return records.length > limit
    ? records.slice(records.length - limit)
    : records;
}

function updatedAtMs(item: AssistanceCase): number {
  const parsed = Date.parse(item.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Returns the trimmed state and what was removed; the input is not changed. */
export function applyRetention(
  state: OperationsState,
  policy: RetentionPolicy,
  nowMs: number,
): RetentionResult {
  const finished = state.cases.filter((item) =>
    FINISHED_STATES.has(item.state),
  );
  const byNewest = [...finished].sort(
    (a, b) => updatedAtMs(b) - updatedAtMs(a),
  );
  const removedIds = new Set<string>();
  byNewest.forEach((item, index) => {
    const tooOld = nowMs - updatedAtMs(item) > policy.finishedCaseMaxAgeMs;
    if (tooOld || index >= policy.maxFinishedCases) {
      removedIds.add(item.caseId);
    }
  });

  const archived: ArchivedCase[] = state.cases
    .filter((item) => removedIds.has(item.caseId))
    .map((item) => ({
      case: item,
      commands: state.actuatorCommands.filter(
        (command) => command.caseId === item.caseId,
      ),
      statuses: state.actuatorStatuses.filter(
        (status) => status.caseId === item.caseId,
      ),
    }));

  const keep = policy.maxSeriesRecords;
  return {
    state: {
      ...state,
      cases: state.cases.filter((item) => !removedIds.has(item.caseId)),
      actuatorCommands: newest(
        state.actuatorCommands.filter(
          (command) => !removedIds.has(command.caseId),
        ),
        keep,
      ),
      actuatorStatuses: newest(
        state.actuatorStatuses.filter(
          (status) => !removedIds.has(status.caseId),
        ),
        keep,
      ),
      observations: newest(state.observations, keep),
      safetyTelemetry: newest(state.safetyTelemetry, keep),
      rampObstacleClassifications: newest(
        state.rampObstacleClassifications,
        keep,
      ),
      perceptionEvaluationSamples: newest(
        state.perceptionEvaluationSamples,
        keep,
      ),
      precisionDockingObservations: newest(
        state.precisionDockingObservations,
        keep,
      ),
    },
    archived,
  };
}
