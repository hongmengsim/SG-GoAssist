import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

// GOASSIST_JOURNEY_BUS_ACK=1 turns off the backend's own acknowledgement timer and starts a bus
// that only acknowledges requests, to check that the app behaves the same when "Confirmed by
// bus" really comes from the bus (roadmap R2).
const busAcknowledges = process.env.GOASSIST_JOURNEY_BUS_ACK === "1";
const managerEnv = busAcknowledges
  ? { ...process.env, GOASSIST_AUTO_ACK: "off" }
  : process.env;

function node(script, env = process.env) {
  return spawn(process.execPath, [script], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
}

async function waitForServices() {
  const deadline = Date.now() + 70_000;
  while (Date.now() < deadline) {
    try {
      const [app, backend] = await Promise.all([
        fetch("http://localhost:8081/"),
        fetch("http://localhost:3000/health"),
      ]);
      const html = await app.text();
      const health = await backend.json();
      if (
        app.ok &&
        html.includes("<title>SG GoAssist</title>") &&
        backend.ok &&
        health.status === "ok"
      ) {
        return;
      }
    } catch {
      // The managed development services are still starting.
    }
    await delay(300);
  }
  throw new Error("Timed out waiting for the GoAssist development services.");
}

async function stopManager(manager) {
  if (manager.exitCode !== null || manager.signalCode !== null) return;
  manager.kill("SIGINT");
  await Promise.race([
    new Promise((resolveExit) => manager.once("exit", resolveExit)),
    delay(4_000),
  ]);
  if (manager.exitCode === null && manager.signalCode === null) {
    manager.kill("SIGTERM");
  }
}

const manager = node("scripts/dev.mjs", managerEnv);
let responder;
let exitCode = 1;
try {
  await waitForServices();
  if (busAcknowledges) {
    responder = spawn(
      "python",
      [
        "scripts/ack_responder.py",
        "--bus-id",
        "AV-095-01",
        "--backend",
        "http://localhost:3000",
      ],
      { cwd: root, env: process.env, stdio: "inherit", windowsHide: true },
    );
    await delay(1500);
  }
  const scenario = node("scripts/full-journey-assistant-smoke.mjs");
  exitCode = await new Promise((resolveExit) => {
    scenario.once("exit", (code) => resolveExit(code ?? 1));
    scenario.once("error", () => resolveExit(1));
  });
} finally {
  responder?.kill();
  await stopManager(manager);
}
process.exitCode = exitCode;
