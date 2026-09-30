import type { SqliteDatabase } from "../storage/sqlite";
import { logger } from "../services/logger";
import {
  DistributedKeyedLock,
  InProcessKeyedLock,
  type DistributedLockOptions,
  type KeyedLock,
} from "./keyedLock";
import { SqliteLeaseStore } from "./leaseStores";

/**
 * The process-wide lock the services use. It starts in-process; the server swaps in a shared
 * one at start-up when several processes run (`GOASSIST_LOCKS=database`).
 */
let current: KeyedLock = new InProcessKeyedLock();

export function getLock(): KeyedLock {
  return current;
}

export function configureLock(lock: KeyedLock): void {
  current = lock;
}

/** Runs `work` under `key` on the current lock (looked up when called, not when imported). */
export function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  return current.run(key, work);
}

export interface LockEnvironment {
  GOASSIST_LOCKS?: string;
  GOASSIST_LOCK_TTL_MS?: string;
  GOASSIST_LOCK_TIMEOUT_MS?: string;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : undefined;
}

/**
 * Chooses the lock from the environment: nothing or `memory` for one process, `database`
 * to share leases through the operations database so several processes exclude each other.
 * An unknown value, or `database` without a database, is refused rather than quietly
 * falling back to a lock that would not protect anything across processes.
 */
export function lockFromEnvironment(
  env: LockEnvironment,
  database: SqliteDatabase | undefined,
): KeyedLock {
  const kind = (env.GOASSIST_LOCKS ?? "memory").trim().toLowerCase();
  if (kind === "memory" || kind === "") return new InProcessKeyedLock();
  if (kind === "database") {
    if (!database)
      throw new Error(
        "GOASSIST_LOCKS=database needs a database, but SQLite is not available on this runtime",
      );
    const options: DistributedLockOptions = {
      ttlMs: positive(env.GOASSIST_LOCK_TTL_MS),
      acquireTimeoutMs: positive(env.GOASSIST_LOCK_TIMEOUT_MS),
    };
    for (const key of Object.keys(options) as Array<keyof typeof options>)
      if (options[key] === undefined) delete options[key];
    logger.info("Locks are shared through the database");
    return new DistributedKeyedLock(new SqliteLeaseStore(database), options);
  }
  throw new Error(`Unknown GOASSIST_LOCKS: ${kind} (use memory or database)`);
}
