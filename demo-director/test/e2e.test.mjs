// The whole two-bus sequence, driven only through the demo director's own HTTP control path, against a
// real backend and two simulated bus agents started through their real command line. Nothing is faked
// except the sensors and the ramp, which are simulated by the agents themselves.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const backendEntry = join(root, "backend", "dist", "server.js");
const SECRET = "e2e-device-secret";
const TOKEN = "e2e-operator-token";
const BUS1 = "AV-095-01";
const BUS2 = "AV-095-02";
const STOP = "18331";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Starts a process and resolves with it once `ready` matches a line of its output. */
function start(command, args, options, ready, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(
      () =>
        reject(
          new Error(`${label} did not become ready.\n${output.slice(-1500)}`),
        ),
      40000,
    );
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(ready);
      if (match) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        // Keep draining so the child never blocks on a full pipe.
        child.stdout.resume();
        child.stderr.resume();
        resolve({ child, match, output: () => output });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      if (!output.match(ready)) {
        clearTimeout(timer);
        reject(
          new Error(`${label} exited early (${code}).\n${output.slice(-1500)}`),
        );
      }
    });
  });
}

async function waitFor(check, seconds, what) {
  const end = Date.now() + seconds * 1000;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) return last;
    await sleep(300);
  }
  throw new Error(`timed out after ${seconds}s waiting for: ${what}`);
}

test(
  "the two-bus sequence runs end to end through the demo director",
  {
    timeout: 240000,
    skip: existsSync(backendEntry)
      ? false
      : "build the backend first (npm run build --workspace @buspass/backend)",
  },
  async () => {
    const processes = [];
    const dataDirectory = mkdtempSync(join(tmpdir(), "demo-director-e2e-"));
    try {
      const backendPort = await freePort();
      const backendUrl = `http://127.0.0.1:${backendPort}`;
      const backend = await start(
        process.execPath,
        [backendEntry],
        {
          cwd: join(root, "backend"),
          env: {
            ...process.env,
            PORT: String(backendPort),
            GOASSIST_AUTO_ACK: "off",
            DEVICE_SHARED_SECRET: SECRET,
            OPERATOR_API_TOKEN: TOKEN,
            GOASSIST_RATE_LIMIT: "off",
            GOASSIST_DATA_DIR: dataDirectory,
            GOASSIST_DATABASE_URL: "",
            GOASSIST_EVENT_BUS: "memory",
            GOASSIST_LOCKS: "memory",
          },
        },
        /listening|running on|started/i,
        "the backend",
      );
      processes.push(backend.child);
      await waitFor(
        async () => (await fetch(`${backendUrl}/health`).catch(() => null))?.ok,
        20,
        "backend health",
      );

      const agents = [];
      for (const busId of [BUS1, BUS2]) {
        const port = await freePort();
        const agent = await start(
          "python",
          [
            "-m",
            "bus_agent",
            "--simulate",
            "--bus-id",
            busId,
            "--bus-service",
            "95",
            "--backend",
            backendUrl,
            "--status-port",
            String(port),
            "--deployment-timeout",
            "30",
            "--link-loss-halt",
            "10",
          ],
          {
            cwd: join(root, "pi", "bus-agent"),
            env: {
              ...process.env,
              DEVICE_SHARED_SECRET: SECRET,
              OPERATOR_API_TOKEN: TOKEN,
              PYTHONUNBUFFERED: "1",
            },
          },
          /Status page: http:\/\/localhost:(\d+)\/#([0-9a-f]+)/,
          `the agent for ${busId}`,
        );
        processes.push(agent.child);
        agents.push({
          busId,
          url: `http://127.0.0.1:${agent.match[1]}`,
          code: agent.match[2],
        });
      }

      const directorPort = await freePort();
      const director = await start(
        process.execPath,
        [join(here, "..", "serve.mjs")],
        {
          cwd: join(here, ".."),
          env: {
            ...process.env,
            DEMO_DIRECTOR: "on",
            DEMO_AGENTS: JSON.stringify(agents),
            DEMO_BACKEND_URL: backendUrl,
            OPERATOR_API_TOKEN: TOKEN,
            DEMO_STOP: STOP,
            DEMO_PORT: String(directorPort),
            DEMO_POLL_MS: "500",
          },
        },
        /DEMO CONTROL \(not the operator console\)/,
        "the demo director",
      );
      processes.push(director.child);
      const base = `http://127.0.0.1:${directorPort}`;
      const state = async () => (await fetch(`${base}/api/state`)).json();
      const press = (path, body = {}) =>
        fetch(`${base}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-demo-director": "1",
          },
          body: JSON.stringify(body),
        });

      // Both simulated agents are reachable and labelled SIMULATED.
      await waitFor(
        async () => {
          const current = await state();
          return (
            current.order.length === 2 &&
            current.order.every(
              (id) =>
                current.buses[id].agentOk &&
                current.buses[id].kind === "SIMULATED",
            )
          );
        },
        40,
        "both agents to be reachable and simulated",
      );

      // The sequence, step by step, only through the director.
      for (let step = 1; step <= 7; step += 1) {
        const before = (await state()).steps[step - 1];
        if (before.hasAction) {
          const response = await press(`/api/sequence/${step}/act`);
          assert.equal(
            response.status,
            200,
            `step ${step} action: ${await response.text()}`,
          );
        }
        await waitFor(
          async () => (await state()).steps[step - 1].done,
          60,
          `step ${step} (${before.title})`,
        );
      }

      // The backend's own record agrees with the director's view.
      const operator = { headers: { Authorization: `Bearer ${TOKEN}` } };
      const bay = await (
        await fetch(`${backendUrl}/api/operations/bays/${STOP}`, operator)
      ).json();
      assert.equal(bay.occupantBusId, BUS2);
      const audit = (
        await (
          await fetch(`${backendUrl}/api/operations/audit?limit=200`, operator)
        ).json()
      ).events;
      const acknowledgements = audit.filter(
        (event) => event.eventType === "REQUEST_ACKNOWLEDGED",
      );
      assert.ok(acknowledgements.length >= 1, "the request was acknowledged");
      assert.deepEqual(
        [...new Set(acknowledgements.map((event) => event.actor))],
        ["VEHICLE"],
        "only a bus acknowledged anything; neither the director nor the backend did",
      );

      // A simulated state injected through the director shows up in the bus's own gate.
      assert.equal(
        (
          await press(`/api/agents/${BUS2}/control`, {
            command: "place",
            value: "person",
          })
        ).status,
        200,
      );
      await waitFor(
        async () => {
          const reasons =
            (await state()).buses[BUS2].agent?.decision?.reasons ?? [];
          return reasons.some((reason) => reason.code === "OBJECT_IN_ZONE");
        },
        20,
        "the gate to halt on the person in the zone",
      );

      // Cutting a simulated bus's backend link makes its own link-loss halt fire; restoring it clears it.
      await press(`/api/agents/${BUS2}/control`, { command: "clear" });
      assert.equal(
        (
          await press(`/api/agents/${BUS2}/control`, {
            command: "link",
            value: "off",
          })
        ).status,
        200,
      );
      await waitFor(
        async () => {
          const reasons =
            (await state()).buses[BUS2].agent?.decision?.reasons ?? [];
          return reasons.some((reason) => reason.code === "BACKEND_LINK_LOST");
        },
        45,
        "the link-loss halt after the link was cut",
      );
      assert.equal(
        (
          await press(`/api/agents/${BUS2}/control`, {
            command: "link",
            value: "on",
          })
        ).status,
        200,
      );
      await waitFor(
        async () => {
          const reasons =
            (await state()).buses[BUS2].agent?.decision?.reasons ?? [];
          return !reasons.some((reason) => reason.code === "BACKEND_LINK_LOST");
        },
        45,
        "the link-loss halt to clear once the link is back",
      );

      // The timeline recorded the presenter's actions and the system's reactions, with their sources.
      const timeline = (await state()).timeline;
      assert.ok(
        timeline.some((entry) => entry.source.startsWith("DEMO ACTION")),
        "the presenter's actions are on the timeline",
      );
      assert.ok(
        timeline.some((entry) => /^BUS 2 · SIMULATED/.test(entry.source)),
        "the bus's own changes are on the timeline",
      );
    } finally {
      for (const child of processes) child.kill();
      await sleep(500);
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  },
);
