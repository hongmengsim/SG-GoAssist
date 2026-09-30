import test from "node:test";
import assert from "node:assert/strict";
import { assertSecureStart, checkSecurity } from "../startupGuard";

const secrets = { OPERATOR_API_TOKEN: "t", DEVICE_SHARED_SECRET: "s" };

test("a developer's laptop with no secrets starts, as before", () => {
  assert.deepEqual(assertSecureStart({}), []);
  assert.equal(checkSecurity({}).shared, false);
});

test("production, a shared database, Redis or shared locks each require both secrets", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { GOASSIST_DATABASE_URL: "postgres://x" },
    { GOASSIST_REDIS_URL: "redis://x" },
    { GOASSIST_EVENT_BUS: "redis" },
    { GOASSIST_LOCKS: "database" },
  ]) {
    assert.throws(
      () => assertSecureStart(env),
      /Refusing to start/,
      JSON.stringify(env),
    );
    assert.deepEqual(assertSecureStart({ ...env, ...secrets }), []);
  }
});

test("each missing secret is named", () => {
  assert.throws(
    () =>
      assertSecureStart({ NODE_ENV: "production", DEVICE_SHARED_SECRET: "s" }),
    /OPERATOR_API_TOKEN/,
  );
  assert.throws(
    () =>
      assertSecureStart({ NODE_ENV: "production", OPERATOR_API_TOKEN: "t" }),
    /DEVICE_SHARED_SECRET or DEVICE_SECRETS/,
  );
});

test("per-device secrets count as a device secret", () => {
  assert.deepEqual(
    assertSecureStart({
      NODE_ENV: "production",
      OPERATOR_API_TOKEN: "t",
      DEVICE_SECRETS: '{"AV-1":"x"}',
    }),
    [],
  );
});

test("the operator can choose to run open, and the problems are handed back to be logged", () => {
  const problems = assertSecureStart({
    GOASSIST_DATABASE_URL: "postgres://x",
    GOASSIST_ALLOW_INSECURE: "true",
  });
  assert.equal(problems.length, 2);
});
