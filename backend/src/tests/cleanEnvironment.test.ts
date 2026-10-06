import assert from "node:assert/strict";
import test from "node:test";

// The test run must not depend on what the developer's shell happens to hold. With the device secret or the
// operator token set, the server demands credentials that most tests do not send, and the suite hangs or fails.
// The package scripts load helpers/cleanEnvironment.js before every test file; tests that need a secret set
// their own.
test("the test run starts without the secrets from the shell", () => {
  for (const name of [
    "DEVICE_SHARED_SECRET",
    "DEVICE_SECRETS",
    "OPERATOR_API_TOKEN",
  ]) {
    assert.equal(process.env[name], undefined, `${name} leaked into the tests`);
  }
});
