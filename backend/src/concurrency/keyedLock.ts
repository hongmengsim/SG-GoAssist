import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";
import { logger } from "../services/logger";

/**
 * Runs work for one key at a time. It replaces the read-modify-write safety that the old
 * single-threaded, synchronous code had for free, and it works across processes when a
 * lease store is used.
 *
 * Contract every implementation meets:
 * - work for the same key never overlaps, and starts in arrival order;
 * - work for different keys is independent;
 * - the lock is re-entrant: work that is already running under a key may call `run` for the
 *   same key again without waiting for itself (a function that holds the lock can call
 *   another function that takes it);
 * - an error in the work releases the lock and reaches the caller.
 */
export interface KeyedLock {
  run<T>(key: string, work: () => Promise<T>): Promise<T>;
}

export class LockTimeoutError extends Error {
  constructor(key: string, waitedMs: number) {
    super(`Could not take the lock "${key}" within ${waitedMs} ms`);
    this.name = "LockTimeoutError";
  }
}

/** The keys held by the work that is running now, carried along its async calls. */
const heldKeys = new AsyncLocalStorage<ReadonlySet<string>>();

/** One process. Same-key work queues in arrival order; different keys run side by side. */
export class InProcessKeyedLock implements KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const held = heldKeys.getStore();
    if (held?.has(key)) return work();
    const inside = () => heldKeys.run(new Set([...(held ?? []), key]), work);
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(inside, inside);
    const tail = run.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return run;
  }
}

/**
 * Where a lease lives. A lease is a lock with an expiry, so a process that dies while
 * holding one does not block everyone else for ever. Implemented over SQLite here; a
 * Postgres or Redis store implements the same three operations.
 */
export interface LeaseStore {
  /** True if the caller now holds the lease (it was free or had expired). */
  tryAcquire(key: string, owner: string, ttlMs: number): Promise<boolean>;
  /** True if the caller still holds the lease and its expiry was extended. */
  renew(key: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Frees the lease if the caller holds it; does nothing for anyone else's. */
  release(key: string, owner: string): Promise<void>;
}

export interface DistributedLockOptions {
  /** How long a lease lasts without renewal. */
  ttlMs?: number;
  /** How long to wait for the lease before giving up. */
  acquireTimeoutMs?: number;
  /** First wait between attempts; it doubles up to `maxRetryMs`, with jitter. */
  retryMs?: number;
  maxRetryMs?: number;
}

const DEFAULTS = {
  ttlMs: 15_000,
  acquireTimeoutMs: 10_000,
  retryMs: 5,
  maxRetryMs: 100,
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A lock shared by several processes. Work is first queued inside this process (so waiters
 * do not all hammer the store), then the lease is taken, renewed while the work runs, and
 * released afterwards.
 *
 * The lease guards against a crashed holder, not against work that runs longer than its
 * renewals can be made: if a renewal is refused (the lease was lost), the work carries on
 * and a warning is logged. Keep locked work short.
 */
export class DistributedKeyedLock implements KeyedLock {
  private readonly local = new InProcessKeyedLock();
  private readonly options: Required<DistributedLockOptions>;

  constructor(
    private readonly leases: LeaseStore,
    options: DistributedLockOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    // Work that already holds this key must not take the lease again (it would wait for itself).
    if (heldKeys.getStore()?.has(key)) return work();
    return this.local.run(key, () => this.withLease(key, work));
  }

  private async withLease<T>(key: string, work: () => Promise<T>): Promise<T> {
    const owner = crypto.randomUUID();
    await this.acquire(key, owner);
    const renew = setInterval(
      () => {
        this.leases
          .renew(key, owner, this.options.ttlMs)
          .then((kept) => {
            if (!kept)
              logger.warn(
                "A lock lease was lost while its work was running",
                undefined,
                {
                  key,
                },
              );
          })
          .catch((error: unknown) =>
            logger.error("A lock lease could not be renewed", undefined, {
              key,
              error: String(error),
            }),
          );
      },
      Math.max(1, Math.floor(this.options.ttlMs / 3)),
    );
    renew.unref();
    try {
      return await work();
    } finally {
      clearInterval(renew);
      await this.leases.release(key, owner).catch((error: unknown) =>
        logger.error("A lock lease could not be released", undefined, {
          key,
          error: String(error),
        }),
      );
    }
  }

  private async acquire(key: string, owner: string): Promise<void> {
    const started = Date.now();
    let wait = this.options.retryMs;
    for (;;) {
      if (await this.leases.tryAcquire(key, owner, this.options.ttlMs)) return;
      const waited = Date.now() - started;
      if (waited >= this.options.acquireTimeoutMs)
        throw new LockTimeoutError(key, waited);
      await sleep(wait + Math.floor(Math.random() * wait));
      wait = Math.min(wait * 2, this.options.maxRetryMs);
    }
  }
}
