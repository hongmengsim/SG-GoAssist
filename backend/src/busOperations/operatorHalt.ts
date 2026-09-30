import type {
  OperatorHalt,
  OperatorStatusUpdateMessage,
} from "@buspass/shared";
import type { AuditEventInput } from "./busOperationsService";
import { getLock } from "../concurrency/locks";
import type { BusRecord, BusRecordRepository } from "./ports";
import { asObject, fail, optionalText } from "./validation";

export type StoredHalt = OperatorHalt & BusRecord;

const MAX_REASON = 200;
export const DEFAULT_HALT_LIMIT = 100;
export const MAX_HALT_LIMIT = 500;

export interface OperatorHaltDeps {
  repository: BusRecordRepository<StoredHalt>;
  publish: (message: OperatorStatusUpdateMessage) => void;
  audit: (event: AuditEventInput) => void;
  now: () => number;
}

const toHalt = (stored: StoredHalt): OperatorHalt => ({
  busId: stored.busId,
  halted: stored.halted,
  ...(stored.reason !== undefined ? { reason: stored.reason } : {}),
  setAt: stored.setAt,
});

/**
 * An operator's halt on one bus. It is a request to the bus: the bus's gate adds OPERATOR_HALT to
 * its reasons, so it can only ever make the bus safer. One row per bus, changes only are
 * audited and pushed.
 */
export class OperatorHaltService {
  constructor(private readonly deps: OperatorHaltDeps) {}

  async set(input: unknown, busId: string): Promise<OperatorHalt> {
    const body = asObject(input, "Operator halt");
    if (typeof body.halted !== "boolean") fail("halted must be true or false");
    const reason = optionalText(body.reason, "reason", MAX_REASON);
    return getLock().run(`halt:${busId}`, async () => {
      const existing = await this.deps.repository.get(busId);
      if (
        existing &&
        existing.halted === body.halted &&
        existing.reason === reason
      ) {
        return toHalt(existing);
      }
      const setAt = new Date(this.deps.now()).toISOString();
      const stored: StoredHalt = {
        busId,
        halted: body.halted as boolean,
        ...(reason !== undefined ? { reason } : {}),
        setAt,
        observedAt: setAt,
      };
      await this.deps.repository.upsert(stored);
      this.deps.audit({
        eventType: "OPERATOR_HALT_SET",
        actor: "OPERATOR",
        busId,
        detail: { halted: stored.halted, reason: reason ?? null },
      });
      this.deps.publish({
        type: "OPERATOR_HALT",
        halt: toHalt(stored),
        timestamp: setAt,
      });
      return toHalt(stored);
    });
  }

  /** A bus with no record is not halted. */
  async get(busId: string): Promise<OperatorHalt> {
    const stored = await this.deps.repository.get(busId);
    return stored
      ? toHalt(stored)
      : { busId, halted: false, setAt: new Date(0).toISOString() };
  }

  async list(limit?: number): Promise<OperatorHalt[]> {
    const bounded =
      limit === undefined || !Number.isFinite(limit)
        ? DEFAULT_HALT_LIMIT
        : Math.min(Math.max(Math.trunc(limit), 1), MAX_HALT_LIMIT);
    return (await this.deps.repository.list(bounded)).map(toHalt);
  }

  clearAll(): Promise<void> {
    return this.deps.repository.clear();
  }
}
