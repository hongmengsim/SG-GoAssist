import crypto from "crypto";
import { after } from "node:test";
import {
  openPostgres,
  type PgClient,
  type PgPool,
  type PgResult,
} from "../../storage/postgres";

/**
 * Postgres tests run only when this is set, for example
 *   GOASSIST_TEST_DATABASE_URL=postgres://goassist:PASSWORD@localhost:5432/goassist
 * Each test gets its own throwaway schema, dropped afterwards, so tests never see each
 * other's tables and nothing is left behind.
 */
export const testDatabaseUrl = process.env.GOASSIST_TEST_DATABASE_URL;

export const postgresSkip = testDatabaseUrl
  ? undefined
  : "GOASSIST_TEST_DATABASE_URL is not set";

const open: Array<{ schema: string; admin: PgPool; inner: PgPool }> = [];

/**
 * A pool whose tables live in a new schema. The schema is created before the first query,
 * so it can be handed to code that builds its tables synchronously. Call
 * `registerPostgresCleanup()` once in each test file to drop the schemas at the end.
 */
export function makeTestPool(): PgPool {
  if (!testDatabaseUrl)
    throw new Error("GOASSIST_TEST_DATABASE_URL is not set");
  const schema = `t_${crypto.randomBytes(6).toString("hex")}`;
  const admin = openPostgres(testDatabaseUrl, { maxConnections: 2 });
  const inner = openPostgres(testDatabaseUrl, { schema, maxConnections: 8 });
  open.push({ schema, admin, inner });
  const created = admin.query(`CREATE SCHEMA ${schema}`).then(() => undefined);
  return {
    query: async (text: string, values?: unknown[]): Promise<PgResult> => {
      await created;
      return inner.query(text, values);
    },
    connect: async (): Promise<PgClient> => {
      await created;
      return inner.connect();
    },
    end: async () => undefined,
  };
}

export function registerPostgresCleanup(): void {
  after(async () => {
    for (const { schema, admin, inner } of open.splice(0)) {
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined);
      await inner.end().catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });
}
