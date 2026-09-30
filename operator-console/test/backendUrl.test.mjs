import test from "node:test";
import assert from "node:assert/strict";
import { resolveBackend } from "../src/backendUrl.js";

const page = { protocol: "http:", hostname: "console.lan" };

test("with no parameter the backend is this host on port 3000", () => {
  assert.equal(
    resolveBackend({ param: null, page }).baseUrl,
    "http://console.lan:3000",
  );
});

test("a parameter for the same host is accepted, on any port", () => {
  assert.equal(
    resolveBackend({ param: "http://console.lan:4000", page }).baseUrl,
    "http://console.lan:4000",
  );
});

test("a parameter for another host is refused, so a crafted link cannot collect the token", () => {
  const result = resolveBackend({ param: "http://evil.example", page });
  assert.equal(result.baseUrl, "http://console.lan:3000");
  assert.match(result.warning, /ignored/i);
});

test("an allow-listed host is accepted", () => {
  const result = resolveBackend({
    param: "https://api.goassist.example",
    page,
    allowed: ["https://api.goassist.example"],
  });
  assert.equal(result.baseUrl, "https://api.goassist.example");
});

test("only http and https addresses are accepted, and rubbish falls back to the default", () => {
  for (const param of ["javascript:alert(1)", "ftp://console.lan", "not a url", ""]) {
    assert.equal(
      resolveBackend({ param, page }).baseUrl,
      "http://console.lan:3000",
      param,
    );
  }
});

test("plain http to a host that is not this machine carries a warning about the token", () => {
  const lan = resolveBackend({ param: "http://console.lan:3000", page });
  assert.match(lan.warning, /plain http/i);
});

test("plain http to this machine needs no warning", () => {
  const local = { protocol: "http:", hostname: "localhost" };
  assert.equal(resolveBackend({ param: null, page: local }).warning, "");
});
