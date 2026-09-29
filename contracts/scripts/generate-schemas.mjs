#!/usr/bin/env node
/**
 * Generates one JSON Schema per published type from contracts/src/index.ts.
 *
 *   node scripts/generate-schemas.mjs          write contracts/schema/*.schema.json
 *   node scripts/generate-schemas.mjs --check  fail if the files on disk are out of date
 *
 * Unknown fields are rejected (additionalProperties: false) so a misspelt or renamed
 * field fails validation in both languages instead of being silently ignored.
 */
import { createGenerator } from "ts-json-schema-generator";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_TYPES } from "./schema-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = join(root, "schema");

export function generateAll() {
  const result = {};
  for (const type of SCHEMA_TYPES) {
    const generator = createGenerator({
      path: join(root, "src", "index.ts"),
      tsconfig: join(root, "tsconfig.json"),
      type,
      expose: "export",
      topRef: false,
      additionalProperties: false,
      skipTypeCheck: false,
    });
    result[type] = `${JSON.stringify(generator.createSchema(type), null, 2)}\n`;
  }
  return result;
}

export function schemaPath(type) {
  return join(schemaDirectory, `${type}.schema.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schemas = generateAll();
  if (process.argv.includes("--check")) {
    const stale = Object.entries(schemas)
      .filter(
        ([type, text]) =>
          !existsSync(schemaPath(type)) ||
          readFileSync(schemaPath(type), "utf8") !== text,
      )
      .map(([type]) => type);
    if (stale.length > 0) {
      console.error(
        `Out of date: ${stale.join(", ")}. Run npm run schema --workspace @buspass/shared.`,
      );
      process.exit(1);
    }
    console.log(`${Object.keys(schemas).length} schemas are up to date.`);
  } else {
    mkdirSync(schemaDirectory, { recursive: true });
    for (const [type, text] of Object.entries(schemas)) {
      writeFileSync(schemaPath(type), text, "utf8");
    }
    console.log(`Wrote ${Object.keys(schemas).length} schemas.`);
  }
}
