#!/usr/bin/env node
/**
 * One command that runs every check the project relies on and prints a plain-text summary.
 *
 *   npm run verify        everything, including the slow passenger-app suite
 *   npm run verify:fast   skips modules marked "slow" in scripts/modules.json
 *
 * Steps come from the module registry (each active module's verify command, run in its
 * verifyCwd when set) plus the repo-wide checks. New modules are picked up automatically.
 * Results are written as PASS or FAIL, never as colour, so they read the same for everyone.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const registry = JSON.parse(
  readFileSync(join(scriptDirectory, "modules.json"), "utf8"),
);
const fast = process.argv.includes("--fast");

export function buildSteps(modules, { fast: skipSlow }) {
  const steps = [
    {
      name: "typecheck (all workspaces)",
      command: "npm run typecheck",
      cwd: ".",
    },
    { name: "module boundaries", command: "npm run check:modules", cwd: "." },
    { name: "module checker tests", command: "npm run test:modules", cwd: "." },
    { name: "prettier", command: "npm run format:check", cwd: "." },
  ];
  for (const module of modules) {
    if (module.status !== "active") continue;
    if (!module.verify || module.verify.startsWith("hardware")) continue;
    if (skipSlow && module.slow) continue;
    steps.push({
      name: `${module.name} tests`,
      command: module.verify,
      cwd: module.verifyCwd ?? ".",
    });
  }
  if (!skipSlow) {
    // Needs the backend built (the typecheck step above builds the contracts, not the backend).
    steps.push({
      name: "end-to-end scenario",
      command:
        "npm run build --workspace @buspass/backend && python scripts/e2e_scenario.py",
      cwd: ".",
    });
  }
  return steps;
}

function run(step) {
  const started = Date.now();
  const result = spawnSync(step.command, {
    cwd: join(root, step.cwd),
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ...step, ok: result.status === 0, seconds, output };
}

function main() {
  const steps = buildSteps(registry.modules, { fast });
  console.log(
    `Running ${steps.length} checks${fast ? " (fast: slow suites skipped)" : ""}.\n`,
  );
  const results = [];
  for (const step of steps) {
    process.stdout.write(`  ${step.name} ... `);
    const result = run(step);
    results.push(result);
    console.log(`${result.ok ? "PASS" : "FAIL"} (${result.seconds}s)`);
  }
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length} of ${results.length} checks passed.`,
  );
  for (const result of failed) {
    console.log(`\n--- ${result.name}: last lines of output ---`);
    console.log(result.output.trim().split(/\r?\n/).slice(-25).join("\n"));
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
