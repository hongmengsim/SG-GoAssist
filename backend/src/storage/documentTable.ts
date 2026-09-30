import type { SqliteDatabase, SqliteStatement } from "./sqlite";

/**
 * A small keyed table of JSON documents: one row per document, written in place, with a few
 * indexed lookup columns. It is what replaces the old "everything in one document" store for
 * the records that are not cases (observations, telemetry, commands and so on).
 *
 * Contract every adapter meets:
 * - one row per key; a write touches only that row, so its cost does not depend on how many
 *   rows exist;
 * - rows keep their insertion order, and replacing a row keeps its place;
 * - every lookup except `list` and `trimOldest` uses a key or an index;
 * - a returned document cannot alter what is stored.
 *
 * Synchronous on purpose, like CaseRepository (the services that use it are synchronous).
 */
export interface TableSpec<T> {
  /** Lower-case letters and underscores only; it becomes part of a SQL identifier. */
  name: string;
  key: (doc: T) => string;
  /** Up to four indexed lookups. A function returning undefined leaves the row out of it. */
  indexes?: Record<string, (doc: T) => string | undefined>;
}

export const MAX_INDEXES = 4;

export interface DocumentTable<T> {
  get(key: string): T | undefined;
  /** Creates the document, or replaces it in place. Its indexes are recomputed from it. */
  put(doc: T): void;
  /** Insertion order, at most `limit`. */
  list(limit: number): T[];
  /** Documents whose index has this value, in insertion order, at most `limit`. */
  find(index: string, value: string, limit: number): T[];
  findOne(index: string, value: string): T | undefined;
  count(): number;
  countBy(index: string, value: string): number;
  /**
   * Changes one index value of one document without rewriting it (for example to mark a
   * command closed). The next `put` of the same key recomputes it from the document.
   */
  setIndex(key: string, index: string, value: string | undefined): void;
  delete(key: string): void;
  /** Deletes the oldest rows until `keep` remain. Returns how many were deleted. */
  trimOldest(keep: number): number;
  clear(): void;
}

const NAME = /^[a-z_]+$/;
/** Index names never reach SQL (columns are numbered), so camelCase is fine. */
const INDEX_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

function checkSpec<T>(spec: TableSpec<T>): string[] {
  if (!NAME.test(spec.name)) throw new Error(`Bad table name: ${spec.name}`);
  const names = Object.keys(spec.indexes ?? {});
  if (names.length > MAX_INDEXES)
    throw new Error(`A table has at most ${MAX_INDEXES} indexes`);
  for (const name of names)
    if (!INDEX_NAME.test(name)) throw new Error(`Bad index name: ${name}`);
  return names;
}

interface MemoryRow<T> {
  doc: T;
  indexes: Record<string, string | undefined>;
}

/** In-memory adapter for tests and for runtimes without SQLite. Not durable. */
export class MemoryDocumentTable<T> implements DocumentTable<T> {
  // A Map keeps insertion order, and set() on an existing key keeps its position.
  private readonly rows = new Map<string, MemoryRow<T>>();
  private readonly names: string[];

  constructor(private readonly spec: TableSpec<T>) {
    this.names = checkSpec(spec);
  }

  private require(index: string): void {
    if (!this.names.includes(index)) throw new Error(`Unknown index: ${index}`);
  }

  get(key: string): T | undefined {
    const row = this.rows.get(key);
    return row ? structuredClone(row.doc) : undefined;
  }

  put(doc: T): void {
    const indexes: Record<string, string | undefined> = {};
    for (const name of this.names)
      indexes[name] = this.spec.indexes![name](doc);
    this.rows.set(this.spec.key(doc), { doc: structuredClone(doc), indexes });
  }

  list(limit: number): T[] {
    return [...this.rows.values()]
      .slice(0, limit)
      .map((row) => structuredClone(row.doc));
  }

  find(index: string, value: string, limit: number): T[] {
    this.require(index);
    return [...this.rows.values()]
      .filter((row) => row.indexes[index] === value)
      .slice(0, limit)
      .map((row) => structuredClone(row.doc));
  }

  findOne(index: string, value: string): T | undefined {
    return this.find(index, value, 1)[0];
  }

  count(): number {
    return this.rows.size;
  }

  countBy(index: string, value: string): number {
    this.require(index);
    let total = 0;
    for (const row of this.rows.values())
      if (row.indexes[index] === value) total += 1;
    return total;
  }

  setIndex(key: string, index: string, value: string | undefined): void {
    this.require(index);
    const row = this.rows.get(key);
    if (row) row.indexes[index] = value;
  }

  delete(key: string): void {
    this.rows.delete(key);
  }

  trimOldest(keep: number): number {
    let removed = 0;
    for (const key of [...this.rows.keys()]) {
      if (this.rows.size <= keep) break;
      this.rows.delete(key);
      removed += 1;
    }
    return removed;
  }

  clear(): void {
    this.rows.clear();
  }
}

interface BodyRow {
  body_json: string;
}

const parse = <T>(row: unknown): T =>
  JSON.parse((row as BodyRow).body_json) as T;

/** One SQLite table per document type: key, up to four index columns, and the JSON body. */
export class SqliteDocumentTable<T> implements DocumentTable<T> {
  private readonly table: string;
  private readonly names: string[];
  private readonly selectOne: SqliteStatement;
  private readonly upsertOne: SqliteStatement;
  private readonly listAll: SqliteStatement;
  private readonly countAll: SqliteStatement;
  private readonly deleteOne: SqliteStatement;
  private readonly deleteAll: SqliteStatement;
  private readonly trimStatement: SqliteStatement;
  private readonly setIndexStatements = new Map<string, SqliteStatement>();
  private readonly findStatements = new Map<string, SqliteStatement>();
  private readonly countByStatements = new Map<string, SqliteStatement>();

  constructor(
    private readonly database: SqliteDatabase,
    private readonly spec: TableSpec<T>,
  ) {
    this.names = checkSpec(spec);
    this.table = `doc_${spec.name}`;
    const columns = this.names.map((_, position) => `i${position} TEXT`);
    database.exec(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        doc_key TEXT PRIMARY KEY,
        ${columns.join(",\n        ")}${columns.length ? "," : ""}
        body_json TEXT NOT NULL
      );
      ${this.names
        .map(
          (_, position) =>
            `CREATE INDEX IF NOT EXISTS ${this.table}_i${position} ON ${this.table} (i${position});`,
        )
        .join("\n")}
    `);
    const insertColumns = [
      "doc_key",
      ...this.names.map((_, position) => `i${position}`),
      "body_json",
    ];
    const updates = [
      ...this.names.map(
        (_, position) => `i${position} = excluded.i${position}`,
      ),
      "body_json = excluded.body_json",
    ];
    this.selectOne = database.prepare(
      `SELECT body_json FROM ${this.table} WHERE doc_key = ?`,
    );
    this.upsertOne = database.prepare(
      `INSERT INTO ${this.table} (${insertColumns.join(", ")})
       VALUES (${insertColumns.map(() => "?").join(", ")})
       ON CONFLICT(doc_key) DO UPDATE SET ${updates.join(", ")}`,
    );
    this.listAll = database.prepare(
      `SELECT body_json FROM ${this.table} ORDER BY rowid LIMIT ?`,
    );
    this.countAll = database.prepare(
      `SELECT COUNT(*) AS total FROM ${this.table}`,
    );
    this.deleteOne = database.prepare(
      `DELETE FROM ${this.table} WHERE doc_key = ?`,
    );
    this.deleteAll = database.prepare(`DELETE FROM ${this.table}`);
    this.trimStatement = database.prepare(
      `DELETE FROM ${this.table} WHERE rowid IN
         (SELECT rowid FROM ${this.table} ORDER BY rowid LIMIT ?)`,
    );
  }

  private column(index: string): string {
    const position = this.names.indexOf(index);
    if (position < 0) throw new Error(`Unknown index: ${index}`);
    return `i${position}`;
  }

  get(key: string): T | undefined {
    const row = this.selectOne.get(key);
    return row ? parse<T>(row) : undefined;
  }

  put(doc: T): void {
    this.upsertOne.run(
      this.spec.key(doc),
      ...this.names.map((name) => this.spec.indexes![name](doc) ?? null),
      JSON.stringify(doc),
    );
  }

  list(limit: number): T[] {
    return this.listAll.all(limit).map((row) => parse<T>(row));
  }

  find(index: string, value: string, limit: number): T[] {
    const column = this.column(index);
    let statement = this.findStatements.get(column);
    if (!statement) {
      statement = this.database.prepare(
        `SELECT body_json FROM ${this.table} WHERE ${column} = ? ORDER BY rowid LIMIT ?`,
      );
      this.findStatements.set(column, statement);
    }
    return statement.all(value, limit).map((row) => parse<T>(row));
  }

  findOne(index: string, value: string): T | undefined {
    return this.find(index, value, 1)[0];
  }

  count(): number {
    return (this.countAll.get() as { total: number }).total;
  }

  countBy(index: string, value: string): number {
    const column = this.column(index);
    let statement = this.countByStatements.get(column);
    if (!statement) {
      statement = this.database.prepare(
        `SELECT COUNT(*) AS total FROM ${this.table} WHERE ${column} = ?`,
      );
      this.countByStatements.set(column, statement);
    }
    return (statement.get(value) as { total: number }).total;
  }

  setIndex(key: string, index: string, value: string | undefined): void {
    const column = this.column(index);
    let statement = this.setIndexStatements.get(column);
    if (!statement) {
      statement = this.database.prepare(
        `UPDATE ${this.table} SET ${column} = ? WHERE doc_key = ?`,
      );
      this.setIndexStatements.set(column, statement);
    }
    statement.run(value ?? null, key);
  }

  delete(key: string): void {
    this.deleteOne.run(key);
  }

  trimOldest(keep: number): number {
    const excess = this.count() - keep;
    if (excess <= 0) return 0;
    this.trimStatement.run(excess);
    return excess;
  }

  clear(): void {
    this.deleteAll.run();
  }
}
