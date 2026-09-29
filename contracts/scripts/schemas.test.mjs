import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { generateAll, schemaPath } from "./generate-schemas.mjs";
import { SCHEMA_TYPES } from "./schema-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ajv = new Ajv({ strict: false, allErrors: true });
const validators = new Map(
  SCHEMA_TYPES.map((type) => [
    type,
    ajv.compile(JSON.parse(readFileSync(schemaPath(type), "utf8"))),
  ]),
);

function fixtures(kind) {
  const directory = join(root, "fixtures", kind);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      type: name.split(".")[0],
      body: JSON.parse(readFileSync(join(directory, name), "utf8")),
    }));
}

test("the committed schemas match what the TypeScript types generate", () => {
  const generated = generateAll();
  for (const type of SCHEMA_TYPES) {
    assert.equal(
      readFileSync(schemaPath(type), "utf8"),
      generated[type],
      `${type} is out of date: run npm run schema --workspace @buspass/shared`,
    );
  }
});

test("every valid fixture passes its schema", () => {
  for (const { name, type, body } of fixtures("valid")) {
    const validate = validators.get(type);
    assert.ok(validate, `${name}: no schema for ${type}`);
    assert.ok(validate(body), `${name}: ${JSON.stringify(validate.errors)}`);
  }
});

test("every invalid fixture is rejected by its schema", () => {
  for (const { name, type, body } of fixtures("invalid")) {
    const validate = validators.get(type);
    assert.ok(validate, `${name}: no schema for ${type}`);
    assert.equal(validate(body), false, `${name} should have been rejected`);
  }
});

test("each published type has at least one valid and one invalid fixture", () => {
  const valid = new Set(fixtures("valid").map((item) => item.type));
  const invalid = new Set(fixtures("invalid").map((item) => item.type));
  for (const type of SCHEMA_TYPES) {
    assert.ok(valid.has(type), `${type} has no valid fixture`);
    assert.ok(invalid.has(type), `${type} has no invalid fixture`);
  }
});
