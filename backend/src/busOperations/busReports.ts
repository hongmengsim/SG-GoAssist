import {
  HALT_REASONS,
  HELP_REASONS,
  RAMP_PERMISSIONS,
  SIMULATED_RAMP_STATES,
  TOF_BEAM_STATES,
  ZONE_STATES,
  type HaltReason,
  type HelpRequired,
  type OperatorStatusUpdateMessage,
  type RampSafetyDecision,
  type RampSimulationStatus,
} from "@buspass/shared";
import type { AuditEventInput } from "./busOperationsService";
import { getLock } from "../concurrency/locks";
import type { BusRecordRepository } from "./ports";
import {
  asObject,
  fail,
  matchBusId,
  observedAt,
  oneOf,
  optionalText,
  requireBoolean,
} from "./validation";

export const REPORT_KINDS = [
  "RAMP_SIMULATION",
  "RAMP_SAFETY",
  "HELP_REQUIRED",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportOutcome = "CHANGED" | "HEARTBEAT" | "STALE";

export type AnyReport =
  RampSimulationStatus | RampSafetyDecision | HelpRequired;

/** How many times a report retries after losing a compare-and-swap to a newer refresh. */
const MAX_WRITE_ATTEMPTS = 5;
const MAX_OBJECTS_IN_ZONE = 50;
const MAX_TEXT = 200;
const MAX_CODE = 60;
export const DEFAULT_REPORT_LIMIT = 100;
export const MAX_REPORT_LIMIT = 500;

function haltReasons(value: unknown, field: string): HaltReason[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > HALT_REASONS.length) {
    fail(`${field} must be a list of halt reasons`);
  }
  return value.map((reason) => oneOf(reason, HALT_REASONS, field));
}

function parseRamp(
  input: unknown,
  busId: string,
  now: number,
): RampSimulationStatus {
  const body = asObject(input, "Ramp status");
  matchBusId(body, busId);
  if (body.simulated !== true) {
    fail("simulated must be true: the ramp is never reported as physical");
  }
  const reasons = haltReasons(body.haltReasons, "haltReasons");
  const caseId = optionalText(body.caseId, "caseId", MAX_CODE);
  return {
    busId,
    ...(caseId !== undefined ? { caseId } : {}),
    state: oneOf(body.state, SIMULATED_RAMP_STATES, "state"),
    simulated: true,
    ...(reasons.length > 0 ? { haltReasons: reasons } : {}),
    observedAt: observedAt(body.observedAt, now),
  };
}

function parseObject(
  entry: unknown,
): RampSafetyDecision["objectsInZone"][number] {
  const object = asObject(entry, "object in zone");
  const className = optionalText(object.className, "className", MAX_CODE);
  const confidence = object.confidence;
  if (
    className === undefined ||
    typeof confidence !== "number" ||
    !(confidence >= 0 && confidence <= 1)
  ) {
    fail("each object needs a className and a confidence from 0 to 1");
  }
  return {
    className,
    safety: oneOf(object.safety, ["SAFE", "UNSAFE"] as const, "safety"),
    confidence,
  };
}

function parseDecision(
  input: unknown,
  busId: string,
  now: number,
): RampSafetyDecision {
  const body = asObject(input, "Safety decision");
  matchBusId(body, busId);
  const zoneState = oneOf(body.zoneState, ZONE_STATES, "zoneState");
  const permission = oneOf(body.permission, RAMP_PERMISSIONS, "permission");
  const reasons = haltReasons(body.reasons, "reasons");
  if (
    permission === "CONTINUE" &&
    (zoneState !== "CLEAR" || reasons.length > 0)
  ) {
    fail("CONTINUE requires a CLEAR zone and no halt reasons");
  }
  if (permission === "HALT" && reasons.length === 0) {
    fail("HALT requires at least one reason");
  }

  const tof = asObject(body.tof, "tof");
  const distance = tof.distanceMm;
  if (
    distance !== undefined &&
    (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0)
  ) {
    fail("tof.distanceMm must be a non-negative number");
  }
  const camera = asObject(body.camera, "camera");
  const degradedReason = optionalText(
    camera.degradedReason,
    "camera.degradedReason",
    MAX_CODE,
  );
  if (
    !Array.isArray(body.objectsInZone) ||
    body.objectsInZone.length > MAX_OBJECTS_IN_ZONE
  ) {
    fail(
      `objectsInZone must be a list of at most ${MAX_OBJECTS_IN_ZONE} objects`,
    );
  }

  return {
    busId,
    zoneState,
    permission,
    reasons,
    tof: {
      state: oneOf(tof.state, TOF_BEAM_STATES, "tof.state"),
      ...(distance !== undefined ? { distanceMm: distance as number } : {}),
      simulated: requireBoolean(tof.simulated, "tof.simulated"),
    },
    camera: {
      imageOk: requireBoolean(camera.imageOk, "camera.imageOk"),
      ...(degradedReason !== undefined ? { degradedReason } : {}),
    },
    objectsInZone: body.objectsInZone.map(parseObject),
    simulated: requireBoolean(body.simulated, "simulated"),
    observedAt: observedAt(body.observedAt, now),
  };
}

function parseHelp(input: unknown, busId: string, now: number): HelpRequired {
  const body = asObject(input, "Help request");
  matchBusId(body, busId);
  const caseId = optionalText(body.caseId, "caseId", MAX_CODE);
  const detail = optionalText(body.detail, "detail", MAX_TEXT);
  return {
    busId,
    ...(caseId !== undefined ? { caseId } : {}),
    reason: oneOf(body.reason, HELP_REASONS, "reason"),
    state: oneOf(body.state, SIMULATED_RAMP_STATES, "state"),
    ...(detail !== undefined ? { detail } : {}),
    observedAt: observedAt(body.observedAt, now),
  };
}

interface KindDescriptor {
  parse: (input: unknown, busId: string, now: number) => AnyReport;
  auditType: string;
  message: (
    record: AnyReport,
    timestamp: string,
  ) => OperatorStatusUpdateMessage;
}

const DESCRIPTORS: Record<ReportKind, KindDescriptor> = {
  RAMP_SIMULATION: {
    parse: parseRamp,
    auditType: "RAMP_SIMULATION_CHANGED",
    message: (record, timestamp) => ({
      type: "RAMP_SIMULATION",
      ramp: record as RampSimulationStatus,
      timestamp,
    }),
  },
  RAMP_SAFETY: {
    parse: parseDecision,
    auditType: "RAMP_SAFETY_CHANGED",
    message: (record, timestamp) => ({
      type: "RAMP_SAFETY",
      decision: record as RampSafetyDecision,
      timestamp,
    }),
  },
  HELP_REQUIRED: {
    parse: parseHelp,
    auditType: "HELP_REQUIRED_CHANGED",
    message: (record, timestamp) => ({
      type: "HELP_REQUIRED",
      help: record as HelpRequired,
      timestamp,
    }),
  },
};

/**
 * Readings that move on every sensor sample. The agent sends them only with its slow heartbeat, and
 * a change in what they mean already shows in the beam state, the safety class or the halt reasons,
 * so they must not make a repeat look like a change (that would audit and publish every heartbeat).
 */
const MEASUREMENTS = new Set(["observedAt", "distanceMm", "confidence"]);

function withoutMeasurements(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMeasurements);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !MEASUREMENTS.has(key))
        .map(([key, inner]) => [key, withoutMeasurements(inner)]),
    );
  }
  return value;
}

function withoutTime(record: AnyReport): string {
  return JSON.stringify(withoutMeasurements(record));
}

export interface BusReportsDeps {
  repositories: Record<ReportKind, BusRecordRepository<AnyReport>>;
  publish: (message: OperatorStatusUpdateMessage) => void;
  audit: (event: AuditEventInput) => void;
  now: () => number;
}

/**
 * Latest ramp state, safety decision and help request per bus. Like bus status: a change
 * is stored, audited and published; a repeat with a newer time only refreshes the stored
 * time; an older report is ignored. Written per record, so cost does not grow with the
 * number of buses.
 */
export class BusReportsService {
  constructor(private readonly deps: BusReportsDeps) {}

  async report(
    kind: ReportKind,
    input: unknown,
    busId: string,
  ): Promise<{ outcome: ReportOutcome; record: AnyReport }> {
    const descriptor = DESCRIPTORS[kind];
    const record = descriptor.parse(input, busId, this.deps.now());
    const repository = this.deps.repositories[kind];
    // The two cheap cases need no lock: an older report is ignored, and a repeat that only has
    // a newer time is one compare-and-swap (if the record changed meanwhile the swap fails and
    // the report takes the locked path below).
    const current = await repository.get(busId);
    if (current) {
      if (Date.parse(record.observedAt) < Date.parse(current.observedAt))
        return { outcome: "STALE" as const, record: current };
      if (
        withoutTime(current) === withoutTime(record) &&
        (await repository.compareAndUpsert(current, record))
      )
        return { outcome: "HEARTBEAT" as const, record };
    }
    return getLock().run(`report:${kind}:${busId}`, async () => {
      // Written with a compare-and-swap on what was read: a repeat report may refresh the time
      // without the lock in between, and must not be overwritten by an older change.
      let existing: AnyReport | undefined;
      for (let attempt = 0; ; attempt += 1) {
        existing = await repository.get(busId);
        if (
          existing &&
          Date.parse(record.observedAt) < Date.parse(existing.observedAt)
        ) {
          return { outcome: "STALE" as const, record: existing };
        }
        if (await repository.compareAndUpsert(existing, record)) break;
        if (attempt >= MAX_WRITE_ATTEMPTS)
          fail(
            "This report could not be stored because the record kept changing; send it again",
          );
      }
      const changed =
        !existing || withoutTime(existing) !== withoutTime(record);
      if (!changed) return { outcome: "HEARTBEAT" as const, record };
      this.deps.audit({
        eventType: descriptor.auditType,
        actor: "VEHICLE",
        busId,
        detail: { ...record } as Record<string, unknown>,
      });
      this.deps.publish(
        descriptor.message(record, new Date(this.deps.now()).toISOString()),
      );
      return { outcome: "CHANGED" as const, record };
    });
  }

  get(kind: ReportKind, busId: string): Promise<AnyReport | undefined> {
    return this.deps.repositories[kind].get(busId);
  }

  list(kind: ReportKind, limit?: number): Promise<AnyReport[]> {
    const bounded =
      limit === undefined || !Number.isFinite(limit)
        ? DEFAULT_REPORT_LIMIT
        : Math.min(Math.max(Math.trunc(limit), 1), MAX_REPORT_LIMIT);
    return this.deps.repositories[kind].list(bounded);
  }

  async clearAll(): Promise<void> {
    for (const kind of REPORT_KINDS) await this.deps.repositories[kind].clear();
  }
}
