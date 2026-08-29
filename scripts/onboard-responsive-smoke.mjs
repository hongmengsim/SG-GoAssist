import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_URL = process.env.GOASSIST_APP_URL ?? "http://localhost:8081";
const DEBUG_PORT = Number(process.env.GOASSIST_ONBOARD_CDP_PORT ?? 9335);
const EDGE_PATH =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WIDTHS = [280, 320, 360, 390, 430];
const HEIGHT = 844;
const profileDir = await mkdtemp(join(tmpdir(), "goassist-onboard-smoke-"));
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
      bodyText: document.body?.innerText?.slice(0, 3000) ?? "",
      labels: [...document.querySelectorAll("[aria-label]")]
        .map((element) => element.getAttribute("aria-label"))
        .filter(Boolean)
        .slice(-40),
      smokeFetches: window.__goassistOnboardSmokeFetches ?? [],
      smokeErrors: window.__goassistOnboardSmokeErrors ?? [],
      location: location.href,
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
      const element = [...document.querySelectorAll("[aria-label]")].find((candidate) =>
        ${prefix ? "candidate.getAttribute('aria-label')?.startsWith(label)" : "candidate.getAttribute('aria-label') === label"}
      );
      if (!element) return false;
      element.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find ${label}.`);
  await delay(160);
}

async function clickLastLabel(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const candidates = [...document.querySelectorAll("[aria-label]")].filter(
        (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)},
      );
      const element = candidates.at(-1);
      if (!element) return false;
      element.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Could not find ${label}.`);
  await delay(160);
}

async function startJourneyFromIdle(client, destinationLabel) {
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
    "Nearby sheet",
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
  await clickLabel(client, destinationLabel, true);
  await clickLabel(client, "Review journey");
  await waitFor(
    client,
    `document.body?.innerText.includes("Your journey")`,
    "review",
  );
  const startAction = await evaluate(
    client,
    `document.querySelector('[aria-label="Request assistance"]')
      ? "Request assistance"
      : "Start this journey"`,
  );
  await clickLabel(client, startAction);
  await waitFor(
    client,
    `document.body?.innerText.includes("Waiting for bus")`,
    "waiting",
  );
  await clickLabel(client, "I'm onboard");
  await waitFor(
    client,
    `document.body?.innerText.includes("ONBOARD JOURNEY")`,
    "onboard",
  );
}

async function captureState(client, state, destinationName = "Science Drive") {
  const results = [];
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
      `(() => {
        const target = document.querySelector('[aria-label="Request help to disembark"], [aria-label="Request help"], [data-testid="alighting-assistance-card"]');
        target?.scrollIntoView({ block: "center" });
      })()`,
    );
    await delay(180);
    const metrics = await evaluate(
      client,
      `(() => {
        const destinationName = ${JSON.stringify(destinationName)};
        const bodyText = document.body?.innerText ?? "";
        const navigation = document.querySelector('[aria-label^="Journey, tab"]')?.parentElement;
        const action = document.querySelector('[aria-label="Request help to disembark"], [aria-label="Request help"]');
        const hero = document.querySelector('[aria-label^="Your stop is next."], [aria-label^="Onboard Journey."], [aria-label^="This is your stop."]');
        const navigationRect = navigation?.getBoundingClientRect();
        const actionRect = action?.getBoundingClientRect();
        const heroStyle = hero ? getComputedStyle(hero) : null;
        const alertText = [...document.querySelectorAll("div, span")].find(
          (node) => node.textContent?.trim() === "YOUR STOP IS NEXT",
        );
        const alertStyle = alertText ? getComputedStyle(alertText) : null;
        const destinationOccurrences = hero
          ? (hero.textContent?.split(destinationName).length ?? 1) - 1
          : 0;
        return {
          state: ${JSON.stringify(state)},
          width: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          bottomNavigationVisible:
            document.querySelectorAll('[aria-label*=" tab,"]').length === 3,
          actionPresent: Boolean(action),
          actionClearOfNavigation:
            !actionRect || !navigationRect || actionRect.bottom <= navigationRect.top - 1,
          destinationOccurrences,
          hasTwoStops: bodyText.includes("2 stops to " + destinationName),
          hasOneStop: bodyText.includes("1 stop to " + destinationName),
          hasDestinationNext:
            bodyText.includes("YOUR STOP IS NEXT") &&
            bodyText.includes("Prepare to alight."),
          hasRequestSent:
            bodyText.includes("Ramp request sent") &&
            bodyText.includes("Extra alighting time requested"),
          hasAcknowledgement:
            bodyText.includes("Ramp request received") &&
            bodyText.includes("The bus has received your request."),
          hasRampReadyState: [...document.querySelectorAll("div, span")].some(
            (node) => node.textContent?.trim() === "Ramp is ready",
          ),
          hasBoardingTimeWording:
            bodyText.includes("More boarding time will be requested") ||
            bodyText.includes("More boarding time for your selected stop") ||
            (bodyText.includes("Alighting assistance requested") &&
              bodyText.includes("boarding time")),
          hasMiniatureJourneyArtwork: Boolean(
            document.querySelector('[aria-label="Illustration of a passenger tracking the journey before disembarking"]'),
          ),
          hasSimplifiedAction:
            bodyText.includes("Request help to get off the bus.") &&
            Boolean(document.querySelector('[aria-label="Request help"]')),
          largeTextAlert: !alertStyle || parseFloat(alertStyle.fontSize) >= 29,
          highContrastHero:
            !heroStyle ||
            (heroStyle.backgroundColor === "rgb(0, 0, 0)" &&
              heroStyle.borderColor === "rgb(255, 255, 255)"),
        };
      })()`,
    );
    results.push(metrics);
  }
  return results;
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
        description: "Kent Ridge Crescent", latitude: 1.29398,
        longitude: 103.77104, services: ["151"], distanceMeters: 45,
      };
      const routeStops = [
        { ...boardingStop, sequence: 0 },
        { sequence: 1, busStopCode: "18321", roadName: "Kent Ridge Cres", description: "Opp Heng Mui Keng Terrace", latitude: 1.29295, longitude: 103.77508 },
        { sequence: 2, busStopCode: "18331", roadName: "Science Dr 2", description: "Science Drive", latitude: 1.29528, longitude: 103.7782 },
        { sequence: 3, busStopCode: "18341", roadName: "Science Dr 2", description: "Opp Science Drive", latitude: 1.29612, longitude: 103.78072 },
        { sequence: 4, busStopCode: "19011", roadName: "Kent Ridge Cres", description: "Kent Ridge Terminal", latitude: 1.2942, longitude: 103.7711 },
      ];
      const requestTypes = new Map();
      window.__goassistOnboardSmokeFetches = [];
      window.__goassistOnboardSmokeErrors = [];
      window.addEventListener("error", (event) => {
        window.__goassistOnboardSmokeErrors.push(String(event.error ?? event.message));
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__goassistOnboardSmokeErrors.push(String(event.reason));
      });
      window.fetch = async (...arguments_) => {
        const input = arguments_[0];
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        window.__goassistOnboardSmokeFetches.push(url);
        const jsonResponse = (body) => new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
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
          return jsonResponse({
            busStop: boardingStop,
            services: [{
              serviceNo: "151",
              buses: [{
                busId: "SGA-151-SMOKE", serviceNo: "151", arrivalSlot: "NEXT_BUS",
                etaSeconds: 90, wheelchairAccessible: true, vehicleType: "SD",
                destination: "Kent Ridge Terminal",
              }],
            }],
          });
        }
        if (url.includes("/api/bus-stops/18301/services/151/routes")) {
          return jsonResponse({
            busStop: boardingStop,
            serviceNo: "151",
            routes: [{
              serviceNo: "151", direction: 1,
              destination: routeStops.at(-1), stops: routeStops,
            }],
          });
        }
        if (url.includes("/api/assistance/request")) {
          const request = JSON.parse(arguments_[1]?.body ?? "{}");
          const phase = request.boardingOrAlighting === "ALIGHTING" ? "ALIGHTING" : "BOARDING";
          const requestId = "REQ-SMOKE-" + phase;
          requestTypes.set(requestId, request.assistanceTypes ?? []);
          return jsonResponse({
            requestId,
            status: "SENDING",
            createdAt: new Date().toISOString(),
          });
        }
        if (url.includes("/api/assistance/") && url.endsWith("/cancel")) {
          window.__goassistOnboardSmokeCancellationCount =
            (window.__goassistOnboardSmokeCancellationCount ?? 0) + 1;
          return jsonResponse({ status: "CANCELLED" });
        }
        return originalFetch(...arguments_);
      };
      window.WebSocket = class MockStatusSocket {
        constructor() {
          setTimeout(() => this.onopen?.(), 20);
        }
        send(value) {
          const message = JSON.parse(value);
          if (message.type !== "SUBSCRIBE" || !message.requestId.includes("ALIGHTING")) return;
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({
              type: "REQUEST_STATUS",
              requestId: message.requestId,
              status: "ACKNOWLEDGED",
              timestamp: new Date().toISOString(),
              assistanceTypes: requestTypes.get(message.requestId) ?? [],
              source: "MOBILE_APP",
              busId: "SGA-151-SMOKE",
              busService: "151",
            }) });
          }, 8000);
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
  await clickLabel(client, "Apply Wheelchair preset");
  await clickLabel(client, "Save needs");
  await clickLabel(client, "Journey, tab", true);
  await startJourneyFromIdle(client, "Science Drive.");

  const results = [];
  results.push(...(await captureState(client, "2_STOPS")));
  await clickLabel(client, "Simulate next stop");
  await waitFor(
    client,
    `document.body?.innerText.includes("1 stop to Science Drive")`,
    "one stop",
  );
  results.push(...(await captureState(client, "1_STOP")));
  await clickLabel(client, "Simulate next stop");
  await waitFor(
    client,
    `document.body?.innerText.includes("YOUR STOP IS NEXT")`,
    "destination next",
  );
  results.push(
    ...(await captureState(client, "DESTINATION_NEXT_NOT_REQUESTED")),
  );

  await clickLabel(client, "Profile, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("My profile")`,
    "profile",
  );
  await clickLabel(client, "Edit accessibility preferences");
  await clickLabel(client, "Apply Simplified journey preset");
  await clickLabel(client, "Save needs");
  await clickLabel(client, "Journey, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("Request help to get off the bus.")`,
    "simplified onboard",
  );
  results.push(...(await captureState(client, "SIMPLIFIED_JOURNEY")));

  await clickLabel(client, "Profile, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("My profile")`,
    "profile",
  );
  await clickLabel(client, "Edit accessibility preferences");
  await clickLabel(client, "Journey support accessibility settings");
  await clickLabel(client, "Simplified journey");
  await clickLabel(client, "Back to accessibility");
  await clickLabel(client, "Save needs");
  await clickLabel(client, "Journey, tab", true);
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label="Request help to disembark"]'))`,
    "standard alighting action",
  );

  await clickLabel(client, "Request help to disembark");
  await waitFor(
    client,
    `document.body?.innerText.includes("Ramp request sent")`,
    "request sent",
  );
  results.push(...(await captureState(client, "ASSISTANCE_REQUESTED")));
  await waitFor(
    client,
    `document.body?.innerText.includes("Ramp request received")`,
    "acknowledgement",
    15_000,
  );
  results.push(...(await captureState(client, "ASSISTANCE_ACKNOWLEDGED")));

  const lifecycle = {
    tabSwitchPreservedJourney: false,
    confirmationFitAt280: false,
    cancelKeptJourney: false,
    earlyEndReturnedToIdle: false,
    persistedJourneyRemoved: false,
    refreshStayedIdle: false,
    destinationNextKeptAssistancePrimary: false,
    destinationReachedCompleted: false,
    secondJourneyClean: false,
    accessibilityPreferencesPreserved: false,
    assistanceCancellations: 0,
  };

  await clickLabel(client, "Assist, tab", true);
  await clickLabel(client, "Journey, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("YOUR STOP IS NEXT")`,
    "active journey after tab switch",
  );
  lifecycle.tabSwitchPreservedJourney = true;

  await clickLabel(client, "More");
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label="End journey"]'))`,
    "End journey in More",
  );
  await clickLabel(client, "End journey");
  await waitFor(
    client,
    `Boolean(document.querySelector('[data-testid="end-journey-confirmation"]'))`,
    "End journey confirmation",
  );
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 280,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 280,
    screenHeight: HEIGHT,
  });
  lifecycle.confirmationFitAt280 = await evaluate(
    client,
    `(() => {
      const dialog = document.querySelector('[data-testid="end-journey-confirmation"]');
      const rect = dialog?.getBoundingClientRect();
      return Boolean(
        rect && rect.left >= 0 && rect.right <= window.innerWidth &&
        document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        dialog.querySelector('[aria-label="Keep journey"]') &&
        dialog.querySelector('[aria-label="End journey"]')
      );
    })()`,
  );
  await clickLabel(client, "Keep journey");
  await waitFor(
    client,
    `!document.querySelector('[data-testid="end-journey-confirmation"]') &&
      document.body?.innerText.includes("YOUR STOP IS NEXT")`,
    "journey preserved after cancellation",
  );
  lifecycle.cancelKeptJourney = true;

  await clickLabel(client, "End journey");
  await waitFor(
    client,
    `Boolean(document.querySelector('[data-testid="end-journey-confirmation"]'))`,
    "second End journey confirmation",
  );
  await clickLastLabel(client, "End journey");
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus") &&
      !document.body?.innerText.includes("ONBOARD JOURNEY")`,
    "idle Journey after End journey",
  );
  lifecycle.earlyEndReturnedToIdle = true;
  lifecycle.persistedJourneyRemoved = await evaluate(
    client,
    `!Object.keys(localStorage).some((key) =>
      key.includes("sg-goassist.active-journey.v1"))`,
  );
  lifecycle.accessibilityPreferencesPreserved = await evaluate(
    client,
    `Object.entries(localStorage).some(([key, value]) =>
      key.includes("sg-goassist.preferences.v1") &&
      (value.includes('"wheelchairRouting":true') || value.includes("WHEELCHAIR")))`,
  );
  lifecycle.assistanceCancellations = await evaluate(
    client,
    `window.__goassistOnboardSmokeCancellationCount ?? 0`,
  );

  await client.send("Page.reload", { ignoreCache: true });
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus") &&
      !document.body?.innerText.includes("Service 151")`,
    "idle Journey after refresh",
  );
  lifecycle.refreshStayedIdle = true;

  await startJourneyFromIdle(client, "Kent Ridge Terminal.");
  await waitFor(
    client,
    `document.body?.innerText.includes("YOUR STOP IS NEXT") &&
      document.body?.innerText.includes("Kent Ridge Terminal")`,
    "clean second journey",
  );
  lifecycle.secondJourneyClean = await evaluate(
    client,
    `document.body?.innerText.includes("YOUR STOP IS NEXT") &&
      document.body?.innerText.includes("Kent Ridge Terminal") &&
      !document.body?.innerText.includes("Science Drive")`,
  );
  lifecycle.destinationNextKeptAssistancePrimary = await evaluate(
    client,
    `Boolean(document.querySelector('[aria-label="Request help to disembark"]')) &&
      !document.querySelector('[aria-label="Finish journey"]') &&
      !document.querySelector('[aria-label="End journey"]')`,
  );
  await clickLabel(client, "Request help to disembark");
  await waitFor(
    client,
    `document.body?.innerText.includes("Ramp request sent")`,
    "second journey assistance request",
  );
  await clickLabel(client, "Simulate next stop");
  await waitFor(
    client,
    `document.body?.innerText.includes("YOU'VE REACHED YOUR STOP") &&
      Boolean(document.querySelector('[aria-label="I\\'ve safely alighted"]'))`,
    "safe alighting completion",
  );
  await clickLabel(client, "I've safely alighted");
  await waitFor(
    client,
    `document.body?.innerText.includes("Find your bus") &&
      !document.body?.innerText.includes("ONBOARD JOURNEY")`,
    "idle Journey after safe alighting",
  );
  lifecycle.destinationReachedCompleted = true;
  lifecycle.assistanceCancellations += await evaluate(
    client,
    `window.__goassistOnboardSmokeCancellationCount ?? 0`,
  );

  const failures = results.flatMap((result) => {
    const messages = [];
    if (result.width !== result.documentWidth || result.horizontalOverflow)
      messages.push("horizontal overflow");
    if (!result.bottomNavigationVisible)
      messages.push("three-tab bottom navigation missing");
    if (!result.actionClearOfNavigation)
      messages.push("alighting CTA obscured by bottom navigation");
    if (result.hasBoardingTimeWording)
      messages.push("boarding-time wording shown while disembarking");
    if (result.hasMiniatureJourneyArtwork)
      messages.push("miniature journey artwork shown");
    if (result.hasRampReadyState)
      messages.push("acknowledgement implies ramp-ready telemetry");
    if (!result.largeTextAlert || !result.highContrastHero)
      messages.push("Large Text or High Contrast presentation missing");
    if (result.state === "2_STOPS" && !result.hasTwoStops)
      messages.push("two-stop state missing");
    if (result.state === "1_STOP" && !result.hasOneStop)
      messages.push("one-stop state missing");
    if (
      result.state === "DESTINATION_NEXT_NOT_REQUESTED" &&
      (!result.hasDestinationNext ||
        !result.actionPresent ||
        result.destinationOccurrences !== 1)
    )
      messages.push("destination-next hierarchy or CTA missing");
    if (result.state === "ASSISTANCE_REQUESTED" && !result.hasRequestSent)
      messages.push("requested assistance state missing");
    if (
      result.state === "ASSISTANCE_ACKNOWLEDGED" &&
      !result.hasAcknowledgement
    )
      messages.push("acknowledged assistance state missing");
    if (result.state === "SIMPLIFIED_JOURNEY" && !result.hasSimplifiedAction)
      messages.push("simplified next action missing");
    return messages.map(
      (message) => `${result.state} ${result.width}px: ${message}`,
    );
  });
  const lifecycleFailures = Object.entries(lifecycle).flatMap(
    ([check, value]) => {
      if (check === "assistanceCancellations") {
        return value >= 2
          ? []
          : [`${check}: expected at least 2, received ${value}`];
      }
      return value === true ? [] : [`${check}: expected true`];
    },
  );
  failures.push(...lifecycleFailures);
  if (failures.length) throw new Error(failures.join("\n"));

  console.log(
    JSON.stringify(
      {
        checked: results.length,
        rampReadyTelemetrySupported: false,
        lifecycle,
        results,
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
