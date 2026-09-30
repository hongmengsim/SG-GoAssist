import type { SqliteDatabase, SqliteStatement } from "../storage/sqlite";
import type { LeaseStore } from "./keyedLock";

interface Lease {
  owner: string;
  expiresAt: number;
}

/** In-memory leases, with a clock that tests can move. Not shared between processes. */
export class MemoryLeaseStore implements LeaseStore {
  private readonly leases = new Map<string, Lease>();

  constructor(private readonly now: () => number = Date.now) {}

  async tryAcquire(
    key: string,
    owner: string,
    ttlMs: number,
  ): Promise<boolean> {
    const current = this.leases.get(key);
    if (current && current.expiresAt > this.now()) return false;
    this.leases.set(key, { owner, expiresAt: this.now() + ttlMs });
    return true;
  }

  async renew(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const current = this.leases.get(key);
    if (!current || current.owner !== owner) return false;
    current.expiresAt = this.now() + ttlMs;
    return true;
  }

  async release(key: string, owner: string): Promise<void> {
    if (this.leases.get(key)?.owner === owner) this.leases.delete(key);
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS locks (
    lock_key TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;

/**
 * Leases in a SQLite table. Every process that opens the same database file shares them, so
 * two processes on one machine exclude each other. Each operation is one statement, which
 * SQLite runs atomically, so there is no read-then-write gap to race in.
 */
export class SqliteLeaseStore implements LeaseStore {
  private readonly acquire: SqliteStatement;
  private readonly extend: SqliteStatement;
  private readonly free: SqliteStatement;

  constructor(
    database: SqliteDatabase,
    private readonly now: () => number = Date.now,
  ) {
    database.exec(SCHEMA);
    // Takes the row when it does not exist, or when the current lease has expired. A held,
    // unexpired lease makes the WHERE false, so nothing changes and `changes` is 0.
    this.acquire = database.prepare(
      `INSERT INTO locks (lock_key, owner, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(lock_key) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
       WHERE locks.expires_at <= ?`,
    );
    this.extend = database.prepare(
      "UPDATE locks SET expires_at = ? WHERE lock_key = ? AND owner = ?",
    );
    this.free = database.prepare(
      "DELETE FROM locks WHERE lock_key = ? AND owner = ?",
    );
  }

  async tryAcquire(
    key: string,
    owner: string,
    ttlMs: number,
  ): Promise<boolean> {
    const now = this.now();
    const result = this.acquire.run(key, owner, now + ttlMs, now) as {
      changes: number | bigint;
    };
    return Number(result.changes) === 1;
  }

  async renew(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const result = this.extend.run(this.now() + ttlMs, key, owner) as {
      changes: number | bigint;
    };
    return Number(result.changes) === 1;
  }

  async release(key: string, owner: string): Promise<void> {
    this.free.run(key, owner);
  }
}
