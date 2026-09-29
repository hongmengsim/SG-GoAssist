import {
  BUS_MOVEMENT_STATES,
  type BusMovementState,
  type BusStatus,
  type OperatorStatusUpdateMessage,
} from "@buspass/shared";
import type { BusStatusRepository } from "./ports";

export class BusOperationsValidationError extends Error {}

export interface AuditEventInput {
  eventType: string;
  actor: string;
  busId?: string;
  caseId?: string;
  detail?: Record<string, unknown>;
}

export interface BusOperationsDeps {
  busStatus: BusStatusRepository;
  publish: (message: OperatorStatusUpdateMessage) => void;
  audit: (event: AuditEventInput) => void;
  now: () => number;
}

/**
 * CHANGED: a fact changed (movement, stop, bay, simulated flag) or this is the first report.
 * HEARTBEAT: same facts, newer time; the stored time is refreshed, nothing is published.
 * STALE: older than what is stored; ignored.
 */
export type ReportOutcome = "CHANGED" | "HEARTBEAT" | "STALE";

export interface ReportResult {
  outcome: ReportOutcome;
  status: BusStatus;
}

const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_BUS_SERVICE_LENGTH = 20;
const MAX_CODE_LENGTH = 40;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;

function fail(message: string): never {
  throw new BusOperationsValidationError(message);
}

function optionalCode(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > MAX_CODE_LENGTH
  ) {
    fail(
      `${field} must be a non-empty string of at most ${MAX_CODE_LENGTH} characters`,
    );
  }
  return value.trim();
}

/** Accepts only the fields of BusStatus; anything else is dropped. */
function parseBusStatus(
  input: unknown,
  busIdFromPath: string,
  now: number,
): BusStatus {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail("Bus status must be a JSON object");
  }
  const body = input as Record<string, unknown>;
  if (body.busId !== undefined && body.busId !== busIdFromPath) {
    fail("busId in the body must match the bus in the path");
  }
  if (
    typeof body.busService !== "string" ||
    body.busService.trim() === "" ||
    body.busService.length > MAX_BUS_SERVICE_LENGTH
  ) {
    fail(
      `busService must be a non-empty string of at most ${MAX_BUS_SERVICE_LENGTH} characters`,
    );
  }
  if (!(BUS_MOVEMENT_STATES as readonly unknown[]).includes(body.movement)) {
    fail(`movement must be one of ${BUS_MOVEMENT_STATES.join(", ")}`);
  }
  if (typeof body.simulated !== "boolean")
    fail("simulated must be true or false");
  if (
    typeof body.observedAt !== "string" ||
    !Number.isFinite(Date.parse(body.observedAt))
  ) {
    fail("observedAt must be an ISO date-time");
  }
  if (Date.parse(body.observedAt) > now + MAX_FUTURE_SKEW_MS) {
    fail("observedAt is too far in the future");
  }

  const status: BusStatus = {
    busId: busIdFromPath,
    busService: body.busService.trim(),
    movement: body.movement as BusMovementState,
    simulated: body.simulated,
    observedAt: body.observedAt,
  };
  const stopCode = optionalCode(body.stopCode, "stopCode");
  const bayId = optionalCode(body.bayId, "bayId");
  if (stopCode !== undefined) status.stopCode = stopCode;
  if (bayId !== undefined) status.bayId = bayId;
  return status;
}

function sameFacts(a: BusStatus, b: BusStatus): boolean {
  return (
    a.busService === b.busService &&
    a.movement === b.movement &&
    a.stopCode === b.stopCode &&
    a.bayId === b.bayId &&
    a.simulated === b.simulated
  );
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

export class BusOperationsService {
  /** Serialises work per bus so a read-then-write cannot interleave with another report. */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: BusOperationsDeps) {}

  async reportBusStatus(input: unknown, busId: string): Promise<ReportResult> {
    const status = parseBusStatus(input, busId, this.deps.now());
    return this.exclusive(busId, async () => {
      const existing = await this.deps.busStatus.get(busId);
      if (
        existing &&
        Date.parse(status.observedAt) < Date.parse(existing.observedAt)
      ) {
        return { outcome: "STALE", status: existing };
      }
      const changed = existing === undefined || !sameFacts(existing, status);
      await this.deps.busStatus.upsert(status);
      if (!changed) return { outcome: "HEARTBEAT", status };

      this.deps.audit({
        eventType: "BUS_STATUS_CHANGED",
        actor: "VEHICLE",
        busId,
        detail: {
          from: existing?.movement ?? null,
          to: status.movement,
          stopCode: status.stopCode ?? null,
          bayId: status.bayId ?? null,
          simulated: status.simulated,
        },
      });
      this.deps.publish({
        type: "BUS_STATUS",
        status,
        timestamp: new Date(this.deps.now()).toISOString(),
      });
      return { outcome: "CHANGED", status };
    });
  }

  getBusStatus(busId: string): Promise<BusStatus | undefined> {
    return this.deps.busStatus.get(busId);
  }

  listBusStatus(filter: {
    stopCode?: string;
    limit?: number;
  }): Promise<BusStatus[]> {
    return this.deps.busStatus.list({
      stopCode: filter.stopCode,
      limit: clampLimit(filter.limit),
    });
  }

  clearAll(): Promise<void> {
    return this.deps.busStatus.clear();
  }

  private exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(work, work);
    const tail = run.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return run;
  }
}
