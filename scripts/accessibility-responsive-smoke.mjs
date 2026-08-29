import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appUrl = process.env.GOASSIST_APP_URL ?? "http://localhost:8081";
const debugPort = Number(process.env.GOASSIST_ACCESSIBILITY_CDP_PORT ?? 9334);
const edgePath =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const widths = [280, 320, 360, 390, 430];
const textSizes = [
  { label: "Standard", value: "STANDARD" },
  { label: "Large", value: "LARGE" },
  { label: "Extra large", value: "EXTRA_LARGE" },
];
const profileDir = await mkdtemp(
  join(tmpdir(), "goassist-accessibility-smoke-"),
);
const browser = spawn(
  edgePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-crash-reporter",
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);
const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function debugTarget() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(
        `http://127.0.0.1:${debugPort}/json/list`,
      ).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Edge has not opened its debug socket yet.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for Edge.");
}

function clientFor(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        id += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed.");
  return result.result.value;
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function clickLabel(client, label, prefix = false) {
  const clicked = await evaluate(
    client,
    `(() => {
      const label = ${JSON.stringify(label)};
      const element = [...document.querySelectorAll("[aria-label]")].find((candidate) =>
        ${prefix ? "candidate.getAttribute('aria-label')?.startsWith(label)" : "candidate.getAttribute('aria-label') === label"}
      );
      if (!element) return false;
      element.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find ${label}.`);
  await delay(200);
}

async function removeProfileDirectory() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Could not remove temporary Edge profile: ${error}`);
        return;
      }
      await delay(250 * (attempt + 1));
    }
  }
}

let client;
try {
  const target = await debugTarget();
  client = clientFor(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: appUrl });
  await waitFor(
    client,
    `document.body.innerText.includes("Find your bus")`,
    "app",
  );
  await clickLabel(client, "Profile, tab", true);
  await clickLabel(client, "Sign in as Visual Guidance Profile", true);
  await waitFor(
    client,
    `document.body.innerText.includes("My profile")`,
    "profile",
  );
  await clickLabel(client, "Edit accessibility preferences");
  await clickLabel(client, "Vision accessibility settings");

  const results = [];
  for (const textSize of textSizes) {
    await clickLabel(client, `${textSize.label} text`);
    await clickLabel(client, "Back to accessibility");
    for (const width of widths) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: 844,
      });
      await delay(250);
      const metrics = await evaluate(
        client,
        `(() => {
          const targets = [...document.querySelectorAll('[aria-label^="Apply "], [aria-label$="accessibility settings"]')];
          const rectangles = targets.map((target) => target.getBoundingClientRect());
          return {
            categoryCount: document.querySelectorAll('[aria-label$="accessibility settings"]').length,
            presetCount: document.querySelectorAll('[aria-label^="Apply "]').length,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            offscreenTargets: rectangles.filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1).length,
            minimumTargetHeight: rectangles.length ? Math.min(...rectangles.map((rect) => rect.height)) : 0,
          };
        })()`,
      );
      const result = { textSize: textSize.value, width, ...metrics };
      results.push(result);
      if (
        result.horizontalOverflow ||
        result.offscreenTargets > 0 ||
        result.minimumTargetHeight < 44 ||
        result.categoryCount !== 5 ||
        result.presetCount !== 4
      ) {
        throw new Error(
          `Accessibility layout regression: ${JSON.stringify(result)}`,
        );
      }
    }
    if (textSize !== textSizes.at(-1)) {
      await clickLabel(client, "Vision accessibility settings");
    }
  }
  await clickLabel(client, "Apply Wheelchair preset");
  await clickLabel(client, "Apply Simplified journey preset");
  await clickLabel(client, "Interaction accessibility settings");
  await clickLabel(client, "Larger controls");
  await clickLabel(client, "Reduced motion");
  await clickLabel(client, "Back to accessibility");
  for (const width of widths) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: 844,
    });
    await delay(250);
    const metrics = await evaluate(
      client,
      `(() => {
        const targets = [...document.querySelectorAll('[aria-label^="Apply "], [aria-label$="accessibility settings"]')];
        const rectangles = targets.map((target) => target.getBoundingClientRect());
        return {
          categoryCount: document.querySelectorAll('[aria-label$="accessibility settings"]').length,
          presetCount: document.querySelectorAll('[aria-label^="Apply "]').length,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          offscreenTargets: rectangles.filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1).length,
          minimumTargetHeight: rectangles.length ? Math.min(...rectangles.map((rect) => rect.height)) : 0,
        };
      })()`,
    );
    const result = { textSize: "DEMANDING_COMBINATION", width, ...metrics };
    results.push(result);
    if (
      result.horizontalOverflow ||
      result.offscreenTargets > 0 ||
      result.minimumTargetHeight < 60 ||
      result.categoryCount !== 5 ||
      result.presetCount !== 4
    ) {
      throw new Error(
        `Demanding accessibility layout regression: ${JSON.stringify(result)}`,
      );
    }
  }
  console.log(JSON.stringify({ checked: results.length, results }, null, 2));
} finally {
  client?.close();
  browser.kill();
  await delay(350);
  await removeProfileDirectory();
}
