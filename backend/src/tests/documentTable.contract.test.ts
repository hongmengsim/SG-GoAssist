import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryDocumentTable,
  SqliteDocumentTable,
  type DocumentTable,
  type TableSpec,
} from "../storage/documentTable";
import { openSqliteDatabase } from "../storage/sqlite";

interface Doc {
  id: string;
  group?: string;
  kind: string;
  nested: { values: number[] };
}

const spec: TableSpec<Doc> = {
  name: "sample",
  key: (doc) => doc.id,
  indexes: { group: (doc) => doc.group, kind: (doc) => doc.kind },
};

const doc = (id: string, group?: string, kind = "a"): Doc => ({
  id,
  group,
  kind,
  nested: { values: [1, 2] },
});

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

// The table holds only prepared statements; keep the databases referenced.
const openDatabases: unknown[] = [];

const adapters: Array<{
  name: string;
  create: () => DocumentTable<Doc>;
  skip?: string;
}> = [
  { name: "memory", create: () => new MemoryDocumentTable<Doc>(spec) },
  {
    name: "sqlite",
    skip: sqliteAvailable ? undefined : "node:sqlite is not available",
    create: () => {
      const database = openSqliteDatabase(":memory:");
      if (!database) throw new Error("sqlite unavailable");
      openDatabases.push(database);
      return new SqliteDocumentTable<Doc>(database, spec);
    },
  },
];

for (const adapter of adapters) {
  const options = { skip: adapter.skip };
  const label = `DocumentTable (${adapter.name})`;

  test(
    `${label}: one row per key, the latest write wins, order is kept`,
    options,
    async () => {
      const table = adapter.create();
      assert.equal(await table.get("A"), undefined);
      await table.put(doc("A", "g1"));
      await table.put(doc("B", "g1"));
      await table.put({ ...doc("A", "g2"), kind: "z" });
      assert.equal(await table.count(), 2);
      assert.equal((await table.get("A"))?.kind, "z");
      assert.deepEqual(
        (await table.list(10)).map((item) => item.id),
        ["A", "B"],
      );
      assert.deepEqual(
        (await table.list(1)).map((item) => item.id),
        ["A"],
      );
    },
  );

  test(
    `${label}: find and countBy use an index; an undefined value is left out`,
    options,
    async () => {
      const table = adapter.create();
      await table.put(doc("A", "g1"));
      await table.put(doc("B", "g2"));
      await table.put(doc("C", "g1"));
      await table.put(doc("D"));
      assert.deepEqual(
        (await table.find("group", "g1", 10)).map((item) => item.id),
        ["A", "C"],
      );
      assert.equal((await table.find("group", "g1", 1)).length, 1);
      assert.equal((await table.findOne("group", "g2"))?.id, "B");
      assert.equal(await table.findOne("group", "none"), undefined);
      assert.equal(await table.countBy("group", "g1"), 2);
      assert.equal(await table.countBy("kind", "a"), 4);
      await assert.rejects(async () => await table.find("nope", "x", 1));
    },
  );

  test(
    `${label}: replacing a row moves it between index values`,
    options,
    async () => {
      const table = adapter.create();
      await table.put(doc("A", "g1"));
      await table.put(doc("A", "g2"));
      assert.equal(await table.countBy("group", "g1"), 0);
      assert.equal(await table.countBy("group", "g2"), 1);
    },
  );

  test(
    `${label}: setIndex changes one index without rewriting the document`,
    options,
    async () => {
      const table = adapter.create();
      await table.put(doc("A", "g1"));
      await table.setIndex("A", "group", undefined);
      assert.equal(await table.countBy("group", "g1"), 0);
      assert.equal((await table.get("A"))?.group, "g1");
      await table.setIndex("A", "group", "g9");
      assert.equal((await table.findOne("group", "g9"))?.id, "A");
      await table.setIndex("MISSING", "group", "g9");
      assert.equal(await table.count(), 1);
    },
  );

  test(`${label}: delete, trimOldest and clear`, options, async () => {
    const table = adapter.create();
    for (const id of ["A", "B", "C", "D", "E"]) await table.put(doc(id, "g"));
    await table.delete("C");
    assert.equal(await table.get("C"), undefined);
    assert.equal(await table.trimOldest(2), 2);
    assert.deepEqual(
      (await table.list(10)).map((item) => item.id),
      ["D", "E"],
    );
    assert.equal(await table.trimOldest(5), 0);
    await table.clear();
    assert.equal(await table.count(), 0);
  });

  test(
    `${label}: a returned document cannot alter what is stored`,
    options,
    async () => {
      const table = adapter.create();
      await table.put(doc("A", "g"));
      (await table.get("A"))?.nested.values.push(99);
      (await table.find("group", "g", 1))[0].nested.values.push(99);
      assert.deepEqual((await table.get("A"))?.nested.values, [1, 2]);
    },
  );
}

test("a table or index name that is not lower-case letters is refused", () => {
  const database = openSqliteDatabase(":memory:");
  if (!database) return;
  assert.throws(
    () =>
      new SqliteDocumentTable(database, {
        name: "x; DROP TABLE y",
        key: () => "k",
      }),
  );
  assert.throws(
    () =>
      new MemoryDocumentTable({
        name: "ok",
        key: () => "k",
        indexes: { "bad name": () => "v" },
      }),
  );
  assert.throws(
    () =>
      new MemoryDocumentTable({
        name: "ok",
        key: () => "k",
        indexes: {
          a: () => "1",
          b: () => "1",
          c: () => "1",
          d: () => "1",
          e: () => "1",
        },
      }),
  );
});
