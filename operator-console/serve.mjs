#!/usr/bin/env node
// Serves the console as static files (ES modules need http, not file://).
//   npm start --workspace ... or: node serve.mjs [--port 5173]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
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

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(
    new URL(request.url ?? "/", "http://localhost").pathname,
  );
  const target = normalize(join(root, path === "/" ? "index.html" : path));
  // Only the files the page itself needs: never tests, fixtures, or anything outside this folder.
  const allowed =
    target === join(root, "index.html") ||
    target === join(root, "styles.css") ||
    target.startsWith(join(root, "src"));
  if (!target.startsWith(root) || !allowed) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": TYPES[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () =>
  console.log(`Operator console (mock mode): http://localhost:${port}/`),
);
