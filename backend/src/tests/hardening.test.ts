import test from "node:test";
import assert from "node:assert/strict";
import { isTestRun } from "../platform/runtime";
import { redisWarnings } from "../startupGuard";
import { DDL_LOCK_SQL } from "../storage/postgres";

test("a production process never behaves as a test run, whatever NODE_TEST_CONTEXT says", () => {
  assert.equal(isTestRun({ NODE_TEST_CONTEXT: "child" }), true);
  assert.equal(isTestRun({}), false);
  assert.equal(
    isTestRun({ NODE_TEST_CONTEXT: "child", NODE_ENV: "production" }),
    false,
  );
});

test("the schema advisory lock id is namespaced by a name, not a bare number", () => {
  assert.match(DDL_LOCK_SQL, /hashtext\('goassist_ddl'\)/);
});

test("a Redis address off this machine without a password is warned about", () => {
  assert.equal(
    redisWarnings({ GOASSIST_REDIS_URL: "redis://localhost:6379" }).length,
    0,
  );
  assert.equal(
    redisWarnings({ GOASSIST_REDIS_URL: "redis://127.0.0.1" }).length,
    0,
  );
  assert.equal(redisWarnings({}).length, 0);
  assert.equal(
    redisWarnings({ GOASSIST_REDIS_URL: "redis://10.0.0.5:6379" }).length,
    1,
  );
  assert.equal(
    redisWarnings({ GOASSIST_REDIS_URL: "redis://:secret@10.0.0.5:6379" })
      .length,
    0,
  );
  assert.equal(
    redisWarnings({ GOASSIST_REDIS_URL: "rediss://user:pw@cache.example:6380" })
      .length,
    0,
  );
});
