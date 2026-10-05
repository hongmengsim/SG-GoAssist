// The director's own web server: the page, its API, and nothing else. Only the page's own files are served,
// and every action needs a header a cross-site page cannot send, so another website cannot press the
// buttons through the presenter's browser.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DirectorError } from "./director.js";

const here = dirname(fileURLToPath(import.meta.url));
const UI = join(here, "..", "ui");
const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/view.js": ["view.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
const MAX_BODY = 2048;
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function send(response, status, body, type = "application/json") {
  response.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type });
  response.end(
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body),
  );
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new DirectorError(413, "Request too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DirectorError(400, "Invalid JSON");
  }
}

export function createDirectorServer({ director }) {
  async function route(request, response) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (request.method === "GET") {
      if (FILES[path]) {
        const [name, type] = FILES[path];
        return send(response, 200, await readFile(join(UI, name)), type);
      }
      if (path === "/api/state")
        return send(response, 200, director.snapshot());
      return send(response, 404, { error: "Not found" });
    }
    if (request.method !== "POST")
      return send(response, 405, { error: "Method not allowed" });

    // A page on another website cannot send this header, nor claim this origin.
    if (request.headers["x-demo-director"] !== "1")
      return send(response, 403, { error: "Missing the demo director header" });
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}`)
      return send(response, 403, {
        error: "Cross-origin requests are refused",
      });

    const body = await readJson(request);
    let match;
    if ((match = path.match(/^\/api\/agents\/([^/]+)\/control$/)))
      return send(
        response,
        200,
        await director.control(decodeURIComponent(match[1]), body),
      );
    if (path === "/api/request")
      return send(
        response,
        200,
        await director.createRequest(String(body.busId)),
      );
    if (path === "/api/bay/proceed")
      return send(response, 200, await director.proceed());
    if (path === "/api/halt")
      return send(
        response,
        200,
        await director.halt(String(body.busId), body.halted === true),
      );
    if (path === "/api/cancel")
      return send(response, 200, await director.cancel(String(body.busId)));
    if (path === "/api/sequence/reset") {
      director.resetSequence();
      return send(response, 200, { reset: true });
    }
    if ((match = path.match(/^\/api\/sequence\/(\d+)\/act$/)))
      return send(response, 200, await director.runStep(Number(match[1])));
    return send(response, 404, { error: "Not found" });
  }

  return createServer((request, response) => {
    route(request, response).catch((error) => {
      if (error instanceof DirectorError)
        return send(response, error.status, { error: error.message });
      if (error?.code === "ENOENT")
        return send(response, 404, { error: "Not found" });
      console.error(
        "demo director error:",
        error instanceof Error ? error.message : error,
      );
      send(response, 500, { error: "Internal error" });
    });
  });
}
