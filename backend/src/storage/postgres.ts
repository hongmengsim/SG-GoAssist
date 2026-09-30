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
  query(text: string, values?: unknown[]): Promise<PgResult>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

export interface OpenPostgresOptions {
  /** Puts the connection in this schema (tests use a throwaway one). */
  schema?: string;
  /** Most connections held open; the default suits one backend process. */
  maxConnections?: number;
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export function openPostgres(
  url: string,
  options: OpenPostgresOptions = {},
): PgPool {
  let Pool: new (config: Record<string, unknown>) => PgPool;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ Pool } = require("pg") as { Pool: typeof Pool });
  } catch {
    throw new Error(
      "GOASSIST_DATABASE_URL needs the pg package: npm install pg --workspace @buspass/backend",
    );
  }
  if (options.schema !== undefined && !SCHEMA_NAME.test(options.schema))
    throw new Error("Invalid schema name");
  return new Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    ...(options.schema ? { options: `-c search_path=${options.schema}` } : {}),
  });
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
export function createSchemaObjects(
  pool: PgPool,
  statements: string[],
): Promise<void> {
  return inTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(727001)");
    for (const statement of statements) await client.query(statement);
  });
}

/** Postgres returns bigint and count values as strings. */
export const toNumber = (value: unknown): number => Number(value);
