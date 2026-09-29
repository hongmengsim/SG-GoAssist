import { logger } from "../services/logger";

export interface SqliteStatement {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

/**
 * Opens a SQLite database with the runtime's built-in driver, or returns undefined when
 * the runtime has none (Node 20). Loaded lazily so older runtimes can still start; callers
 * fall back to an in-memory repository and say so.
 *
 * Latest-state tables can afford a relaxed flush (WAL, synchronous NORMAL): losing the last
 * few milliseconds of a status the bus re-sends every few seconds is harmless.
 */
export function openSqliteDatabase(
  filename: string,
): SqliteDatabase | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (filename: string) => SqliteDatabase;
    };
    const database = new DatabaseSync(filename);
    if (filename !== ":memory:") {
      database.exec(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;",
      );
    }
    return database;
  } catch (error) {
    logger.warn("SQLite is not available on this runtime", undefined, {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
