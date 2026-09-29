import test from "node:test";
import assert from "node:assert/strict";
import { buildSteps } from "./verify.mjs";

const modules = [
  { name: "a", status: "active", verify: "npm test --workspace a" },
  {
    name: "b",
    status: "active",
    verify: "python -m unittest",
    verifyCwd: "pi/b",
  },
  {
    name: "slow",
    status: "active",
    verify: "npm test --workspace slow",
    slow: true,
  },
  { name: "fw", status: "active", verify: "hardware only: flash it" },
  { name: "later", status: "planned", verify: "npm test --workspace later" },
  { name: "none", status: "active" },
];

test("repo-wide checks are always included", () => {
  const names = buildSteps(modules, { fast: false }).map((step) => step.name);
  for (const expected of [
    "typecheck (all workspaces)",
    "module boundaries",
    "module checker tests",
    "prettier",
  ]) {
    assert.ok(names.includes(expected), expected);
  }
});

test("each active module with a runnable verify command becomes a step", () => {
  const steps = buildSteps(modules, { fast: false });
  const names = steps.map((step) => step.name);
  assert.ok(names.includes("a tests"));
  assert.ok(names.includes("b tests"));
  assert.ok(names.includes("slow tests"));
});

test("hardware-only, planned and command-less modules are skipped", () => {
  const names = buildSteps(modules, { fast: false }).map((step) => step.name);
  assert.ok(!names.includes("fw tests"));
  assert.ok(!names.includes("later tests"));
  assert.ok(!names.includes("none tests"));
});

test("fast mode skips slow modules only", () => {
  const names = buildSteps(modules, { fast: true }).map((step) => step.name);
  assert.ok(!names.includes("slow tests"));
  assert.ok(names.includes("a tests"));
});

test("a module's verifyCwd is used as the working directory", () => {
  const step = buildSteps(modules, { fast: false }).find(
    (item) => item.name === "b tests",
  );
  assert.equal(step.cwd, "pi/b");
});

test("the end-to-end scenario runs in the full check and is skipped in fast mode", () => {
  const full = buildSteps(modules, { fast: false }).map((step) => step.name);
  const fast = buildSteps(modules, { fast: true }).map((step) => step.name);
  assert.ok(full.includes("end-to-end scenario"));
  assert.ok(!fast.includes("end-to-end scenario"));
});
