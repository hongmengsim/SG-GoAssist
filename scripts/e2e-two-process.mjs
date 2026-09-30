#!/usr/bin/env node
/**
 * Runs the whole end-to-end scenario (scripts/e2e_scenario.py) against TWO real backend
 * processes that share Postgres, Redis and locks (decision 0005): the passenger and Bus 1 talk
 * to process A, the operator and Bus 2 to process B, so requests, pushes, halts, bay grants and
 * the audit trail all cross processes.
 *
 *   npm run build --workspace @buspass/backend
 *   npm install --no-save --workspace @buspass/backend ioredis pg
 *   GOASSIST_DATABASE_URL=postgres://user:PASSWORD@localhost:5432/dbname \
 *   GOASSIST_REDIS_URL=redis://localhost:6379 npm run e2e:scenario:two
 *
 * The scenario runs in a throwaway schema that is dropped afterwards. Secrets come from the
 * environment only.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.GOASSIST_DATABASE_URL;
const redisUrl = process.env.GOASSIST_REDIS_URL ?? "redis://localhost:6379";
if (!databaseUrl) {
  console.error("GOASSIST_DATABASE_URL is not set");
  process.exit(2);
}

const { Pool } = require("pg");
const schema = `e2e_${crypto.randomBytes(5).toString("hex")}`;
const admin = new Pool({ connectionString: databaseUrl, max: 1 });
await admin.query(`CREATE SCHEMA ${schema}`);
const joiner = databaseUrl.includes("?") ? "&" : "?";
const scoped = `${databaseUrl}${joiner}options=${encodeURIComponent(`-c search_path=${schema}`)}`;

const code = await new Promise((done) => {
  const child = spawn(
    "python",
    [join(root, "scripts", "e2e_scenario.py"), "--two-processes"],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        GOASSIST_DATABASE_URL: scoped,
        GOASSIST_ALLOW_INSECURE: "true",
        GOASSIST_EVENT_BUS: "redis",
        GOASSIST_REDIS_URL: redisUrl,
        GOASSIST_LOCKS: "database",
      },
    },
  );
  child.on("exit", (status) => done(status ?? 1));
});

await admin
  .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  .catch(() => undefined);
await admin.end().catch(() => undefined);
process.exit(code);
