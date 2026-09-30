#!/usr/bin/env node
// Serves the console as static files (ES modules need http, not file://).
//   npm start --workspace ... or: node serve.mjs [--port 5173]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};
const portArgument = process.argv.indexOf("--port");
const port = portArgument > -1 ? Number(process.argv[portArgument + 1]) : 5173;

// One click on this page can halt a bus, so it must not be framed by another site, and nothing
// but its own scripts may run in it. It may talk to a backend on another origin (the page itself
// checks that address against an allow-list before sending the token there).
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self' http: https: ws: wss:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const notFound = (response) =>
  response.writeHead(404, SECURITY_HEADERS).end("Not found");

const server = createServer(async (request, response) => {
  let path;
  try {
    path = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
  } catch {
    return notFound(response); // a malformed escape must not crash the server
  }
  const target = normalize(join(root, path === "/" ? "index.html" : path));
  // Only the files the page itself needs: never tests, fixtures, or anything outside this folder.
  // The folder checks end in a separator so a sibling such as "srcx" does not pass as "src".
  const allowed =
    target === join(root, "index.html") ||
    target === join(root, "styles.css") ||
    target.startsWith(join(root, "src") + sep);
  if (!target.startsWith(root + sep) || !allowed) return notFound(response);
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    notFound(response);
  }
});

server.listen(port, "127.0.0.1", () =>
  console.log(`Operator console (mock mode): http://localhost:${port}/`),
);
