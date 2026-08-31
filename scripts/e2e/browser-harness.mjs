import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function createBrowserHarness({
  appUrl,
  debugPort,
  width = 441,
  height = 844,
  geolocation,
  preloadSource = "",
}) {
  const executable =
    process.env.EDGE_PATH ??
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const profileDirectory = await mkdtemp(
    join(tmpdir(), "goassist-journey-assistant-"),
  );
  const browser = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      `--remote-debugging-port=${debugPort}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  let client;
  try {
    const target = await waitForDebugTarget(debugPort);
    client = createDebugClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Browser.grantPermissions", {
      origin: new URL(appUrl).origin,
      permissions: ["geolocation"],
    });
    if (geolocation) {
      await client.send("Emulation.setGeolocationOverride", geolocation);
    }
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    });
    await client.send("Storage.clearDataForOrigin", {
      origin: new URL(appUrl).origin,
      storageTypes: "all",
    });
    if (preloadSource) {
      await client.send("Page.addScriptToEvaluateOnNewDocument", {
        source: preloadSource,
      });
    }
    await client.send("Page.navigate", { url: appUrl });
  } catch (error) {
    client?.close();
    browser.kill();
    await removeDirectory(profileDirectory);
    throw error;
  }

  async function evaluate(expression) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Browser evaluation failed.",
      );
    }
    return result.result.value;
  }

  async function waitFor(expression, label, timeoutMs = 25_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await delay(120);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  }

  async function clickLabel(label, { contains = false, last = false } = {}) {
    const clicked = await evaluate(`(() => {
      const label = ${JSON.stringify(label)};
      const candidates = [...document.querySelectorAll("[aria-label]")].filter(
        (element) => ${
          contains
            ? "element.getAttribute('aria-label')?.includes(label)"
            : "element.getAttribute('aria-label') === label"
        },
      );
      const element = ${last ? "candidates.at(-1)" : "candidates[0]"};
      if (!element) return false;
      element.scrollIntoView({ block: "center" });
      element.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Could not find control: ${label}`);
    await delay(180);
  }

  async function fillLabel(label, value) {
    const filled = await evaluate(`(() => {
      const element = [...document.querySelectorAll("[aria-label]")].find(
        (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)},
      );
      if (!element) return false;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    if (!filled) throw new Error(`Could not find input: ${label}`);
    await delay(100);
  }

  async function setGeolocation(next) {
    await client.send("Emulation.setGeolocationOverride", next);
    await evaluate(`dispatchEvent(new CustomEvent("goassist:e2e-location", {
      detail: ${JSON.stringify(next)},
    }))`);
  }

  async function captureFailureArtifacts(
    outputDirectory,
    prefix = "failure",
    extra = {},
  ) {
    await mkdir(outputDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const basePath = join(outputDirectory, `${prefix}-${timestamp}`);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(`${basePath}.png`, Buffer.from(screenshot.data, "base64"));
    const diagnostics = await evaluate(`({
      url: location.href,
      text: document.body?.innerText ?? "",
      labels: [...document.querySelectorAll("[aria-label]")]
        .map((element) => element.getAttribute("aria-label"))
        .filter(Boolean),
      errors: window.__goassistE2EErrors ?? [],
      api: window.__goassistE2EApi ?? [],
      sockets: window.__goassistE2ESockets ?? [],
      assistantCalls: window.__GOASSIST_E2E_ASSISTANT__?.calls ?? [],
      localStorageKeys: Object.keys(localStorage),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      extra: ${JSON.stringify(extra)},
    })`);
    await writeFile(
      `${basePath}.json`,
      JSON.stringify(diagnostics, null, 2),
      "utf8",
    );
    return { screenshot: `${basePath}.png`, diagnostics: `${basePath}.json` };
  }

  async function close() {
    client.close();
    browser.kill();
    await delay(350);
    await removeDirectory(profileDirectory);
  }

  return {
    client,
    evaluate,
    waitFor,
    clickLabel,
    fillLabel,
    setGeolocation,
    captureFailureArtifacts,
    close,
  };
}

async function waitForDebugTarget(debugPort) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(
        `http://127.0.0.1:${debugPort}/json/list`,
      ).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Browser is still starting.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for the headless browser.");
}

function createDebugClient(webSocketDebuggerUrl) {
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

async function removeDirectory(path) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`Could not remove temporary browser data: ${error}`);
        return;
      }
      await delay(200 * (attempt + 1));
    }
  }
}

export function artifactDirectory(importMetaUrl) {
  return join(dirname(fileURLToPath(importMetaUrl)), "../artifacts/e2e");
}
