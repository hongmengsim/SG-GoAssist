import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passengerControlAudit } from "./e2e/passenger-control-audit.mjs";

const APP_URL = process.env.GOASSIST_APP_URL ?? "http://localhost:8081";
const DEBUG_PORT = Number(process.env.GOASSIST_VOICE_CDP_PORT ?? 9339);
const EDGE_PATH =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const WIDTHS = [280, 320, 360, 390, 430, 441, 526];
const HEIGHT = 844;
const profileDir = await mkdtemp(join(tmpdir(), "goassist-voice-smoke-"));
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
      // Edge is still starting.
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

async function waitFor(client, expression, label, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(120);
  }
  const diagnosis = await evaluate(
    client,
    `({
      text: document.body?.innerText?.slice(0, 4500) ?? "",
      labels: [...document.querySelectorAll("[aria-label]")]
        .map((element) => element.getAttribute("aria-label"))
        .filter(Boolean).slice(-60),
      transcripts: window.__goassistVoiceRecognized ?? [],
      spoken: window.__goassistVoiceSpoken ?? [],
      requests: window.__goassistVoiceRequests ?? [],
      errors: window.__goassistVoiceErrors ?? [],
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
  await delay(160);
}

async function talk(client, transcript, expectedResponse) {
  await waitFor(
    client,
    `(() => {
      const talk = document.querySelector('[aria-label="Talk to GoAssist"]');
      return Boolean(talk && talk.getAttribute("aria-disabled") !== "true");
    })()`,
    "available Talk to GoAssist control",
  );
  await evaluate(
    client,
    `window.__goassistVoiceQueue.push(${JSON.stringify(transcript)})`,
  );
  await clickLabel(client, "Talk to GoAssist");
  await waitFor(
    client,
    `document.body?.innerText.includes(${JSON.stringify(expectedResponse)}) &&
      window.__goassistVoiceRecognized.includes(${JSON.stringify(transcript)})`,
    `voice response to ${transcript}`,
  );
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
  const nearbyAvailable = await evaluate(
    client,
    `Boolean(document.querySelector('[aria-label="Show nearby bus stops in this area"]'))`,
  );
  await clickLabel(
    client,
    nearbyAvailable
      ? "Show nearby bus stops in this area"
      : "Select bus stop manually",
  );
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label="Nearby bus stops"]'))`,
    "Nearby stop list",
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
    "journey review",
  );
  const action = await evaluate(
    client,
    `document.querySelector('[aria-label="Request assistance"]')
      ? "Request assistance" : "Start this journey"`,
  );
  await clickLabel(client, action);
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
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `document.body?.innerText.includes("ON SERVICE 151")`,
    "onboard Assist",
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
        longitude: 103.7711, services: ["151"], distanceMeters: 18,
      };
      const routeStops = [
        { ...boardingStop, sequence: 0 },
        { sequence: 1, busStopCode: "18321", roadName: "Kent Ridge Cres", description: "Yusof Ishak House", latitude: 1.295, longitude: 103.773 },
        { sequence: 2, busStopCode: "18331", roadName: "Clementi Rd", description: "Central Library", latitude: 1.297, longitude: 103.775 },
        { sequence: 3, busStopCode: "19011", roadName: "Kent Ridge Cres", description: "Kent Ridge Terminal", latitude: 1.3, longitude: 103.778 },
      ];
      const requestTypes = new Map();
      window.__goassistVoiceQueue = [];
      window.__goassistVoiceRecognized = [];
      window.__goassistVoiceSpoken = [];
      window.__goassistVoiceRequests = [];
      window.__goassistVoiceErrors = [];
      window.addEventListener("error", (event) =>
        window.__goassistVoiceErrors.push(String(event.error ?? event.message)));
      window.addEventListener("unhandledrejection", (event) =>
        window.__goassistVoiceErrors.push(String(event.reason)));

      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "";
        maxAlternatives = 1;
        start() {
          const transcript = window.__goassistVoiceQueue.shift();
          setTimeout(() => {
            if (!transcript) {
              this.onerror?.({ error: "no-speech" });
              return;
            }
            window.__goassistVoiceRecognized.push(transcript);
            this.onresult?.({ results: [{ 0: { transcript } }] });
            this.onend?.();
          }, 80);
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: MockSpeechRecognition,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: MockSpeechRecognition,
      });
      const MockSpeechSynthesisUtterance = class {
        constructor(text) { this.text = text; this.lang = ""; this.rate = 1; }
      };
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: MockSpeechSynthesisUtterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          cancel() {},
          speak(utterance) {
            window.__goassistVoiceSpoken.push(utterance.text);
            setTimeout(() => utterance.onend?.(), 120);
          },
        },
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
          return jsonResponse({
            busStop: boardingStop,
            services: [{ serviceNo: "151", buses: [{
              busId: "SGA-151-VOICE", serviceNo: "151", arrivalSlot: "NEXT_BUS",
              etaSeconds: 30, wheelchairAccessible: true, vehicleType: "SD",
              destination: "Kent Ridge Terminal",
            }] }],
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
          window.__goassistVoiceRequests.push(request);
          const requestId = "REQ-VOICE-" + window.__goassistVoiceRequests.length;
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
            source: "MOBILE_APP", busId: "SGA-151-VOICE", busService: "151",
          }) }), 650);
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
  await clickLabel(client, "Assist, tab", true);
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label="Talk to GoAssist"]'))`,
    "Talk control",
  );

  await talk(
    client,
    "What bus is here?",
    "Service 151 is currently at your stop.",
  );
  await talk(
    client,
    "Request the ramp.",
    "Request ramp assistance for Service 151?",
  );
  const requestsBeforeConfirmation = await evaluate(
    client,
    `window.__goassistVoiceRequests.length`,
  );
  await talk(
    client,
    "Yes.",
    "Your ramp request for Service 151 has been sent.",
  );
  await waitFor(
    client,
    `document.body?.innerText.includes("REQUEST RECEIVED") &&
      window.__goassistVoiceSpoken.includes("The bus has received your ramp request.")`,
    "spoken request acknowledgement",
  );
  const requestsAfterConfirmation = await evaluate(
    client,
    `window.__goassistVoiceRequests.length`,
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
      `document.querySelector('[data-testid="voice-assistant-panel"]')?.scrollIntoView({ block: "center" })`,
    );
    await delay(120);
    const audit = await evaluate(client, passengerControlAudit);
    if (audit.undersizedIcons.length || audit.undersizedControls.length) {
      throw new Error(`Assistant control sizing: ${JSON.stringify(audit)}`);
    }
    responsive.push(
      await evaluate(
        client,
        `(() => {
          const panel = document.querySelector('[data-testid="voice-assistant-panel"]');
          const talk = document.querySelector('[aria-label="Talk to GoAssist"]');
          const rect = talk?.getBoundingClientRect();
          return {
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            panelVisible: Boolean(panel),
            talkHeight: rect?.height ?? 0,
            responseVisible: document.body?.innerText.includes("Your ramp request for Service 151 has been sent."),
          };
        })()`,
      ),
    );
  }

  await startOnboardJourney(client);
  await talk(client, "What's my next stop?", "Your next stop is ");
  const nextStopResponse = await evaluate(
    client,
    `[...window.__goassistVoiceSpoken].reverse().find(
      (text) => text.startsWith("Your next stop is ")
    )`,
  );
  const spokenBeforeRepeat = await evaluate(
    client,
    `window.__goassistVoiceSpoken.filter(
      (text) => text === ${JSON.stringify(nextStopResponse)}
    ).length`,
  );
  await talk(client, "Repeat that.", nextStopResponse);
  await waitFor(
    client,
    `window.__goassistVoiceSpoken.filter(
      (text) => text === ${JSON.stringify(nextStopResponse)}
    ).length >= ${spokenBeforeRepeat + 1}`,
    "repeated spoken guidance",
  );

  const result = await evaluate(
    client,
    `({
      recognized: window.__goassistVoiceRecognized,
      spoken: window.__goassistVoiceSpoken,
      requests: window.__goassistVoiceRequests,
      errors: window.__goassistVoiceErrors,
      nextStopVisible: document.body?.innerText.includes(${JSON.stringify(nextStopResponse)}),
    })`,
  );
  const failures = [];
  if (requestsBeforeConfirmation !== 0)
    failures.push("ramp request sent before confirmation");
  if (requestsAfterConfirmation !== 1)
    failures.push(
      `expected one ramp request, received ${requestsAfterConfirmation}`,
    );
  if (result.requests[0]?.assistanceTypes?.join() !== "WHEELCHAIR_RAMP")
    failures.push("wrong ramp action contract");
  if (!result.spoken.includes("Service 151 is currently at your stop."))
    failures.push("bus response not spoken");
  if (!result.spoken.includes("Request ramp assistance for Service 151?"))
    failures.push("confirmation not spoken");
  if (!result.spoken.includes("The bus has received your ramp request."))
    failures.push("acknowledgement not spoken");
  if (!result.nextStopVisible) failures.push("next stop response not visible");
  if (result.errors.length)
    failures.push(`browser errors: ${result.errors.join(", ")}`);
  for (const metrics of responsive) {
    if (metrics.documentWidth > metrics.width + 1)
      failures.push(`${metrics.width}px overflow`);
    if (
      !metrics.panelVisible ||
      metrics.talkHeight < 76 ||
      !metrics.responseVisible
    )
      failures.push(`${metrics.width}px assistant layout`);
  }
  if (failures.length) throw new Error(failures.join("\n"));

  console.log(
    JSON.stringify(
      {
        speechRecognition: "mocked Web Speech API push-to-talk",
        textToSpeech: "mocked browser speechSynthesis through GuidanceService",
        audioStored: false,
        requestsBeforeConfirmation,
        requestsAfterConfirmation,
        recognized: result.recognized,
        spoken: result.spoken,
        nextStopVisible: result.nextStopVisible,
        repeatVerified: true,
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
