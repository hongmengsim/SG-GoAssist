// Loaded before every test file (node --import) so the tests do not depend on the secrets in the
// developer's shell. A test that needs a secret sets it itself.
for (const name of [
  "DEVICE_SHARED_SECRET",
  "DEVICE_SECRETS",
  "OPERATOR_API_TOKEN",
]) {
  delete process.env[name];
}
