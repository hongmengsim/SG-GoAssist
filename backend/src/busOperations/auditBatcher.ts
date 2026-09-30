import type { OperationsAuditEvent } from "../services/auditLog";

/**
 * Groups audit events so the store can write them in one transaction. Measured on this laptop,
 * writing each event on its own (a database insert with a full flush, plus a file append, all on
 * the event loop) limits ingest to a few hundred changes per second; a burst of first reports
 * from a whole fleet is all changes. The trade-off is stated, not hidden: a crash can lose the
 * events of the last few tens of milliseconds, so the batcher is flushed before the audit log is
 * read, on shutdown, and whenever a batch fills. If the store fails the events are kept and
 * retried, up to a bound, and anything dropped beyond it is counted.
 */
export interface BatcherOptions {
  maxSize?: number;
  maxHeld?: number;
  delayMs?: number;
  schedule?: (fn: () => void, ms: number) => () => void;
  onError?: (error: unknown) => void;
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const timer = setTimeout(fn, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
};

export class AuditBatcher {
  private held_: OperationsAuditEvent[] = [];
  private cancel: (() => void) | undefined;
  private droppedCount = 0;
  private readonly maxSize: number;
  private readonly maxHeld: number;
  private readonly delayMs: number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly write: (events: OperationsAuditEvent[]) => void,
    options: BatcherOptions = {},
  ) {
    this.maxSize = options.maxSize ?? 200;
    this.maxHeld = options.maxHeld ?? 5000;
    this.delayMs = options.delayMs ?? 25;
    this.schedule = options.schedule ?? defaultSchedule;
    this.onError =
      options.onError ??
      ((error) => console.error("Audit write failed", error));
  }

  held(): number {
    return this.held_.length;
  }

  dropped(): number {
    return this.droppedCount;
  }

  add(event: OperationsAuditEvent): void {
    this.held_.push(event);
    if (this.held_.length > this.maxHeld) {
      const excess = this.held_.length - this.maxHeld;
      this.held_.splice(0, excess);
      this.droppedCount += excess;
    }
    if (this.held_.length >= this.maxSize) {
      this.flush();
      return;
    }
    this.cancel ??= this.schedule(() => {
      this.cancel = undefined;
      this.flush();
    }, this.delayMs);
  }

  flush(): void {
    this.cancel?.();
    this.cancel = undefined;
    if (this.held_.length === 0) return;
    const batch = this.held_;
    this.held_ = [];
    try {
      this.write(batch);
    } catch (error) {
      this.held_ = [...batch, ...this.held_];
      this.onError(error);
    }
  }
}
