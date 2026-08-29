import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const frontendPort = 8081;
const backendPort = 3000;
const frontendUrl = `http://localhost:${frontendPort}`;
const backendUrl = `http://localhost:${backendPort}`;
const arguments_ = new Set(process.argv.slice(2));
const healthOnly = arguments_.has("--health");
const appOnly = arguments_.has("--app");
const backendOnly = arguments_.has("--backend");
const manageFrontend = !backendOnly;
const manageBackend = !appOnly;
const children = [];
let shuttingDown = false;

if (appOnly && backendOnly) {
  throw new Error("Choose either --app or --backend, not both.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(600);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function fetchWithTimeout(url, responseType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return responseType === "json"
      ? await response.json()
      : await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyFrontend() {
  const html = await fetchWithTimeout(frontendUrl, "text");
  if (typeof html === "string" && html.includes("<title>SG GoAssist</title>")) {
    return "goassist";
  }
  return (await portIsOpen(frontendPort)) ? "occupied" : "available";
}

async function classifyBackend() {
  const health = await fetchWithTimeout(`${backendUrl}/health`, "json");
  if (
    health?.status === "ok" &&
    typeof health.connectedWebSocketClients === "number" &&
    typeof health.activeRequests === "number"
  ) {
    return "goassist";
  }
  return (await portIsOpen(backendPort)) ? "occupied" : "available";
}

function npmCommand(script, workspace) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        `npm.cmd run ${script} --workspace ${workspace}`,
      ],
    };
  }
  return {
    command: "npm",
    args: ["run", script, "--workspace", workspace],
  };
}

function startService(name, script, workspace, environment = {}) {
  const invocation = npmCommand(script, workspace);
  const child = spawn(invocation.command, invocation.args, {
    cwd: rootDir,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push({ name, child });
  child.once("error", (error) => {
    if (!shuttingDown) {
      console.error(`[dev] ${name} failed to start: ${error.message}`);
      void shutdown(1);
    }
  });
  child.once("exit", (code) => {
    if (!shuttingDown) {
      const exitCode = code ?? 1;
      const message = `[dev] ${name} stopped (exit ${exitCode}).`;
      if (exitCode === 0) console.log(message);
      else console.error(message);
      void shutdown(exitCode);
    }
  });
}

async function waitForExpectedServer(classify, name, url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await classify()) === "goassist") return;
    await delay(250);
  }
  throw new Error(`[dev] Timed out waiting for ${name} at ${url}.`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1_500),
  ]);
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all(children.map(({ child }) => stopChild(child)));
  process.exit(exitCode);
}

async function main() {
  const [frontendState, backendState] = await Promise.all([
    manageFrontend ? classifyFrontend() : Promise.resolve("skipped"),
    manageBackend ? classifyBackend() : Promise.resolve("skipped"),
  ]);

  if (healthOnly) {
    if (manageFrontend)
      console.log(`[dev] Frontend ${frontendState}: ${frontendUrl}`);
    if (manageBackend)
      console.log(`[dev] Backend ${backendState}: ${backendUrl}`);
    if (
      (manageFrontend && frontendState !== "goassist") ||
      (manageBackend && backendState !== "goassist")
    ) {
      process.exitCode = 1;
    }
    return;
  }

  if (manageFrontend && frontendState === "occupied") {
    throw new Error(
      `[dev] Port ${frontendPort} is occupied by a service that is not SG GoAssist. Stop that service or choose the canonical port for it; no fallback port was started.`,
    );
  }
  if (manageBackend && backendState === "occupied") {
    throw new Error(
      `[dev] Port ${backendPort} is occupied by a service that is not the SG GoAssist backend. Stop that service; no fallback port was started.`,
    );
  }

  if (manageFrontend && frontendState === "goassist") {
    console.log(`[dev] Reusing SG GoAssist frontend at ${frontendUrl}`);
  }
  if (manageBackend && backendState === "goassist") {
    console.log(`[dev] Reusing SG GoAssist backend at ${backendUrl}`);
  }

  if (manageFrontend && frontendState === "available") {
    console.log(`[dev] Starting SG GoAssist frontend at ${frontendUrl}`);
    startService("frontend", "dev:server", "@buspass/app", {
      BROWSER: "none",
    });
  }
  if (manageBackend && backendState === "available") {
    console.log(`[dev] Starting SG GoAssist backend at ${backendUrl}`);
    startService("backend", "dev:server", "@buspass/backend", {
      PORT: String(backendPort),
    });
  }

  await Promise.all([
    manageFrontend && frontendState === "available"
      ? waitForExpectedServer(classifyFrontend, "frontend", frontendUrl)
      : Promise.resolve(),
    manageBackend && backendState === "available"
      ? waitForExpectedServer(classifyBackend, "backend", backendUrl)
      : Promise.resolve(),
  ]);

  if (children.length === 0) {
    console.log(
      "[dev] All requested SG GoAssist servers are already running; nothing new was started.",
    );
    return;
  }

  console.log(`[dev] Ready. Frontend: ${frontendUrl} | Backend: ${backendUrl}`);
  console.log(
    "[dev] No browser was opened. Press Ctrl+C to stop only the servers started by this command.",
  );
  await new Promise(() => {});
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  void shutdown(1);
});
