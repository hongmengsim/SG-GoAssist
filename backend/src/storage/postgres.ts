import { logger } from "../services/logger";

/**
 * The part of node-postgres this backend uses. `pg` is not a dependency: it is loaded only
 * when Postgres is chosen (`GOASSIST_DATABASE_URL`), and tests can give these adapters any
 * object of this shape.
 *
 *   npm install pg --workspace @buspass/backend
 */
export interface PgResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
}

export interface PgClient {
  query(text: string, values?: unknown[]): Promise<PgResult>;
  release(): void;
}

export interface PgPool {
  /** Idle connections fail with an error event (a database restart); it must be handled. */
  on?(event: "error", listener: (error: Error) => void): unknown;
  query(text: string, values?: unknown[]): Promise<PgResult>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

export interface OpenPostgresOptions {
  /** Puts the connection in this schema (tests use a throwaway one). */
  schema?: string;
  /** Most connections held open; the default suits one backend process. */
  maxConnections?: number;
  /** Test seam: the class to build the pool from (default: the pg package's Pool). */
  poolClass?: new (config: Record<string, unknown>) => PgPool;
  /** Where a pool error is reported (default: the backend log). */
  onError?: (error: Error) => void;
}

/** How long to wait for a connection, and how long a statement may run, in milliseconds. */
export const CONNECT_TIMEOUT_MS = 5_000;
export const STATEMENT_TIMEOUT_MS = 30_000;
export const IDLE_TIMEOUT_MS = 30_000;

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export function openPostgres(
  url: string,
  options: OpenPostgresOptions = {},
): PgPool {
  let Pool = options.poolClass;
  if (!Pool) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ({ Pool } = require("pg") as { Pool: NonNullable<typeof Pool> });
    } catch {
      throw new Error(
        "GOASSIST_DATABASE_URL needs the pg package: npm install pg --workspace @buspass/backend",
      );
    }
  }
  if (options.schema !== undefined && !SCHEMA_NAME.test(options.schema))
    throw new Error("Invalid schema name");
  const pool = new Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // A statement that runs too long is stopped by the server.
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
  });
  // An idle connection that dies (the database restarted or failed over) is reported here. With
  // no listener Node treats it as an uncaught exception and the process exits.
  pool.on?.(
    "error",
    options.onError ??
      ((error: Error) =>
        logger.error("Postgres connection error", undefined, {
          error: error.message,
        })),
  );
  return pool;
}

interface SharedEntry {
  pool: PgPool;
  users: number;
}
const sharedPools = new Map<string, SharedEntry>();

/**
 * One pool per database for the whole process. The bus operations and the case data each used to
 * open their own, doubling the connections one backend holds. Each caller gets a handle whose
 * `end()` gives its share back; the pool itself closes with the last one.
 */
export function acquirePostgres(
  url: string,
  options: OpenPostgresOptions = {},
): PgPool {
  const key = `${url}|${options.schema ?? ""}`;
  let entry = sharedPools.get(key);
  if (!entry) {
    entry = { pool: openPostgres(url, options), users: 0 };
    sharedPools.set(key, entry);
  }
  entry.users += 1;
  const shared = entry;
  let released = false;
  const handle: PgPool = {
    on: (event, listener) => shared.pool.on?.(event, listener),
    query: (text, values) => shared.pool.query(text, values),
    connect: () => shared.pool.connect(),
    end: async () => {
      if (released) return;
      released = true;
      shared.users -= 1;
      if (shared.users > 0) return;
      if (sharedPools.get(key) === shared) sharedPools.delete(key);
      await shared.pool.end();
    },
  };
  return handle;
}

/** Runs work in one transaction on one connection; rolls back if it throws. */
export async function inTransaction<T>(
  pool: PgPool,
  work: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Creates tables safely when several processes start at once: creating the same table
 * concurrently can fail inside Postgres, so the statements run in one transaction behind an
 * advisory lock that every process takes first.
 */
/** Named, so this lock cannot collide with another application's advisory lock in the same database. */
export const DDL_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtext('goassist_ddl'))";

export function createSchemaObjects(
  pool: PgPool,
  statements: string[],
): Promise<void> {
  return inTransaction(pool, async (client) => {
    await client.query(DDL_LOCK_SQL);
    for (const statement of statements) await client.query(statement);
  });
}

/** Postgres returns bigint and count values as strings. */
export const toNumber = (value: unknown): number => Number(value);
