import type {
  ActuatorCommand,
  ActuatorStatus,
  AssistanceCase,
} from "@buspass/shared";
import type { OperationsData } from "./operationsData";

/**
 * How much the operations data keeps. Without a limit the tables grow for ever
 * (docs/architecture/scalability.md, SC6).
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
/** Cases are archived in batches so one pass never holds everything at once. */
const BATCH = 500;
/** More commands or statuses than this for one case are not expected; the read is bounded. */
const PER_CASE_LIMIT = 1000;

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  finishedCaseMaxAgeMs: 7 * DAY_MS,
  maxFinishedCases: 2000,
  maxSeriesRecords: 5000,
};

export interface ArchivedCase {
  case: AssistanceCase;
  commands: ActuatorCommand[];
  statuses: ActuatorStatus[];
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

/** Archives, then deletes, the given cases with their commands and statuses. */
function archiveAndDelete(data: OperationsData, cases: AssistanceCase[]): void {
  if (cases.length === 0) return;
  const entries: ArchivedCase[] = cases.map((item) => ({
    case: item,
    commands: data.commands.find("caseId", item.caseId, PER_CASE_LIMIT),
    statuses: data.statuses.find("caseId", item.caseId, PER_CASE_LIMIT),
  }));
  // Written first, so nothing is lost if a delete fails half way.
  data.archive(entries);
  for (const entry of entries) {
    for (const command of entry.commands)
      data.commands.delete(command.commandId);
    for (const status of entry.statuses) data.statuses.delete(status.commandId);
    data.cases.delete(entry.case.caseId);
  }
}

/**
 * Trims the data to the policy and returns how many cases were archived. Each step reads
 * and deletes in bounded batches, using indexes, so the cost follows what is removed and not
 * everything stored. Cases that still need someone are never touched.
 */
export function enforceRetention(
  data: OperationsData,
  policy: RetentionPolicy,
  nowMs: number,
): number {
  let archived = 0;
  const cutoff = new Date(nowMs - policy.finishedCaseMaxAgeMs).toISOString();
  for (;;) {
    const batch = data.cases.listFinishedBefore(cutoff, BATCH);
    if (batch.length === 0) break;
    archiveAndDelete(data, batch);
    archived += batch.length;
  }
  for (;;) {
    const excess = data.cases.countFinished() - policy.maxFinishedCases;
    if (excess <= 0) break;
    const batch = data.cases.listFinishedOldest(Math.min(excess, BATCH));
    archiveAndDelete(data, batch);
    archived += batch.length;
  }
  const keep = policy.maxSeriesRecords;
  data.observations.trimOldest(keep);
  data.perceptionSamples.trimOldest(keep);
  data.commands.trimOldest(keep);
  data.statuses.trimOldest(keep);
  return archived;
}
