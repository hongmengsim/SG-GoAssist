import test from "node:test";
import assert from "node:assert/strict";
import {
  CONNECT_TIMEOUT_MS,
  STATEMENT_TIMEOUT_MS,
  acquirePostgres,
  openPostgres,
  type PgPool,
} from "../storage/postgres";

class FakePool implements PgPool {
  static last: FakePool | undefined;
  readonly listeners: Array<(error: Error) => void> = [];
  constructor(readonly config: Record<string, unknown>) {
    FakePool.last = this;
  }
  on(_event: "error", listener: (error: Error) => void): void {
    this.listeners.push(listener);
  }
  async query() {
    return { rows: [], rowCount: 0 };
  }
  async connect() {
    return { query: async () => ({ rows: [], rowCount: 0 }), release() {} };
  }
  async end() {}
}

test("a pool error from an idle connection is handled, not left to crash the process", () => {
  const reported: string[] = [];
  openPostgres("postgres://x/y", {
    poolClass: FakePool,
    onError: (error) => reported.push(error.message),
  });
  const pool = FakePool.last!;
  assert.equal(pool.listeners.length, 1, "an error listener must be attached");
  pool.listeners[0](new Error("terminating connection"));
  assert.deepEqual(reported, ["terminating connection"]);
});

test("connections time out, statements are bounded, and the schema stays in the session options", () => {
  openPostgres("postgres://x/y", { poolClass: FakePool, schema: "t_abc" });
  const config = FakePool.last!.config;
  assert.equal(config.connectionTimeoutMillis, CONNECT_TIMEOUT_MS);
  assert.match(String(config.options), /search_path=t_abc/);
  assert.equal(config.statement_timeout, STATEMENT_TIMEOUT_MS);
});

test("a schema name that is not a plain identifier is refused", () => {
  assert.throws(
    () =>
      openPostgres("postgres://x/y", {
        poolClass: FakePool,
        schema: "a; DROP TABLE b",
      }),
    /Invalid schema name/,
  );
});

test("the parts of one process share one pool per database, and it is closed with the last of them", async () => {
  let created = 0;
  let ended = 0;
  class Counted extends FakePool {
    constructor(config: Record<string, unknown>) {
      super(config);
      created += 1;
    }
    override async end() {
      ended += 1;
    }
  }
  const first = acquirePostgres("postgres://x/shared", { poolClass: Counted });
  const second = acquirePostgres("postgres://x/shared", { poolClass: Counted });
  assert.equal(created, 1, "one pool for two users");
  await first.end();
  assert.equal(ended, 0, "still in use by the other");
  await first.end();
  assert.equal(ended, 0, "ending twice counts once");
  await second.end();
  assert.equal(ended, 1, "closed with the last user");
  acquirePostgres("postgres://x/shared", { poolClass: Counted });
  assert.equal(created, 2, "a new pool after all were closed");
});
