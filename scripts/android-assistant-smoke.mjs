import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const packageName = process.env.GOASSIST_ANDROID_PACKAGE ?? "sg.goassist.passenger";
const prefix = "GOASSIST_ASSISTANT_E2E_RESULT:";
const timeoutMs = Number(process.env.GOASSIST_ANDROID_SMOKE_TIMEOUT_MS ?? 120_000);
const adb = resolveAdb();

function resolveAdb() {
  if (process.env.ADB_PATH) return process.env.ADB_PATH;
  const sdk = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME;
  if (sdk) {
    const candidate = join(
      sdk,
      "platform-tools",
      process.platform === "win32" ? "adb.exe" : "adb",
    );
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "adb.exe" : "adb";
}

function run(arguments_, { allowFailure = false } = {}) {
  const result = spawnSync(adb, arguments_, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(
      result.error?.message || result.stderr || result.stdout || "adb failed",
    );
  }
  return result;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const state = run(["get-state"], { allowFailure: true });
if (state.status !== 0 || !state.stdout.includes("device")) {
  throw new Error(
    "No connected Android device is available. Connect an ARM64 GoAssist development device and retry.",
  );
}
const architecture = run(["shell", "getprop", "ro.product.cpu.abi"]).stdout.trim();
assert.match(architecture, /arm64-v8a/i, `Expected ARM64, received ${architecture}`);
const installed = run(
  ["shell", "pm", "path", packageName],
  { allowFailure: true },
);
if (installed.status !== 0 || !installed.stdout.includes("package:")) {
  throw new Error(`The GoAssist development build (${packageName}) is not installed.`);
}

run(["logcat", "-c"], { allowFailure: true });
run([
  "shell",
  "am",
  "start",
  "-W",
  "-a",
  "android.intent.action.VIEW",
  "-d",
  "buspass://assistant-e2e",
  packageName,
]);

const deadline = Date.now() + timeoutMs;
let payload;
while (Date.now() < deadline) {
  const logs = run(["logcat", "-d", "-v", "brief"], {
    allowFailure: true,
  }).stdout;
  const line = logs
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.includes(prefix));
  if (line) {
    const jsonStart = line.indexOf("{", line.indexOf(prefix));
    const jsonEnd = line.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      payload = JSON.parse(line.slice(jsonStart, jsonEnd + 1));
      break;
    }
  }
  await delay(1_500);
}
if (!payload) throw new Error("Timed out waiting for the Android assistant result.");
assert.equal(payload.ok, true, payload.error ?? "Android assistant smoke failed");
assert.equal(payload.runtime, "AI_READY");
assert.equal(payload.checksumVerified, true);
assert.equal(payload.resolutionKind, "ANSWER");
assert.equal(payload.provider, "AI");
assert.deepEqual(payload.evidenceIds, ["journey-stages:en-SG"]);
assert.equal(payload.renderedWordingMatchesArticle, true);
assert.equal(payload.inferenceNetworkRequests, 0);
console.log(JSON.stringify({ ...payload, architecture }, null, 2));
