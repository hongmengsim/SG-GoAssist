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
  /** How `list` and `find` order their results: by insertion (default) or by key. */
  orderBy?: "insertion" | "key";
}

export const MAX_INDEXES = 4;

export interface DocumentTable<T> {
  get(key: string): Promise<T | undefined>;
  /** Creates the document, or replaces it in place. Its indexes are recomputed from it. */
  put(doc: T): Promise<void>;
  /** Insertion order, at most `limit`. */
  list(limit: number): Promise<T[]>;
  /** Documents whose index has this value, in insertion order, at most `limit`. */
  find(index: string, value: string, limit: number): Promise<T[]>;
  findOne(index: string, value: string): Promise<T | undefined>;
  count(): Promise<number>;
  countBy(index: string, value: string): Promise<number>;
  /**
   * Changes one index value of one document without rewriting it (for example to mark a
   * command closed). The next `put` of the same key recomputes it from the document.
   */
  setIndex(
    key: string,
    index: string,
    value: string | undefined,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  /** Deletes the oldest rows until `keep` remain. Returns how many were deleted. */
  trimOldest(keep: number): Promise<number>;
  clear(): Promise<void>;
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

  async get(key: string): Promise<T | undefined> {
    const row = this.rows.get(key);
    return row ? structuredClone(row.doc) : undefined;
  }

  async put(doc: T): Promise<void> {
    const indexes: Record<string, string | undefined> = {};
    for (const name of this.names)
      indexes[name] = this.spec.indexes![name](doc);
    this.rows.set(this.spec.key(doc), { doc: structuredClone(doc), indexes });
  }

  private ordered(): Array<MemoryRow<T>> {
    const rows = [...this.rows.values()];
    if (this.spec.orderBy !== "key") return rows;
    return rows.sort((a, b) => {
      const left = this.spec.key(a.doc);
      const right = this.spec.key(b.doc);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }

  async list(limit: number): Promise<T[]> {
    return this.ordered()
      .slice(0, limit)
      .map((row) => structuredClone(row.doc));
  }

  async find(index: string, value: string, limit: number): Promise<T[]> {
    this.require(index);
    return this.ordered()
      .filter((row) => row.indexes[index] === value)
      .slice(0, limit)
      .map((row) => structuredClone(row.doc));
  }

  async findOne(index: string, value: string): Promise<T | undefined> {
    return (await this.find(index, value, 1))[0];
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async countBy(index: string, value: string): Promise<number> {
    this.require(index);
    let total = 0;
    for (const row of this.rows.values())
      if (row.indexes[index] === value) total += 1;
    return total;
  }

  async setIndex(
    key: string,
    index: string,
    value: string | undefined,
  ): Promise<void> {
    this.require(index);
    const row = this.rows.get(key);
    if (row) row.indexes[index] = value;
  }

  async delete(key: string): Promise<void> {
    this.rows.delete(key);
  }

  async trimOldest(keep: number): Promise<number> {
    let removed = 0;
    for (const key of [...this.rows.keys()]) {
      if (this.rows.size <= keep) break;
      this.rows.delete(key);
      removed += 1;
    }
    return removed;
  }

  async clear(): Promise<void> {
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
      `SELECT body_json FROM ${this.table} ORDER BY ${spec.orderBy === "key" ? "doc_key" : "rowid"} LIMIT ?`,
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

  async get(key: string): Promise<T | undefined> {
    const row = this.selectOne.get(key);
    return row ? parse<T>(row) : undefined;
  }

  async put(doc: T): Promise<void> {
    this.upsertOne.run(
      this.spec.key(doc),
      ...this.names.map((name) => this.spec.indexes![name](doc) ?? null),
      JSON.stringify(doc),
    );
  }

  async list(limit: number): Promise<T[]> {
    return this.listAll.all(limit).map((row) => parse<T>(row));
  }

  async find(index: string, value: string, limit: number): Promise<T[]> {
    const column = this.column(index);
    let statement = this.findStatements.get(column);
    if (!statement) {
      statement = this.database.prepare(
        `SELECT body_json FROM ${this.table} WHERE ${column} = ? ORDER BY ${this.spec.orderBy === "key" ? "doc_key" : "rowid"} LIMIT ?`,
      );
      this.findStatements.set(column, statement);
    }
    return statement.all(value, limit).map((row) => parse<T>(row));
  }

  async findOne(index: string, value: string): Promise<T | undefined> {
    return (await this.find(index, value, 1))[0];
  }

  async count(): Promise<number> {
    return (this.countAll.get() as { total: number }).total;
  }

  async countBy(index: string, value: string): Promise<number> {
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

  async setIndex(
    key: string,
    index: string,
    value: string | undefined,
  ): Promise<void> {
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

  async delete(key: string): Promise<void> {
    this.deleteOne.run(key);
  }

  async trimOldest(keep: number): Promise<number> {
    const excess = (await this.count()) - keep;
    if (excess <= 0) return 0;
    this.trimStatement.run(excess);
    return excess;
  }

  async clear(): Promise<void> {
    this.deleteAll.run();
  }
}
