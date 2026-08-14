const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate test port"));
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

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
      shell: process.platform === "win32",
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
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const backend = spawn("node", ["packages/backend/dist/server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      ALLOWED_ORIGINS: `http://localhost:8081,${baseUrl}`,
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  try {
    await waitForHealth(baseUrl);
    await run("node", ["scripts/e2e-smoke.js"], {
      env: {
        ...process.env,
        API_BASE_URL: baseUrl,
      },
    });
  } finally {
    backend.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
