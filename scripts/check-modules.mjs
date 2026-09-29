#!/usr/bin/env node
/**
 * Verifies the "each part survives on its own" rules from
 * docs/decisions/0001-full-rename-and-modular-layout.md.
 *
 * For every module in scripts/modules.json:
 *  - its folder and README exist (strict READMEs need the five standard headings);
 *  - active modules have a manifest and a verify (test) command;
 *  - active modules do not reach into other modules: no relative import that
 *    leaves the module, no import of another module's package or python module
 *    unless it is listed in allowedDependencies, no python sys.path hacks that
 *    point outside the module.
 * Planned modules only need a README (they have no code yet).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_HEADINGS = [
  "## Purpose",
  "## Interface",
  "## Run it alone",
  "## Test",
  "## Depends on",
];

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".expo",
  ".runtime",
  "__pycache__",
  ".git",
]);
const JS_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IMPORT_SPECIFIER =
  /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*|\bimport\s+)["']([^"']+)["']/g;
const PY_IMPORT = /^\s*(?:from|import)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
const PY_SYS_PATH = /sys\.path\.(?:insert|append)\s*\(([^)]*)\)/g;

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function insideDirectory(candidate, directory) {
  const rel = relative(directory, candidate);
  return rel !== "" && !rel.startsWith("..") && !rel.includes(`..${sep}`);
}

function checkReadme(module, moduleRoot, errors) {
  const readme = join(moduleRoot, "README.md");
  if (!existsSync(readme)) {
    errors.push(`${module.name}: README.md is missing`);
    return;
  }
  if (module.readme !== "strict") return;
  const text = readFileSync(readme, "utf8");
  for (const heading of REQUIRED_HEADINGS) {
    const present = text.split(/\r?\n/).some((line) => line.trim() === heading);
    if (!present)
      errors.push(`${module.name}: README is missing heading "${heading}"`);
  }
}

function checkJsBoundaries(module, moduleRoot, byPackage, errors) {
  for (const file of walk(moduleRoot)) {
    if (!JS_FILE.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1];
      const where = relative(moduleRoot, file);
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (!insideDirectory(target, moduleRoot)) {
          errors.push(
            `${module.name}: ${where} imports "${specifier}", which leaves the module`,
          );
        }
        continue;
      }
      const owner =
        byPackage.get(specifier) ??
        byPackage.get(specifier.split("/").slice(0, 2).join("/"));
      if (
        owner &&
        owner.name !== module.name &&
        !module.allowedDependencies.includes(owner.name)
      ) {
        errors.push(
          `${module.name}: ${where} imports ${specifier} but "${owner.name}" is not in allowedDependencies`,
        );
      }
    }
  }
}

function checkPythonBoundaries(module, moduleRoot, byPythonModule, errors) {
  for (const file of walk(moduleRoot)) {
    if (!file.endsWith(".py")) continue;
    const source = readFileSync(file, "utf8");
    const where = relative(moduleRoot, file);
    for (const match of source.matchAll(PY_SYS_PATH)) {
      if (/\.\.|parent/.test(match[1])) {
        errors.push(
          `${module.name}: ${where} changes sys.path to reach outside the module (${match[0].trim()})`,
        );
      }
    }
    for (const match of source.matchAll(PY_IMPORT)) {
      const owner = byPythonModule.get(match[1]);
      if (
        owner &&
        owner.name !== module.name &&
        !module.allowedDependencies.includes(owner.name)
      ) {
        errors.push(
          `${module.name}: ${where} imports ${match[1]} but "${owner.name}" is not in allowedDependencies`,
        );
      }
    }
  }
}

function hasSourceCode(moduleRoot) {
  for (const file of walk(moduleRoot)) {
    if (JS_FILE.test(file) || file.endsWith(".py")) return true;
  }
  return false;
}

export function checkModules(root, registry) {
  const errors = [];
  const warnings = [];
  const planned = [];
  const active = [];
  const modules = registry.modules.map((module) => ({
    allowedDependencies: [],
    ...module,
  }));
  const byName = new Map(modules.map((module) => [module.name, module]));
  const byPackage = new Map(
    modules
      .filter((module) => module.packageName)
      .map((module) => [module.packageName, module]),
  );
  const byPythonModule = new Map();
  for (const module of modules) {
    for (const name of module.pythonModules ?? [])
      byPythonModule.set(name, module);
  }

  for (const module of modules) {
    for (const dependency of module.allowedDependencies) {
      if (!byName.has(dependency)) {
        errors.push(
          `${module.name}: allowedDependencies names unknown module "${dependency}"`,
        );
      }
    }
    const moduleRoot = join(root, module.path);
    if (!existsSync(moduleRoot)) {
      errors.push(`${module.name}: path ${module.path} does not exist`);
      continue;
    }
    checkReadme(module, moduleRoot, errors);

    if (module.status === "planned") {
      planned.push(module);
      if (hasSourceCode(moduleRoot)) {
        warnings.push(
          `${module.name}: has source code but is still marked planned`,
        );
      }
      continue;
    }
    active.push(module);
    if (module.manifest && !existsSync(join(moduleRoot, module.manifest))) {
      errors.push(`${module.name}: manifest ${module.manifest} is missing`);
    }
    if (!module.verify || !module.verify.trim()) {
      errors.push(`${module.name}: no verify command declared`);
    }
    if (module.kind === "js")
      checkJsBoundaries(module, moduleRoot, byPackage, errors);
    if (module.kind === "python")
      checkPythonBoundaries(module, moduleRoot, byPythonModule, errors);
  }
  return { errors, warnings, planned, active };
}

function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const root = resolve(scriptDirectory, "..");
  const registry = JSON.parse(
    readFileSync(join(scriptDirectory, "modules.json"), "utf8"),
  );
  const { errors, warnings, planned, active } = checkModules(root, registry);

  console.log(`Active modules (${active.length}):`);
  for (const module of active) {
    const where = module.verifyCwd ? ` (in ${module.verifyCwd})` : "";
    console.log(
      `  ${module.name.padEnd(18)} ${module.path.padEnd(28)} verify: ${module.verify}${where}`,
    );
  }
  console.log(
    `Planned modules (${planned.length}): ${planned.map((module) => module.name).join(", ") || "none"}`,
  );
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log("\nModule checks passed.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
