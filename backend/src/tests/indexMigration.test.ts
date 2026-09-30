import test from "node:test";
import assert from "node:assert/strict";
import { SqliteDocumentTable, type TableSpec } from "../storage/documentTable";
import { PostgresDocumentTable } from "../storage/postgresTables";
import { openSqliteDatabase } from "../storage/sqlite";
import {
  makeTestPool,
  postgresSkip,
  registerPostgresCleanup,
} from "./helpers/postgres";

registerPostgresCleanup();

interface Doc {
  id: string;
  bus: string;
  status: string;
}

/** What an older version of the code created: two indexes. */
const oldSpec: TableSpec<Doc> = {
  name: "migrating",
  key: (doc) => doc.id,
  indexes: { bus: (doc) => doc.bus, status: (doc) => doc.status },
};

/** The current version: a third index was added, and the first two kept their places. */
const newSpec: TableSpec<Doc> = {
  ...oldSpec,
  indexes: {
    ...oldSpec.indexes,
    busStatus: (doc) => `${doc.bus}:${doc.status}`,
  },
};

/** The current version reorders the indexes, so a column's meaning changes. */
const reorderedSpec: TableSpec<Doc> = {
  ...oldSpec,
  indexes: { status: (doc) => doc.status, bus: (doc) => doc.bus },
};

const doc = (id: string, bus: string, status: string): Doc => ({
  id,
  bus,
  status,
});

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

test(
  "sqlite: a table made before an index existed gets the column, the index and the values",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
    const database = openSqliteDatabase(":memory:")!;
    const before = new SqliteDocumentTable<Doc>(database, oldSpec);
    await before.put(doc("A", "B1", "SENDING"));
    await before.put(doc("B", "B1", "ACKNOWLEDGED"));
    const after = new SqliteDocumentTable<Doc>(database, newSpec);
    assert.deepEqual(
      (await after.find("busStatus", "B1:SENDING", 10)).map((item) => item.id),
      ["A"],
    );
    await after.put(doc("C", "B2", "SENDING"));
    assert.equal(await after.countBy("busStatus", "B2:SENDING"), 1);
    // Opening it a third time changes nothing.
    const again = new SqliteDocumentTable<Doc>(database, newSpec);
    assert.equal(await again.count(), 3);
    database.close();
  },
);

test(
  "sqlite: indexes that swap places are refilled so each column means what its name says",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
    const database = openSqliteDatabase(":memory:")!;
    await new SqliteDocumentTable<Doc>(database, oldSpec).put(
      doc("A", "B1", "SENDING"),
    );
    const swapped = new SqliteDocumentTable<Doc>(database, reorderedSpec);
    assert.equal((await swapped.findOne("bus", "B1"))?.id, "A");
    assert.equal((await swapped.findOne("status", "SENDING"))?.id, "A");
    assert.equal(await swapped.findOne("status", "B1"), undefined);
    database.close();
  },
);

test(
  "postgres: a table made before an index existed gets the column, the index and the values",
  { skip: postgresSkip },
  async () => {
    const pool = makeTestPool();
    const before = new PostgresDocumentTable<Doc>(pool, oldSpec);
    await before.put(doc("A", "B1", "SENDING"));
    await before.put(doc("B", "B1", "ACKNOWLEDGED"));
    const after = new PostgresDocumentTable<Doc>(pool, newSpec);
    assert.deepEqual(
      (await after.find("busStatus", "B1:SENDING", 10)).map((item) => item.id),
      ["A"],
    );
    await after.put(doc("C", "B2", "SENDING"));
    assert.equal(await after.countBy("busStatus", "B2:SENDING"), 1);
  },
);

test(
  "postgres: indexes that swap places are refilled so each column means what its name says",
  { skip: postgresSkip },
  async () => {
    const pool = makeTestPool();
    await new PostgresDocumentTable<Doc>(pool, oldSpec).put(
      doc("A", "B1", "SENDING"),
    );
    const swapped = new PostgresDocumentTable<Doc>(pool, reorderedSpec);
    assert.equal((await swapped.findOne("bus", "B1"))?.id, "A");
    assert.equal((await swapped.findOne("status", "SENDING"))?.id, "A");
    assert.equal(await swapped.findOne("status", "B1"), undefined);
  },
);
