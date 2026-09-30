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
async function archiveAndDelete(
  data: OperationsData,
  cases: AssistanceCase[],
): Promise<void> {
  if (cases.length === 0) return;
  const entries: ArchivedCase[] = [];
  for (const item of cases) {
    entries.push({
      case: item,
      commands: await data.commands.find("caseId", item.caseId, PER_CASE_LIMIT),
      statuses: await data.statuses.find("caseId", item.caseId, PER_CASE_LIMIT),
    });
  }
  // Written first, so nothing is lost if a delete fails half way.
  data.archive(entries);
  for (const entry of entries) {
    for (const command of entry.commands)
      await data.commands.delete(command.commandId);
    for (const status of entry.statuses)
      await data.statuses.delete(status.commandId);
    await data.cases.delete(entry.case.caseId);
  }
}

/**
 * Trims the data to the policy and returns how many cases were archived. Each step reads
 * and deletes in bounded batches, using indexes, so the cost follows what is removed and not
 * everything stored. Cases that still need someone are never touched.
 */
export async function enforceRetention(
  data: OperationsData,
  policy: RetentionPolicy,
  nowMs: number,
): Promise<number> {
  let archived = 0;
  const cutoff = new Date(nowMs - policy.finishedCaseMaxAgeMs).toISOString();
  for (;;) {
    const batch = await data.cases.listFinishedBefore(cutoff, BATCH);
    if (batch.length === 0) break;
    await archiveAndDelete(data, batch);
    archived += batch.length;
  }
  for (;;) {
    const excess = (await data.cases.countFinished()) - policy.maxFinishedCases;
    if (excess <= 0) break;
    const batch = await data.cases.listFinishedOldest(Math.min(excess, BATCH));
    await archiveAndDelete(data, batch);
    archived += batch.length;
  }
  const keep = policy.maxSeriesRecords;
  await data.observations.trimOldest(keep);
  await data.perceptionSamples.trimOldest(keep);
  await data.commands.trimOldest(keep);
  await data.statuses.trimOldest(keep);
  return archived;
}
