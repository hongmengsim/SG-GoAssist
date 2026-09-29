import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_URL = process.env.GOASSIST_APP_URL ?? "http://localhost:8081";
const DEBUG_PORT = Number(process.env.GOASSIST_FOCUSED_CDP_PORT ?? 9337);
const EDGE_PATH =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WIDTHS = [280, 320, 360, 390, 430, 441, 526];
const HEIGHT = 844;
const profileDir = await mkdtemp(join(tmpdir(), "goassist-focused-smoke-"));
const browser = spawn(
  EDGE_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-crash-reporter",
    `--remote-debugging-port=${DEBUG_PORT}`,
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
        `http://127.0.0.1:${DEBUG_PORT}/json/list`,
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
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.text ?? "Browser evaluation failed.",
    );
  }
  return result.result.value;
}

async function waitFor(client, expression, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(120);
  }
  const diagnosis = await evaluate(
    client,
    `({
      text: document.body?.innerText?.slice(0, 3500) ?? "",
      labels: [...document.querySelectorAll("[aria-label]")]
        .map((element) => element.getAttribute("aria-label"))
        .filter(Boolean).slice(-50),
      requests: window.__goassistFocusedRequests ?? [],
      errors: window.__goassistFocusedErrors ?? [],
      url: location.href,
    })`,
  );
  throw new Error(
    `Timed out waiting for ${label}.\n${JSON.stringify(diagnosis, null, 2)}`,
  );
}

async function clickLabel(client, label, prefix = false) {
  const clicked = await evaluate(
    client,
    `(() => {
      const label = ${JSON.stringify(label)};
      const element = [...document.querySelectorAll("[aria-label]")].find(
        (candidate) => ${
          prefix
            ? "candidate.getAttribute('aria-label')?.startsWith(label)"
            : "candidate.getAttribute('aria-label') === label"
        },
      );
      if (!element) return false;
      element.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find ${label}.`);
  await delay(180);
}

async function openFocusedAssist(client) {
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("We can't identify your bus stop yet.") ||
      document.body?.innerText.includes("BUS AT YOUR STOP") ||
      document.body?.innerText.includes("Which bus do you need?")`,
    "Focused Assist",
  );
  if (
    await evaluate(
      client,
      `Boolean(document.querySelector('[aria-label="Use my location"]'))`,
    )
  ) {
    await clickLabel(client, "Use my location");
  }
}

async function startOnboardJourney(client) {
  await clickLabel(client, "Journey, tab", true);
  await clickLabel(client, "Use my location");
  await waitFor(
    client,
    `Boolean(
      document.querySelector('[aria-label="Show nearby bus stops in this area"]') ||
      document.querySelector('[aria-label="Select bus stop manually"]')
    )`,
    "Journey stop controls",
  );
  const nearbyControlAvailable = await evaluate(
    client,
    `Boolean(document.querySelector('[aria-label="Show nearby bus stops in this area"]'))`,
  );
  await clickLabel(
    client,
    nearbyControlAvailable
      ? "Show nearby bus stops in this area"
      : "Select bus stop manually",
  );
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label="Nearby bus stops"]'))`,
    "nearby-stop sheet",
  );
  await clickLabel(client, "Recommended stop. Kent Ridge Crescent", true);
  await clickLabel(client, "Choose this stop");
  await waitFor(
    client,
    `document.body?.innerText.includes("Choose your bus")`,
    "services",
  );
  await clickLabel(client, "Bus 151 towards Kent Ridge Terminal", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("Where are you getting off?")`,
    "destination selection",
  );
  await clickLabel(client, "Central Library.", true);
  await clickLabel(client, "Review journey");
  await waitFor(
    client,
    `document.body?.innerText.includes("Your journey")`,
    "review",
  );
  const startLabel = await evaluate(
    client,
    `document.querySelector('[aria-label="Request assistance"]')
      ? "Request assistance" : "Start this journey"`,
  );
  await clickLabel(client, startLabel);
  await waitFor(
    client,
    `document.body?.innerText.includes("Waiting for bus")`,
    "waiting",
  );
  await clickLabel(client, "I'm onboard");
  await waitFor(
    client,
    `document.body?.innerText.includes("ONBOARD JOURNEY")`,
    "onboard journey",
  );
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
  await client.send("Browser.grantPermissions", {
    origin: new URL(APP_URL).origin,
    permissions: ["geolocation"],
  });
  await client.send("Emulation.setGeolocationOverride", {
    latitude: 1.2942,
    longitude: 103.7711,
    accuracy: 12,
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalFetch = window.fetch.bind(window);
      const boardingStop = {
        busStopCode: "18301", roadName: "Kent Ridge Cres",
        description: "Kent Ridge Crescent", latitude: 1.2942,
        longitude: 103.7711, services: ["151", "183"], distanceMeters: 18,
      };
      const routeStops = [
        { ...boardingStop, sequence: 0 },
        { sequence: 1, busStopCode: "18321", roadName: "Kent Ridge Cres", description: "Yusof Ishak House", latitude: 1.295, longitude: 103.773 },
        { sequence: 2, busStopCode: "18331", roadName: "Clementi Rd", description: "Central Library", latitude: 1.297, longitude: 103.775 },
        { sequence: 3, busStopCode: "19011", roadName: "Kent Ridge Cres", description: "Kent Ridge Terminal", latitude: 1.3, longitude: 103.778 },
      ];
      const requestTypes = new Map();
      window.__goassistFocusedRequests = [];
      window.__goassistFocusedErrors = [];
      window.addEventListener("error", (event) => {
        window.__goassistFocusedErrors.push(String(event.error ?? event.message));
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__goassistFocusedErrors.push(String(event.reason));
      });
      window.fetch = async (...arguments_) => {
        const input = arguments_[0];
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        const jsonResponse = (body) => new Response(JSON.stringify(body), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
        if (url.includes("/api/location/nearby-bus-stops")) {
          return jsonResponse({
            stops: [boardingStop],
            debug: { latitude: 1.2942, longitude: 103.7711, accuracyMeters: 12, maxDistanceMeters: 500 },
          });
        }
        if (url.includes("/api/bus-stops/nearby")) {
          return jsonResponse({ stops: [boardingStop], radiusMeters: 3500 });
        }
        if (url.includes("/api/location/bus-stops/18301/arrivals")) {
          const multiple = localStorage.getItem("goassist-focused-smoke-mode") === "MULTIPLE";
          const bus = (serviceNo, destination) => ({
            busId: "SGA-" + serviceNo + "-FOCUSED", serviceNo,
            arrivalSlot: "NEXT_BUS", etaSeconds: 30,
            wheelchairAccessible: true, vehicleType: "SD", destination,
          });
          return jsonResponse({
            busStop: boardingStop,
            services: [
              { serviceNo: "151", buses: [bus("151", "Kent Ridge Terminal")] },
              ...(multiple ? [{ serviceNo: "183", buses: [bus("183", "Buona Vista")] }] : []),
            ],
          });
        }
        if (url.includes("/api/location/bus-stops/18301/vehicles")) {
          const multiple = localStorage.getItem("goassist-focused-smoke-mode") === "MULTIPLE";
          const parked = (busService, destination) => ({
            busId: "SGA-" + busService + "-FOCUSED", busService,
            stopCode: boardingStop.busStopCode, state: "PARKED",
            destination, wheelchairAccessible: true,
            observedAt: new Date().toISOString(), fresh: true,
          });
          return jsonResponse({
            stopCode: boardingStop.busStopCode,
            vehicles: [
              parked("151", "Kent Ridge Terminal"),
              ...(multiple ? [parked("183", "Buona Vista")] : []),
            ],
          });
        }
        if (url.includes("/api/bus-stops/18301/services/151/routes")) {
          return jsonResponse({
            busStop: boardingStop, serviceNo: "151",
            routes: [{ serviceNo: "151", direction: 1, destination: routeStops.at(-1), stops: routeStops }],
          });
        }
        if (url.includes("/api/assistance/request")) {
          const request = JSON.parse(arguments_[1]?.body ?? "{}");
          window.__goassistFocusedRequests.push(request);
          const phase = request.boardingOrAlighting === "ALIGHTING" ? "ALIGHTING" : "BOARDING";
          const requestId = "REQ-FOCUSED-" + phase + "-" + window.__goassistFocusedRequests.length;
          requestTypes.set(requestId, request.assistanceTypes ?? []);
          return jsonResponse({ requestId, status: "SENDING", createdAt: new Date().toISOString() });
        }
        if (url.includes("/api/assistance/") && url.endsWith("/cancel")) {
          return jsonResponse({ status: "CANCELLED" });
        }
        return originalFetch(...arguments_);
      };
      window.WebSocket = class MockStatusSocket {
        constructor() { setTimeout(() => this.onopen?.(), 20); }
        send(value) {
          const message = JSON.parse(value);
          if (message.type !== "SUBSCRIBE") return;
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({
            type: "REQUEST_STATUS", requestId: message.requestId,
            status: "ACKNOWLEDGED", timestamp: new Date().toISOString(),
            assistanceTypes: requestTypes.get(message.requestId) ?? [],
            source: "MOBILE_APP", busId: "SGA-151-FOCUSED", busService: "151",
          }) }), 300);
        }
        close() {}
      };
    })();`,
  });

  await client.send("Page.navigate", { url: APP_URL });
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus")`,
    "app",
  );
  await clickLabel(client, "Profile, tab", true);
  await clickLabel(client, "Sign in as Visual Guidance Profile", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("My profile")`,
    "profile",
  );
  await clickLabel(client, "Edit accessibility preferences");
  await clickLabel(client, "Turn on Mobility support group");
  await clickLabel(client, "Save needs");

  await openFocusedAssist(client);
  await waitFor(
    client,
    `document.body?.innerText.includes("BUS AT YOUR STOP")`,
    "one bus",
  );
  const responsive = [];
  for (const width of WIDTHS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: HEIGHT,
    });
    await evaluate(
      client,
      `document.querySelector('[aria-label="Request ramp for Service 151"]')?.scrollIntoView({ block: "center" })`,
    );
    await delay(120);
    responsive.push(
      await evaluate(
        client,
        `(() => {
      const action = document.querySelector('[aria-label="Request ramp for Service 151"]');
      const rect = action?.getBoundingClientRect();
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        actionHeight: rect?.height ?? 0,
        actionVisible: Boolean(rect && rect.top < innerHeight && rect.bottom > 0),
        navigationVisible: Boolean(document.querySelector('[aria-label^="Journey, tab"]')),
        demoLabelVisible: document.body?.innerText.includes("Demo bus-presence provider"),
      };
    })()`,
      ),
    );
  }
  const doublePressStarted = await evaluate(
    client,
    `(() => {
    const action = document.querySelector('[aria-label="Request ramp for Service 151"]');
    if (!action) return false;
    action.click(); action.click(); return true;
  })()`,
  );
  if (!doublePressStarted) throw new Error("Ramp action was unavailable.");
  await waitFor(
    client,
    `document.body?.innerText.includes("REQUEST RECEIVED")`,
    "ramp acknowledgement",
  );
  const oneBus = await evaluate(
    client,
    `({
    requestCount: window.__goassistFocusedRequests.length,
    request: window.__goassistFocusedRequests[0],
    acknowledgedWithoutReady: document.body?.innerText.includes("REQUEST RECEIVED") &&
      !document.body?.innerText.includes("RAMP READY"),
    assistTabActive: document.querySelector('[aria-label*="assistance request active"]') !== null,
  })`,
  );
  await clickLabel(client, "Profile, tab", true);
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("REQUEST RECEIVED")`,
    "request after tab switch",
  );
  const tabPersistence = true;

  await evaluate(
    client,
    `localStorage.setItem("goassist-focused-smoke-mode", "MULTIPLE")`,
  );
  await client.send("Page.reload", { ignoreCache: true });
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus")`,
    "reload for multiple buses",
  );
  await openFocusedAssist(client);
  await waitFor(
    client,
    `document.body?.innerText.includes("Which bus do you need?")`,
    "multiple buses",
  );
  await clickLabel(client, "Choose Service 183", true);
  const multipleBus = await evaluate(
    client,
    `Boolean(
    document.querySelector('[aria-label="Service 183"]') &&
    document.querySelector('[aria-label="Request ramp for Service 183"]')
  )`,
  );

  await evaluate(
    client,
    `localStorage.setItem("goassist-focused-smoke-mode", "ONE")`,
  );
  await client.send("Page.reload", { ignoreCache: true });
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus")`,
    "reload for onboard journey",
  );
  await startOnboardJourney(client);
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("ON SERVICE 151")`,
    "onboard assist",
  );
  const onboardBeforeRequest = await evaluate(
    client,
    `({
    hasAlightingAction: Boolean(document.querySelector('[aria-label^="Request help to disembark"]')),
    hasBoardingRampAction: Boolean(document.querySelector('[aria-label^="Request ramp"]')),
    destination: document.body?.innerText.includes("Destination: Central Library"),
  })`,
  );
  await clickLabel(client, "Request help to disembark", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("REQUEST RECEIVED")`,
    "alighting acknowledgement",
  );
  const onboardAfterRequest = await evaluate(
    client,
    `({
    acknowledged: document.body?.innerText.includes("REQUEST RECEIVED"),
    noFalseRampReady: !document.body?.innerText.includes("RAMP READY"),
      alightingRequest: window.__goassistFocusedRequests.at(-1),
    })`,
  );
  await clickLabel(client, "Journey, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("ONBOARD JOURNEY") &&
      document.body?.innerText.includes("Central Library")`,
    "active Journey after Assist",
  );
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("ON SERVICE 151") &&
      document.body?.innerText.includes("REQUEST RECEIVED")`,
    "onboard Assist after tab switch",
  );
  const activeJourneyTabPersistence = true;

  const failures = [];
  for (const result of responsive) {
    if (result.documentWidth > result.width + 1)
      failures.push(`${result.width}px overflow`);
    if (result.actionHeight < 168 || !result.actionVisible)
      failures.push(`${result.width}px action sizing`);
    if (!result.navigationVisible || !result.demoLabelVisible)
      failures.push(`${result.width}px context labels`);
  }
  if (oneBus.requestCount !== 1)
    failures.push(`duplicate request count ${oneBus.requestCount}`);
  if (oneBus.request?.assistanceTypes?.join() !== "WHEELCHAIR_RAMP")
    failures.push("ramp payload");
  if (
    oneBus.request?.source !== "MOBILE_APP" ||
    oneBus.request?.boardingOrAlighting !== "BOARDING"
  )
    failures.push("request semantics");
  if (!oneBus.acknowledgedWithoutReady || !oneBus.assistTabActive)
    failures.push("acknowledgement semantics");
  if (!tabPersistence) failures.push("tab persistence");
  if (!activeJourneyTabPersistence) failures.push("active Journey persistence");
  if (!multipleBus) failures.push("multiple-bus selection");
  if (
    !onboardBeforeRequest.hasAlightingAction ||
    onboardBeforeRequest.hasBoardingRampAction ||
    !onboardBeforeRequest.destination
  )
    failures.push("onboard context");
  if (
    !onboardAfterRequest.acknowledged ||
    !onboardAfterRequest.noFalseRampReady ||
    onboardAfterRequest.alightingRequest?.boardingOrAlighting !== "ALIGHTING"
  )
    failures.push("onboard acknowledgement");
  if (failures.length) throw new Error(failures.join("\n"));

  console.log(
    JSON.stringify(
      {
        busPresenceProvider: "DEMO",
        realBerthTelemetryAvailable: false,
        oneBus,
        multipleBus,
        tabPersistence,
        activeJourneyTabPersistence,
        onboardBeforeRequest,
        onboardAfterRequest,
        responsive,
      },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  browser.kill();
  await delay(350);
  await removeProfileDirectory();
}
