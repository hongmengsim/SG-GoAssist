import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

async function withServer(work) {
  const port = 5300 + Math.floor(Math.random() * 400);
  const child = spawn(process.execPath, ["serve.mjs", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "inherit"],
  });
  await once(child.stdout, "data");
  try {
    await work(port);
  } finally {
    child.kill();
  }
}

const get = (port, path) =>
  new Promise((resolve, reject) => {
    http
      .get({ port, path, host: "127.0.0.1" }, (response) => {
        response.resume();
        response.on("end", () => resolve(response));
      })
      .on("error", reject);
  });

test("pages are served with headers that stop framing and inline injection", async () => {
  await withServer(async (port) => {
    const response = await get(port, "/");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["referrer-policy"], "no-referrer");
  });
});

test("a malformed percent-escape is a 404, not a crashed server", async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, "/%E0%A4%A")).statusCode, 404);
    assert.equal((await get(port, "/")).statusCode, 200, "still running");
  });
});

test("a sibling folder that merely starts with the same name is not served", async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, "/src/../srcx/x.js")).statusCode, 404);
    assert.equal((await get(port, "/test/state.test.mjs")).statusCode, 404);
  });
});
