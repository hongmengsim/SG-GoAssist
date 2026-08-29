const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";

async function waitForHealth(baseUrl, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for backend health at ${baseUrl}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  await waitForHealth(baseUrl);
  await run("node", ["scripts/e2e-smoke.js"], {
    env: {
      ...process.env,
      API_BASE_URL: baseUrl,
    },
  });
}

main().catch((error) => {
  if (String(error?.message).includes("Timed out waiting")) {
    console.error(
      `The SG GoAssist backend is not available at ${baseUrl}. Run npm run dev once, then retry the E2E check.`,
    );
  }
  console.error(error);
  process.exit(1);
});
