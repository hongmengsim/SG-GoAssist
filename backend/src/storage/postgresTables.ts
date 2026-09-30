import type { DocumentTable, TableSpec } from "./documentTable";
import { MAX_INDEXES } from "./documentTable";
import { createSchemaObjects, toNumber, type PgPool } from "./postgres";

const NAME = /^[a-z_]+$/;
const INDEX_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * A DocumentTable on Postgres: one row per document, its index values in numbered columns,
 * and the document as JSON text (text, not jsonb, so the key order the service wrote is the
 * key order it reads back; the services compare records as strings). Rows keep insertion order
 * through a sequence column that an update does not change.
 *
 * The table is created when first used. Every method waits for that, so the adapter can be
 * built synchronously like the SQLite one.
 */
export class PostgresDocumentTable<T> implements DocumentTable<T> {
  private readonly table: string;
  private readonly names: string[];
  private readonly ready: Promise<void>;
  private readonly order: string;

  constructor(
    private readonly pool: PgPool,
    private readonly spec: TableSpec<T>,
  ) {
    if (!NAME.test(spec.name)) throw new Error(`Bad table name: ${spec.name}`);
    this.names = Object.keys(spec.indexes ?? {});
    if (this.names.length > MAX_INDEXES)
      throw new Error(`A table has at most ${MAX_INDEXES} indexes`);
    for (const name of this.names)
      if (!INDEX_NAME.test(name)) throw new Error(`Bad index name: ${name}`);
    this.table = `doc_${spec.name}`;
    this.order = spec.orderBy === "key" ? "doc_key" : "seq";
    const columns = this.names.map((_, position) => `i${position} TEXT`);
    this.ready = createSchemaObjects(pool, [
      `CREATE TABLE IF NOT EXISTS ${this.table} (
        seq BIGSERIAL,
        doc_key TEXT PRIMARY KEY,
        ${columns.map((column) => `${column},`).join("\n        ")}
        body_json TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.table}_seq ON ${this.table} (seq)`,
      ...this.names.map(
        (_, position) =>
          `CREATE INDEX IF NOT EXISTS ${this.table}_i${position} ON ${this.table} (i${position})`,
      ),
    ]);
    // A failed start-up must surface on the first use, not as an unhandled rejection here.
    this.ready.catch(() => undefined);
  }

  private column(index: string): string {
    const position = this.names.indexOf(index);
    if (position < 0) throw new Error(`Unknown index: ${index}`);
    return `i${position}`;
  }

  private async query(text: string, values: unknown[] = []) {
    await this.ready;
    return this.pool.query(text, values);
  }

  async get(key: string): Promise<T | undefined> {
    const result = await this.query(
      `SELECT body_json FROM ${this.table} WHERE doc_key = $1`,
      [key],
    );
    return result.rows[0]
      ? (JSON.parse(String(result.rows[0].body_json)) as T)
      : undefined;
  }

  async put(doc: T): Promise<void> {
    const columns = [
      "doc_key",
      ...this.names.map((_, position) => `i${position}`),
      "body_json",
    ];
    const updates = columns
      .slice(1)
      .map((column) => `${column} = EXCLUDED.${column}`);
    await this.query(
      `INSERT INTO ${this.table} (${columns.join(", ")})
       VALUES (${columns.map((_, position) => `$${position + 1}`).join(", ")})
       ON CONFLICT (doc_key) DO UPDATE SET ${updates.join(", ")}`,
      [
        this.spec.key(doc),
        ...this.names.map((name) => this.spec.indexes![name](doc) ?? null),
        JSON.stringify(doc),
      ],
    );
  }

  async list(limit: number): Promise<T[]> {
    const result = await this.query(
      `SELECT body_json FROM ${this.table} ORDER BY ${this.order} LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => JSON.parse(String(row.body_json)) as T);
  }

  async find(index: string, value: string, limit: number): Promise<T[]> {
    const result = await this.query(
      `SELECT body_json FROM ${this.table} WHERE ${this.column(index)} = $1 ORDER BY ${this.order} LIMIT $2`,
      [value, limit],
    );
    return result.rows.map((row) => JSON.parse(String(row.body_json)) as T);
  }

  async findOne(index: string, value: string): Promise<T | undefined> {
    return (await this.find(index, value, 1))[0];
  }

  async count(): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(*) AS total FROM ${this.table}`,
    );
    return toNumber(result.rows[0].total);
  }

  async countBy(index: string, value: string): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(*) AS total FROM ${this.table} WHERE ${this.column(index)} = $1`,
      [value],
    );
    return toNumber(result.rows[0].total);
  }

  async setIndex(
    key: string,
    index: string,
    value: string | undefined,
  ): Promise<void> {
    await this.query(
      `UPDATE ${this.table} SET ${this.column(index)} = $1 WHERE doc_key = $2`,
      [value ?? null, key],
    );
  }

  async delete(key: string): Promise<void> {
    await this.query(`DELETE FROM ${this.table} WHERE doc_key = $1`, [key]);
  }

  async trimOldest(keep: number): Promise<number> {
    const excess = (await this.count()) - keep;
    if (excess <= 0) return 0;
    await this.query(
      `DELETE FROM ${this.table} WHERE seq IN (SELECT seq FROM ${this.table} ORDER BY seq LIMIT $1)`,
      [excess],
    );
    return excess;
  }

  async clear(): Promise<void> {
    await this.query(`DELETE FROM ${this.table}`);
  }
}
