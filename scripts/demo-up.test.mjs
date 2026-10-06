// Tests for the demonstration launcher (docs/runbooks/hardware-bringup-tools/demo-up.ps1 and demo-down.ps1).
// The dry-run tests start nothing. The full headless run is slow and uses the real ports, so it only runs
// when DEMO_UP_LIVE=1 (for example: set DEMO_UP_LIVE=1 and run this file).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tools = join(root, "docs", "runbooks", "hardware-bringup-tools");
const isWindows = process.platform === "win32";

function powershell(file, args = [], timeout = 60_000) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(tools, file),
      ...args,
    ],
    { cwd: root, encoding: "utf8", timeout },
  );
  return { ...result, text: `${result.stdout}${result.stderr}` };
}

test(
  "the dry run for a real Bus 1 lists the tunnel, the Pi command and no secret",
  { skip: !isWindows },
  () => {
    const run = powershell("demo-up.ps1", ["-DryRun"]);
    assert.equal(run.status, 0, run.text);
    for (const title of [
      "BACKEND",
      "CONSOLE SERVER",
      "BUS 2",
      "TUNNEL",
      "DIRECTOR",
    ]) {
      assert.match(run.text, new RegExp(`Tab: ${title}`));
    }
    assert.doesNotMatch(run.text, /Tab: BUS 1/);
    assert.match(run.text, /read -rs L/);
    assert.match(run.text, /--real --config agent\.json --backend http:\/\//);
    assert.match(run.text, /--demo-movement/);
    assert.match(run.text, /8770/);
    assert.match(run.text, /8780/);
    // the secrets and the codes are 64 hex characters; only the 8-character fingerprint may be shown
    assert.doesNotMatch(run.text, /[0-9a-f]{32}/);
    assert.match(
      run.text,
      /fingerprint \(for comparing with the Pi\): [0-9a-f]{8}\b/,
    );
  },
);

test(
  "the dry run for the fallback has a simulated Bus 1 and no tunnel and no Pi command",
  { skip: !isWindows },
  () => {
    const run = powershell("demo-up.ps1", ["-DryRun", "-SimulateBus1"]);
    assert.equal(run.status, 0, run.text);
    assert.match(run.text, /Tab: BUS 1 \(SIMULATED fallback\)/);
    assert.match(
      run.text,
      /--simulate --bus-id AV-095-01 .*--status-port 8782/,
    );
    assert.doesNotMatch(run.text, /Tab: TUNNEL/);
    assert.doesNotMatch(run.text, /read -rs L/);
    assert.doesNotMatch(run.text, /[0-9a-f]{32}/);
  },
);

test(
  "every simulated agent is given the link-loss and timeout options the demonstration needs",
  { skip: !isWindows },
  () => {
    const run = powershell("demo-up.ps1", ["-DryRun", "-SimulateBus1"]);
    const lines = run.text
      .split(/\r?\n/)
      .filter((line) => line.includes("--simulate"));
    assert.equal(lines.length, 2);
    for (const line of lines) {
      assert.match(line, /--deployment-timeout 30/);
      assert.match(line, /--link-loss-halt 10/);
    }
  },
);

test(
  "the down script lists the demonstration ports and a dry run stops nothing",
  { skip: !isWindows },
  () => {
    const run = powershell("demo-down.ps1", ["-DryRun"]);
    assert.equal(run.status, 0, run.text);
    assert.match(
      run.text,
      /Nothing is listening|Dry run: would stop process ids/,
    );
  },
);

test(
  "the whole simulated flow comes up headless: both buses reachable, only simulated, scene control",
  { skip: !isWindows || process.env.DEMO_UP_LIVE !== "1", timeout: 240_000 },
  () => {
    const run = powershell(
      "demo-up.ps1",
      ["-SimulateBus1", "-Headless"],
      230_000,
    );
    const pids = (run.text.match(/HEADLESS PIDS: ([\d,]+)/)?.[1] ?? "")
      .split(",")
      .filter(Boolean);
    try {
      assert.equal(run.status, 0, run.text);
      assert.match(run.text, /SECRETS MATCH the running backend/);
      assert.match(run.text, /BUS 1\s+SIMULATED\s+scene\s+True/);
      assert.match(run.text, /BUS 2\s+SIMULATED\s+scene\s+True/);
      assert.match(run.text, /READY/);
      assert.doesNotMatch(run.text, /[0-9a-f]{32}/);
    } finally {
      for (const pid of pids) spawnSync("taskkill", ["/T", "/F", "/PID", pid]);
      powershell("demo-down.ps1", ["-Yes"]);
    }
  },
);
