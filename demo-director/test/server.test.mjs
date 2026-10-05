import test from "node:test";
import assert from "node:assert/strict";
import { createDirector } from "../src/director.js";
import { createDirectorServer } from "../src/server.js";
import {
  bayFree,
  directorConfig,
  fakeAgent,
  fakeBackend,
  listen,
} from "./helpers.mjs";

async function setup() {
  const real = await fakeAgent({
    busId: "AV-1",
    code: "code-real-1111",
    simulated: false,
    controlLevel: "movement",
  });
  const simulated = await fakeAgent({
    busId: "AV-2",
    code: "code-sim-2222",
    simulated: true,
    controlLevel: "scene",
  });
  const backend = await fakeBackend({
    token: "operator-token",
    bay: bayFree(),
  });
  const director = createDirector({
    config: directorConfig([real, simulated], backend.url),
  });
  await director.refresh();
  const server = createDirectorServer({ director });
  const listening = await listen((request, response) =>
    server.emit("request", request, response),
  );
  const post = (path, body, headers = { "x-demo-director": "1" }) =>
    fetch(`${listening.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body ?? {}),
    });
  const close = async () => {
    director.stop();
    await Promise.all([
      real.close(),
      simulated.close(),
      backend.close(),
      listening.close(),
    ]);
  };
  return { listening, post, close, real, simulated, backend };
}

test("the page says it is not the operator console, in its title, its banner and its frame", async () => {
  const { listening, close } = await setup();
  const html = await (await fetch(`${listening.url}/`)).text();
  assert.match(
    html,
    /<title>DEMO CONTROL \(not the operator console\)<\/title>/,
  );
  assert.match(html, /DEMO CONTROL, NOT THE OPERATOR CONSOLE/);
  assert.match(html, /■ REAL/);
  assert.match(html, /◇ SIMULATED/);
  const css = await (await fetch(`${listening.url}/styles.css`)).text();
  assert.match(css, /border: 8px dashed/);
  await close();
});

test("the page needs no inline script or style, and is sent with frame and content-security headers", async () => {
  const { listening, close } = await setup();
  const response = await fetch(`${listening.url}/`);
  const html = await response.text();
  assert.doesNotMatch(html, /<script(?![^>]*src=)/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(
    response.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  await close();
});

test("only the page's own files are served", async () => {
  const { listening, close } = await setup();
  for (const path of [
    "/package.json",
    "/serve.mjs",
    "/src/director.js",
    "/../package.json",
    "/test/helpers.mjs",
    "/%2e%2e/package.json",
  ])
    assert.equal((await fetch(`${listening.url}${path}`)).status, 404, path);
  for (const path of ["/app.js", "/view.js", "/styles.css"])
    assert.equal((await fetch(`${listening.url}${path}`)).status, 200, path);
  await close();
});

test("the state the page reads carries no agent code and no operator token", async () => {
  const { listening, close } = await setup();
  const text = await (await fetch(`${listening.url}/api/state`)).text();
  for (const secret of ["code-real-1111", "code-sim-2222", "operator-token"])
    assert.equal(text.includes(secret), false, secret);
  assert.equal(JSON.parse(text).steps.length, 7);
  await close();
});

test("an action needs the demo header, and a page from another site is refused", async () => {
  const { post, close, simulated } = await setup();
  assert.equal(
    (await post("/api/agents/AV-2/control", { command: "clear" }, {})).status,
    403,
  );
  assert.equal(
    (
      await post(
        "/api/agents/AV-2/control",
        { command: "clear" },
        { "x-demo-director": "1", origin: "http://evil.example" },
      )
    ).status,
    403,
  );
  assert.deepEqual(simulated.calls, []);
  assert.equal(
    (await post("/api/agents/AV-2/control", { command: "clear" })).status,
    200,
  );
  assert.deepEqual(simulated.calls, [{ command: "clear" }]);
  await close();
});

test("a scene change for the real bus is refused with its reason, and an oversized body is refused", async () => {
  const { post, close, real } = await setup();
  const refused = await post("/api/agents/AV-1/control", {
    command: "block",
    value: "on",
  });
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /REAL/);
  assert.deepEqual(real.calls, []);
  assert.equal(
    (await post("/api/request", { busId: "x".repeat(5000) })).status,
    413,
  );
  await close();
});

test("there is no route to set a ramp, to acknowledge for a bus, or to the agent local halt", async () => {
  const { post, close, real, simulated, backend } = await setup();
  for (const path of [
    "/api/ramp",
    "/api/ack",
    "/api/acknowledge",
    "/api/assist-ack",
    "/api/agents/AV-2/ack",
    "/api/agents/AV-2/ramp",
    "/api/agents/AV-2/state",
    "/api/vehicles/AV-2/assist-ack",
    "/api/simulator/command",
  ])
    assert.equal(
      (await post(path, { requestId: "R", state: "DEPLOYED" })).status,
      404,
      path,
    );
  assert.deepEqual([...real.calls, ...simulated.calls], []);
  assert.equal(
    backend.paths.some((path) => /assist-ack|simulator/.test(path)),
    false,
  );
  await close();
});

test("the page buttons work: a request, the bay grant and a halt reach the backend", async () => {
  const { post, close, backend } = await setup();
  assert.equal((await post("/api/request", { busId: "AV-2" })).status, 200);
  assert.equal((await post("/api/bay/proceed")).status, 200);
  assert.equal(
    (await post("/api/halt", { busId: "AV-2", halted: true })).status,
    200,
  );
  assert.ok(backend.paths.includes("POST /api/assistance/request"));
  assert.ok(backend.paths.includes("POST /api/operations/bays/18331/proceed"));
  assert.ok(
    backend.paths.includes("POST /api/operations/vehicles/AV-2/operator-halt"),
  );
  await close();
});
