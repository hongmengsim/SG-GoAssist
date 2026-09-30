import {
  BUS_MOVEMENT_STATES,
  type BusMovementState,
  type BayStatus,
  type BusStatus,
  type OperatorStatusUpdateMessage,
} from "@buspass/shared";
import { getLock } from "../concurrency/locks";
import { applyBusReport, emptyBay, grantNext } from "./bayCoordinator";
import type { BayRepository, BusStatusRepository } from "./ports";

export class BusOperationsValidationError extends Error {}

/** The request is well formed but the current state does not allow it (HTTP 409). */
export class BusOperationsConflictError extends Error {}

export interface AuditEventInput {
  eventType: string;
  actor: string;
  busId?: string;
  caseId?: string;
  detail?: Record<string, unknown>;
}

export interface BusOperationsDeps {
  busStatus: BusStatusRepository;
  bays: BayRepository;
  publish: (message: OperatorStatusUpdateMessage) => void;
  audit: (event: AuditEventInput) => void;
  now: () => number;
  /** Called after a bus's movement or stop changes, once its bay has accepted it. */
  onMovement?: (status: BusStatus) => void | Promise<void>;
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
  constructor(private readonly deps: BusOperationsDeps) {}

  async reportBusStatus(input: unknown, busId: string): Promise<ReportResult> {
    const status = parseBusStatus(input, busId, this.deps.now());
    const quick = await this.withoutLock(status, busId);
    if (quick) return quick;
    return this.exclusive(busId, async () => {
      const existing = await this.deps.busStatus.get(busId);
      if (
        existing &&
        Date.parse(status.observedAt) < Date.parse(existing.observedAt)
      ) {
        return { outcome: "STALE", status: existing };
      }
      await this.applyBay(existing, status);
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
      await this.deps.onMovement?.(status);
      return { outcome: "CHANGED", status };
    });
  }

  /**
   * Answers the two cheap cases with no lock: a report older than the stored one, and a
   * repeat with the same facts (most reports are these heartbeats), which only refreshes the
   * time. The refresh is one compare-and-swap, so if anything changed the status since it was
   * read the swap fails and the report takes the locked path. A repeat does not touch the
   * bay: the bay only changes when the bus's facts do.
   */
  private async withoutLock(
    status: BusStatus,
    busId: string,
  ): Promise<ReportResult | undefined> {
    const existing = await this.deps.busStatus.get(busId);
    if (!existing) return undefined;
    if (Date.parse(status.observedAt) < Date.parse(existing.observedAt))
      return { outcome: "STALE", status: existing };
    if (!sameFacts(existing, status)) return undefined;
    const swapped = await this.deps.busStatus.compareAndUpsert(
      existing,
      status,
    );
    return swapped ? { outcome: "HEARTBEAT", status } : undefined;
  }

  /** Current bay for a stop; a stop nobody has reported at has an empty bay. */
  async getBay(stopCode: string): Promise<BayStatus> {
    return (
      (await this.deps.bays.get(stopCode)) ??
      emptyBay(stopCode, new Date(this.deps.now()).toISOString())
    );
  }

  /** The controller sends the first waiting bus into the free bay. */
  grantBayEntry(stopCode: string): Promise<BayStatus> {
    const stop = optionalCode(stopCode, "stopCode");
    if (stop === undefined) fail("stopCode is required");
    return this.exclusive(`stop:${stop}`, async () => {
      const nowIso = new Date(this.deps.now()).toISOString();
      const bay = (await this.deps.bays.get(stop)) ?? emptyBay(stop, nowIso);
      const decision = grantNext(bay, nowIso);
      if (!decision.granted) {
        throw new BusOperationsConflictError(decision.reason);
      }
      await this.deps.bays.upsert(decision.bay);
      this.deps.audit({
        eventType: "BAY_ENTRY_GRANTED",
        actor: "OPERATOR",
        busId: decision.bay.grantedBusId ?? undefined,
        detail: { stopCode: stop, bayId: decision.bay.bayId },
      });
      this.publishBay(decision.bay);
      return decision.bay;
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

  async clearAll(): Promise<void> {
    await this.deps.busStatus.clear();
    await this.deps.bays.clear();
  }

  /**
   * Applies a bus's report to the bay of its stop (and removes it from the bay of the stop
   * it left). Throws a conflict before anything about the bus is stored when the bay rules
   * refuse the movement.
   */
  private async applyBay(
    existing: BusStatus | undefined,
    status: BusStatus,
  ): Promise<void> {
    const previousStop = existing?.stopCode;
    if (previousStop && previousStop !== status.stopCode) {
      await this.exclusive(`stop:${previousStop}`, () =>
        this.updateBay(previousStop, {
          ...status,
          stopCode: previousStop,
          movement: "TRAVELLING_TO_STOP",
        }),
      );
    }
    const stop = status.stopCode;
    if (stop) {
      await this.exclusive(`stop:${stop}`, () => this.updateBay(stop, status));
    }
  }

  private async updateBay(stopCode: string, status: BusStatus): Promise<void> {
    const nowIso = new Date(this.deps.now()).toISOString();
    const bay =
      (await this.deps.bays.get(stopCode)) ?? emptyBay(stopCode, nowIso);
    const decision = applyBusReport(bay, status, nowIso);
    if (!decision.accepted) {
      throw new BusOperationsConflictError(decision.reason);
    }
    if (!decision.changed) return;
    await this.deps.bays.upsert(decision.bay);
    this.deps.audit({
      eventType: "BAY_CHANGED",
      actor: "VEHICLE",
      busId: status.busId,
      detail: {
        stopCode,
        occupantBusId: decision.bay.occupantBusId,
        waitingBusIds: decision.bay.waitingBusIds,
        grantedBusId: decision.bay.grantedBusId,
      },
    });
    this.publishBay(decision.bay);
  }

  private publishBay(bay: BayStatus): void {
    this.deps.publish({
      type: "BAY_STATUS",
      bay,
      timestamp: new Date(this.deps.now()).toISOString(),
    });
  }

  /**
   * Runs work under the shared lock: bus work under `bus:<id>`, bay work under `stop:<code>`.
   * Bus work always takes the bus key first and then a stop key, so two processes cannot
   * each hold one and wait for the other.
   */
  private exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    return getLock().run(key.startsWith("stop:") ? key : `bus:${key}`, work);
  }
}
