import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkModules } from "./check-modules.mjs";

const GOOD_README = [
  "# m",
  "## Purpose",
  "## Interface",
  "## Run it alone",
  "## Test",
  "## Depends on",
  "",
].join("\n");

function makeRoot(files) {
  const root = mkdtempSync(join(tmpdir(), "check-modules-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function run(files, modules) {
  const root = makeRoot(files);
  try {
    return checkModules(root, { modules });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const jsModule = (extra = {}) => ({
  name: "a",
  path: "a",
  kind: "js",
  status: "active",
  packageName: "@x/a",
  readme: "strict",
  manifest: "package.json",
  verify: "npm test",
  allowedDependencies: [],
  ...extra,
});

test("a well-formed active module has no errors", () => {
  const result = run(
    {
      "a/README.md": GOOD_README,
      "a/package.json": "{}",
      "a/src/i.ts": "export const x = 1;\n",
    },
    [jsModule()],
  );
  assert.deepEqual(result.errors, []);
});

test("a missing README is an error", () => {
  const result = run({ "a/package.json": "{}" }, [jsModule()]);
  assert.match(result.errors.join("\n"), /README\.md is missing/);
});

test("a README missing a required heading is an error naming the heading", () => {
  const result = run(
    { "a/README.md": "# m\n## Purpose\n", "a/package.json": "{}" },
    [jsModule()],
  );
  assert.match(result.errors.join("\n"), /missing heading "## Interface"/);
});

test("an active module without a manifest or verify command is an error", () => {
  const noManifest = run({ "a/README.md": GOOD_README }, [jsModule()]);
  assert.match(
    noManifest.errors.join("\n"),
    /manifest package\.json is missing/,
  );
  const noVerify = run({ "a/README.md": GOOD_README, "a/package.json": "{}" }, [
    jsModule({ verify: "" }),
  ]);
  assert.match(noVerify.errors.join("\n"), /no verify command/);
});

test("a planned module needs a README but not a manifest or verify command", () => {
  const result = run({ "a/README.md": GOOD_README }, [
    jsModule({ status: "planned", manifest: undefined, verify: undefined }),
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.planned.length, 1);
});

test("a relative import that leaves the module is an error", () => {
  const result = run(
    {
      "a/README.md": GOOD_README,
      "a/package.json": "{}",
      "a/src/i.ts": 'import { y } from "../../b/src/y";\n',
    },
    [jsModule()],
  );
  assert.match(result.errors.join("\n"), /leaves the module/);
});

test("a relative import that stays inside the module is allowed", () => {
  const result = run(
    {
      "a/README.md": GOOD_README,
      "a/package.json": "{}",
      "a/src/i.ts":
        'import { y } from "./y";\nconst z = require("../lib/z");\n',
    },
    [jsModule()],
  );
  assert.deepEqual(result.errors, []);
});

test("importing another module's package is an error unless declared", () => {
  const files = {
    "a/README.md": GOOD_README,
    "a/package.json": "{}",
    "a/src/i.ts": 'import { t } from "@x/b";\n',
    "b/README.md": GOOD_README,
    "b/package.json": "{}",
  };
  const b = { name: "b", path: "b", packageName: "@x/b" };
  const denied = run(files, [jsModule(), jsModule(b)]);
  assert.match(
    denied.errors.join("\n"),
    /imports @x\/b but "b" is not in allowedDependencies/,
  );
  const allowed = run(files, [
    jsModule({ allowedDependencies: ["b"] }),
    jsModule(b),
  ]);
  assert.deepEqual(allowed.errors, []);
});

const pyModule = (extra = {}) => ({
  name: "p",
  path: "p",
  kind: "python",
  status: "active",
  pythonModules: ["p_core"],
  readme: "strict",
  manifest: "requirements.txt",
  verify: "python -m unittest",
  allowedDependencies: [],
  ...extra,
});

test("a python sys.path hack that reaches outside the module is an error", () => {
  const result = run(
    {
      "p/README.md": GOOD_README,
      "p/requirements.txt": "",
      "p/m.py": 'import sys\nsys.path.insert(0, "../other")\n',
    },
    [pyModule()],
  );
  assert.match(result.errors.join("\n"), /sys\.path/);
});

test("a python import of another module's package is an error unless declared", () => {
  const files = {
    "p/README.md": GOOD_README,
    "p/requirements.txt": "",
    "p/m.py": "from q_core import thing\n",
    "q/README.md": GOOD_README,
    "q/requirements.txt": "",
  };
  const q = { name: "q", path: "q", pythonModules: ["q_core"] };
  const denied = run(files, [pyModule(), pyModule(q)]);
  assert.match(
    denied.errors.join("\n"),
    /imports q_core but "q" is not in allowedDependencies/,
  );
  const allowed = run(files, [
    pyModule({ allowedDependencies: ["q"] }),
    pyModule(q),
  ]);
  assert.deepEqual(allowed.errors, []);
});

test("a module's own python modules may import each other", () => {
  const result = run(
    {
      "p/README.md": GOOD_README,
      "p/requirements.txt": "",
      "p/m.py": "from p_core import thing\n",
    },
    [pyModule()],
  );
  assert.deepEqual(result.errors, []);
});

test("a nonexistent module path is an error", () => {
  const result = run({}, [jsModule()]);
  assert.match(result.errors.join("\n"), /path a does not exist/);
});
