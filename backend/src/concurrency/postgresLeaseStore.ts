import { createSchemaObjects, type PgPool } from "../storage/postgres";
import type { LeaseStore } from "./keyedLock";

/** The database's clock in milliseconds, so machines with different clocks agree on expiry. */
const DB_NOW_MS = "(extract(epoch from clock_timestamp()) * 1000)::bigint";

/**
 * Leases in a Postgres table, shared by every process that uses the database, on any
 * machine. Each operation is one statement, so there is no read-then-write gap. Expiry uses
 * the database's clock, not the process's.
 */
export class PostgresLeaseStore implements LeaseStore {
  private readonly ready: Promise<void>;

  constructor(private readonly pool: PgPool) {
    this.ready = createSchemaObjects(pool, [
      `CREATE TABLE IF NOT EXISTS locks (
        lock_key TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      )`,
    ]);
    this.ready.catch(() => undefined);
  }

  async tryAcquire(
    key: string,
    owner: string,
    ttlMs: number,
  ): Promise<boolean> {
    await this.ready;
    // Takes the row when it does not exist or its lease has expired; a held, unexpired lease
    // makes the WHERE false, so no row is changed.
    const result = await this.pool.query(
      `INSERT INTO locks (lock_key, owner, expires_at) VALUES ($1, $2, ${DB_NOW_MS} + $3)
       ON CONFLICT (lock_key) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
       WHERE locks.expires_at <= ${DB_NOW_MS}`,
      [key, owner, ttlMs],
    );
    return result.rowCount === 1;
  }

  async renew(key: string, owner: string, ttlMs: number): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE locks SET expires_at = ${DB_NOW_MS} + $1 WHERE lock_key = $2 AND owner = $3`,
      [ttlMs, key, owner],
    );
    return result.rowCount === 1;
  }

  async release(key: string, owner: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      "DELETE FROM locks WHERE lock_key = $1 AND owner = $2",
      [key, owner],
    );
  }
}
