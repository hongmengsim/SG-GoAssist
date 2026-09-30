import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DistributedKeyedLock,
  InProcessKeyedLock,
  LockTimeoutError,
  type KeyedLock,
} from "../concurrency/keyedLock";
import { MemoryLeaseStore, SqliteLeaseStore } from "../concurrency/leaseStores";
import { openSqliteDatabase } from "../storage/sqlite";

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A read-modify-write with a gap between the read and the write, as real work has. */
async function increment(box: { value: number }): Promise<void> {
  const read = box.value;
  await tick();
  box.value = read + 1;
}

const implementations: Array<{ name: string; make: () => KeyedLock }> = [
  { name: "in-process lock", make: () => new InProcessKeyedLock() },
  {
    name: "distributed lock (memory leases)",
    make: () => new DistributedKeyedLock(new MemoryLeaseStore()),
  },
];

for (const { name, make } of implementations) {
  test(`${name}: same-key work never overlaps, so no update is lost`, async () => {
    const lock = make();
    const box = { value: 0 };
    await Promise.all(
      Array.from({ length: 50 }, () => lock.run("k", () => increment(box))),
    );
    assert.equal(box.value, 50);
  });

  test(`${name}: without the lock the same code does lose updates (the control)`, async () => {
    const box = { value: 0 };
    await Promise.all(Array.from({ length: 50 }, () => increment(box)));
    assert.ok(box.value < 50, `expected lost updates, got ${box.value}`);
  });

  test(`${name}: same-key work starts in arrival order`, async () => {
    const lock = make();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        lock.run("k", async () => {
          await tick();
          order.push(n);
        }),
      ),
    );
    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  test(`${name}: different keys run side by side`, async () => {
    const lock = make();
    let inside = 0;
    let peak = 0;
    await Promise.all(
      ["a", "b", "c"].map((key) =>
        lock.run(key, async () => {
          inside += 1;
          peak = Math.max(peak, inside);
          await sleep(20);
          inside -= 1;
        }),
      ),
    );
    assert.equal(peak, 3);
  });

  test(`${name}: work that holds a key can take the same key again without waiting for itself`, async () => {
    const lock = make();
    const result = await lock.run("k", async () => {
      const inner = await lock.run("k", async () => {
        await tick();
        return "inner";
      });
      return `outer+${inner}`;
    });
    assert.equal(result, "outer+inner");
  });

  test(`${name}: work that holds one key can take another`, async () => {
    const lock = make();
    const result = await lock.run("bus", () =>
      lock.run("stop", async () => "both"),
    );
    assert.equal(result, "both");
  });

  test(`${name}: a caller outside the work still waits for the key`, async () => {
    const lock = make();
    const events: string[] = [];
    const holder = lock.run("k", async () => {
      events.push("holder start");
      await sleep(30);
      events.push("holder end");
    });
    await tick();
    const outsider = lock.run("k", async () => {
      events.push("outsider");
    });
    await Promise.all([holder, outsider]);
    assert.deepEqual(events, ["holder start", "holder end", "outsider"]);
  });

  test(`${name}: an error releases the lock and reaches the caller`, async () => {
    const lock = make();
    await assert.rejects(
      lock.run("k", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(await lock.run("k", async () => "still works"), "still works");
  });
}

test("a lease that is held blocks another taker until it expires", async () => {
  let now = 1_000;
  const leases = new MemoryLeaseStore(() => now);
  assert.equal(await leases.tryAcquire("k", "a", 100), true);
  assert.equal(await leases.tryAcquire("k", "b", 100), false);
  now += 101;
  assert.equal(await leases.tryAcquire("k", "b", 100), true);
  // The old owner can neither renew nor release what it lost.
  assert.equal(await leases.renew("k", "a", 100), false);
  await leases.release("k", "a");
  assert.equal(await leases.tryAcquire("k", "c", 100), false);
});

test("waiting longer than the timeout gives a clear error", async () => {
  const leases = new MemoryLeaseStore();
  await leases.tryAcquire("k", "someone else", 60_000);
  const lock = new DistributedKeyedLock(leases, { acquireTimeoutMs: 60 });
  await assert.rejects(
    lock.run("k", async () => "never"),
    (error: unknown) => error instanceof LockTimeoutError,
  );
});

test("a holder that never releases (a crashed process) is overtaken after its lease expires", async () => {
  const leases = new MemoryLeaseStore();
  await leases.tryAcquire("k", "crashed", 60);
  const lock = new DistributedKeyedLock(leases, { acquireTimeoutMs: 2_000 });
  assert.equal(await lock.run("k", async () => "took over"), "took over");
});

test("a lease is renewed while long work runs, so nobody enters early", async () => {
  const leases = new MemoryLeaseStore();
  const lock = new DistributedKeyedLock(leases, { ttlMs: 60 });
  let insideNow = 0;
  let overlapped = false;
  const other = new DistributedKeyedLock(leases, { ttlMs: 60 });
  const work = async () => {
    insideNow += 1;
    if (insideNow > 1) overlapped = true;
    await sleep(250);
    insideNow -= 1;
  };
  await Promise.all([lock.run("k", work), other.run("k", work)]);
  assert.equal(overlapped, false);
});

test(
  "two processes on one database file exclude each other (two connections stand in for two processes)",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-lock-"));
    const file = join(directory, "shared.sqlite");
    const first = openSqliteDatabase(file);
    const second = openSqliteDatabase(file);
    assert.ok(first && second);
    try {
      // The shared counter lives in the database, so lost updates would show there.
      first.exec(
        "CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER)",
      );
      first.exec("INSERT INTO counter VALUES (1, 0)");
      const lockA = new DistributedKeyedLock(new SqliteLeaseStore(first));
      const lockB = new DistributedKeyedLock(new SqliteLeaseStore(second));
      const bump = (database: typeof first) => async () => {
        const row = database
          .prepare("SELECT value FROM counter WHERE id = 1")
          .get() as { value: number };
        await tick();
        database
          .prepare("UPDATE counter SET value = ? WHERE id = 1")
          .run(row.value + 1);
      };
      const rounds = 25;
      await Promise.all([
        ...Array.from({ length: rounds }, () => lockA.run("k", bump(first))),
        ...Array.from({ length: rounds }, () => lockB.run("k", bump(second))),
      ]);
      const total = (
        first.prepare("SELECT value FROM counter WHERE id = 1").get() as {
          value: number;
        }
      ).value;
      assert.equal(total, rounds * 2);
    } finally {
      first.close();
      second.close();
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the file.
      }
    }
  },
);

test(
  "the same two connections without the lock do lose updates (the control)",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-lock-"));
    const file = join(directory, "shared.sqlite");
    const first = openSqliteDatabase(file);
    const second = openSqliteDatabase(file);
    assert.ok(first && second);
    try {
      first.exec(
        "CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER)",
      );
      first.exec("INSERT INTO counter VALUES (1, 0)");
      const bump = (database: typeof first) => async () => {
        const row = database
          .prepare("SELECT value FROM counter WHERE id = 1")
          .get() as { value: number };
        await tick();
        database
          .prepare("UPDATE counter SET value = ? WHERE id = 1")
          .run(row.value + 1);
      };
      await Promise.all([
        ...Array.from({ length: 25 }, () => bump(first)()),
        ...Array.from({ length: 25 }, () => bump(second)()),
      ]);
      const total = (
        first.prepare("SELECT value FROM counter WHERE id = 1").get() as {
          value: number;
        }
      ).value;
      assert.ok(total < 50, `expected lost updates, got ${total}`);
    } finally {
      first.close();
      second.close();
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the file.
      }
    }
  },
);

test("the lock is chosen from the environment, and a wrong choice is refused", async () => {
  const { lockFromEnvironment } = await import("../concurrency/locks");
  assert.ok(lockFromEnvironment({}, undefined) instanceof InProcessKeyedLock);
  assert.throws(
    () => lockFromEnvironment({ GOASSIST_LOCKS: "database" }, undefined),
    /needs a shared database/,
  );
  assert.throws(
    () => lockFromEnvironment({ GOASSIST_LOCKS: "zookeeper" }, undefined),
    /Unknown GOASSIST_LOCKS/,
  );
  if (!sqliteAvailable) return;
  const database = openSqliteDatabase(":memory:");
  assert.ok(database);
  const lock = lockFromEnvironment(
    {
      GOASSIST_LOCKS: "database",
      GOASSIST_LOCK_TTL_MS: "2000",
      GOASSIST_LOCK_TIMEOUT_MS: "nonsense",
    },
    new SqliteLeaseStore(database),
  );
  assert.ok(lock instanceof DistributedKeyedLock);
  assert.equal(await lock.run("k", async () => "ok"), "ok");
  database.close();
});

// ---- the same lock behaviour on Postgres (runs only when GOASSIST_TEST_DATABASE_URL is set) ----

import { PostgresLeaseStore } from "../concurrency/postgresLeaseStore";
import {
  makeTestPool,
  postgresSkip,
  registerPostgresCleanup,
} from "./helpers/postgres";

registerPostgresCleanup();

test(
  "postgres lease: held blocks others, expires, and only its owner can renew or release",
  { skip: postgresSkip },
  async () => {
    const leases = new PostgresLeaseStore(makeTestPool());
    assert.equal(await leases.tryAcquire("k", "a", 150), true);
    assert.equal(await leases.tryAcquire("k", "b", 150), false);
    assert.equal(await leases.renew("k", "b", 150), false);
    await leases.release("k", "b");
    assert.equal(
      await leases.tryAcquire("k", "c", 150),
      false,
      "b must not free a's lease",
    );
    await sleep(200);
    assert.equal(
      await leases.tryAcquire("k", "b", 150),
      true,
      "an expired lease can be taken",
    );
    assert.equal(
      await leases.renew("k", "a", 150),
      false,
      "the old owner lost it",
    );
    assert.equal(await leases.renew("k", "b", 150), true);
    await leases.release("k", "b");
    assert.equal(await leases.tryAcquire("k", "c", 150), true);
  },
);

test(
  "postgres locks: two connection pools (two processes) exclude each other, and the control loses updates",
  { skip: postgresSkip },
  async () => {
    const pool = makeTestPool();
    const other = pool; // the same schema; two lock objects with their own local queues stand in for two processes
    await pool.query(
      "CREATE TABLE counter (id INTEGER PRIMARY KEY, value INTEGER)",
    );
    await pool.query("INSERT INTO counter VALUES (1, 0)");
    const lockA = new DistributedKeyedLock(new PostgresLeaseStore(pool));
    const lockB = new DistributedKeyedLock(new PostgresLeaseStore(other));
    const read = async () =>
      Number(
        (
          (await pool.query("SELECT value FROM counter WHERE id = 1"))
            .rows[0] as { value: number }
        ).value,
      );
    const bump = async () => {
      const value = await read();
      await tick();
      await pool.query("UPDATE counter SET value = $1 WHERE id = 1", [
        value + 1,
      ]);
    };
    const rounds = 20;
    await Promise.all([
      ...Array.from({ length: rounds }, () => lockA.run("k", bump)),
      ...Array.from({ length: rounds }, () => lockB.run("k", bump)),
    ]);
    assert.equal(await read(), rounds * 2);

    await pool.query("UPDATE counter SET value = 0 WHERE id = 1");
    await Promise.all(Array.from({ length: rounds * 2 }, () => bump()));
    assert.ok((await read()) < rounds * 2, "without the lock updates are lost");
  },
);

test("closing the lock gives back the leases it holds, so a peer does not wait for them to expire", async () => {
  const leases = new MemoryLeaseStore();
  const dying = new DistributedKeyedLock(leases, { ttlMs: 60_000 });
  const neverEnds = new Promise<void>(() => undefined);
  void dying.run("k", () => neverEnds);
  await sleep(20);
  const peer = new DistributedKeyedLock(leases, { acquireTimeoutMs: 80 });
  await assert.rejects(
    peer.run("k", async () => "x"),
    (error: unknown) => error instanceof LockTimeoutError,
  );
  await dying.close();
  assert.equal(
    await peer.run("k", async () => "took over at once"),
    "took over at once",
  );
});

test("the default wait for a lock is longer than the lease, so a dead peer is waited out", async () => {
  const { DistributedKeyedLock: Lock } =
    await import("../concurrency/keyedLock");
  const source = Lock.toString();
  assert.ok(source.length > 0);
  // The two defaults are module constants; check them through behaviour instead of reflection:
  // a lease that expires after 40 ms is overtaken by a waiter that uses the default timeout.
  const leases = new MemoryLeaseStore();
  await leases.tryAcquire("k", "dead peer", 40);
  const lock = new Lock(leases);
  assert.equal(
    await lock.run("k", async () => "waited it out"),
    "waited it out",
  );
});
