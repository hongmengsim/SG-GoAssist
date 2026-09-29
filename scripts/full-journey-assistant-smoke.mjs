import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  artifactDirectory,
  createBrowserHarness,
} from "./e2e/browser-harness.mjs";

const APP_URL = process.env.GOASSIST_APP_URL ?? "http://localhost:8081/";
const API_URL = process.env.GOASSIST_API_URL ?? "http://localhost:3000";
const BUS_ID = "AV-095-01";
const SERVICE = "95";
const BOARDING_STOP = {
  busStopCode: "18301",
  description: "Lim Seng Tjoe Bldg (LT 27)",
  latitude: 1.29738521493261,
  longitude: 103.7809269856724,
};
const START_LOCATION = {
  latitude: 1.29605,
  longitude: 103.780927,
  accuracy: 8,
};
const DESTINATION = { busStopCode: "16181", description: "Ctrl Lib" };
const EXPECTED_GUIDE =
  "GoAssist follows five stages: walk to the stop, wait for the correct bus, board when safe, follow stops onboard, and exit when the door or ramp is ready.";
const artifacts = artifactDirectory(import.meta.url);
const observedStages = new Set();
const hostApiCalls = [];
let browser;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function api(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }
  hostApiCalls.push({
    method: options.method ?? "GET",
    path,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    body,
  });
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (${response.status}): ${bodyText}`,
    );
  }
  return body;
}

function preloadSource() {
  const preference = JSON.stringify({
    version: 2,
    accessibilityPreferences: {
      wheelchairAssistance: true,
      alightingAssistance: true,
      reducedMotion: true,
      assistantLocale: "en-SG",
    },
  });
  const modelResolution = JSON.stringify({
    kind: "ARTICLE_SELECTION",
    evidenceId: "journey-stages:en-SG",
    confidence: 0.98,
  });
  return `(() => {
    localStorage.setItem("sg-goassist.preferences.v1", ${JSON.stringify(preference)});
    window.__GOASSIST_E2E_ASSISTANT__ = {
      enabled: true,
      responses: [${JSON.stringify(modelResolution)}],
      calls: [],
    };
    window.__goassistE2EErrors = [];
    window.__goassistE2EApi = [];
    window.__goassistE2ESockets = [];
    addEventListener("error", (event) => {
      window.__goassistE2EErrors.push({
        type: "error",
        message: event.message,
        stack: event.error?.stack,
      });
    });
    addEventListener("unhandledrejection", (event) => {
      window.__goassistE2EErrors.push({
        type: "unhandledrejection",
        message: String(event.reason?.stack ?? event.reason),
      });
    });
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => true,
    });
    class SilentUtterance {
      constructor(text) { this.text = text; }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: SilentUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() { return []; },
        speak(utterance) { queueMicrotask(() => utterance.onend?.()); },
      },
    });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const method = init.method ?? (typeof input === "string" ? "GET" : input.method);
      const call = { method, url: url.href, mocked: false, startedAt: Date.now() };
      window.__goassistE2EApi.push(call);
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
        call.mocked = true;
        call.status = 200;
        const coordinateMatch = url.pathname.match(
          new RegExp("route/v1/[^/]+/([^?]+)"),
        );
        const coordinates = coordinateMatch?.[1]?.split(";").map((pair) =>
          pair.split(",").map(Number),
        ) ?? [[103.780927, 1.29605], [103.780927, 1.297385]];
        return new Response(JSON.stringify({
          code: "Ok",
          routes: [{
            distance: 148,
            duration: 120,
            geometry: { type: "LineString", coordinates },
            legs: [{ steps: [
              {
                distance: 130,
                duration: 100,
                geometry: { type: "LineString", coordinates },
                maneuver: { type: "depart", modifier: "straight", location: coordinates[0] },
                name: "Lower Kent Ridge Road",
              },
              {
                distance: 18,
                duration: 20,
                geometry: { type: "LineString", coordinates: coordinates.slice(-2) },
                maneuver: { type: "arrive", modifier: "straight", location: coordinates.at(-1) },
                name: "",
              },
            ] }],
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      try {
        const response = await nativeFetch(input, init);
        call.status = response.status;
        call.elapsedMs = Date.now() - call.startedAt;
        return response;
      } catch (error) {
        call.error = String(error);
        throw error;
      }
    };

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        const socket = new Target(...args);
        const record = { url: String(args[0]), inbound: [], outbound: [] };
        window.__goassistE2ESockets.push(record);
        const nativeSend = socket.send.bind(socket);
        socket.send = (payload) => {
          record.outbound.push(String(payload));
          return nativeSend(payload);
        };
        socket.addEventListener("message", (event) => {
          record.inbound.push(String(event.data));
        });
        socket.addEventListener("error", () => {
          record.error = "socket error";
        });
        return socket;
      },
    });
  })();`;
}

async function visibleTextIncludes(text) {
  return browser.evaluate(
    `document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`,
  );
}

async function clickFirstAvailable(labels) {
  for (const label of labels) {
    const available = await browser.evaluate(
      `Boolean(document.querySelector('[aria-label=${JSON.stringify(label)}]'))`,
    );
    if (available) {
      await browser.clickLabel(label);
      return label;
    }
  }
  throw new Error(`None of these controls was available: ${labels.join(", ")}`);
}

async function talk(transcript, expectedText) {
  await browser.fillLabel("Ask GoAssist", transcript);
  await browser.clickLabel("Send to GoAssist");
  await browser.waitFor(
    `document.body?.innerText.includes(${JSON.stringify(expectedText)})`,
    `assistant response to ${transcript}`,
  );
}

async function observeStage(stage, timeoutMs = 25_000) {
  const stageLower = stage.toLowerCase();
  await browser.waitFor(
    `[...document.querySelectorAll('[aria-label]')].some((element) =>
      element.getAttribute('aria-label')?.toLowerCase().includes('current stage ${stageLower}'))`,
    `${stage} journey stage`,
    timeoutMs,
  );
  observedStages.add(stage.toUpperCase());
}

async function assistanceRequests() {
  return api("/api/assistance");
}

async function cases() {
  return api("/api/operations/cases");
}

function safeTelemetry(stopCode, rampPosition) {
  return {
    stopCode,
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    doorPosition: "CENTRAL",
    deploymentPathClear: true,
    rampPosition,
    wheelchairSpaceOccupied: false,
    networkOnline: true,
    observedAt: new Date().toISOString(),
  };
}

async function makeRampReady(caseRecord) {
  await api(`/api/operations/vehicles/${BUS_ID}/telemetry`, {
    method: "POST",
    body: JSON.stringify(safeTelemetry(caseRecord.stopCode, "STOWED")),
  });
  assert.equal(await visibleTextIncludes("Ramp ready"), false);
  const pending = await api(
    `/api/operations/actuators/pending?busId=${BUS_ID}`,
  );
  const command = pending.commands.find(
    (item) =>
      item.caseId === caseRecord.caseId && item.command === "DEPLOY_RAMP",
  );
  assert.ok(command, `No deploy-ramp command for ${caseRecord.caseId}`);
  await api(`/api/operations/actuators/${command.commandId}/status`, {
    method: "POST",
    body: JSON.stringify({
      caseId: caseRecord.caseId,
      busId: BUS_ID,
      state: "IN_PROGRESS",
      rampPosition: "DEPLOYING",
      updatedAt: new Date().toISOString(),
    }),
  });
  assert.equal(await visibleTextIncludes("Ramp ready"), false);
  await api(`/api/operations/vehicles/${BUS_ID}/telemetry`, {
    method: "POST",
    body: JSON.stringify(safeTelemetry(caseRecord.stopCode, "DEPLOYED")),
  });
  assert.equal(await visibleTextIncludes("Ramp ready"), false);
  const completed = await api(
    `/api/operations/actuators/${command.commandId}/status`,
    {
      method: "POST",
      body: JSON.stringify({
        caseId: caseRecord.caseId,
        busId: BUS_ID,
        state: "COMPLETED",
        rampPosition: "DEPLOYED",
        updatedAt: new Date().toISOString(),
      }),
    },
  );
  assert.equal(completed.case.state, "READY");
}

async function completeRampCase(caseRecord) {
  await api(`/api/operations/cases/${caseRecord.caseId}/operator`, {
    method: "POST",
    body: JSON.stringify({ action: "COMPLETE" }),
  });
  const pending = await api(
    `/api/operations/actuators/pending?busId=${BUS_ID}`,
  );
  const command = pending.commands.find(
    (item) =>
      item.caseId === caseRecord.caseId && item.command === "RETRACT_RAMP",
  );
  assert.ok(command, `No retract-ramp command for ${caseRecord.caseId}`);
  await api(`/api/operations/vehicles/${BUS_ID}/telemetry`, {
    method: "POST",
    body: JSON.stringify(safeTelemetry(caseRecord.stopCode, "STOWED")),
  });
  const completed = await api(
    `/api/operations/actuators/${command.commandId}/status`,
    {
      method: "POST",
      body: JSON.stringify({
        caseId: caseRecord.caseId,
        busId: BUS_ID,
        state: "COMPLETED",
        rampPosition: "STOWED",
        updatedAt: new Date().toISOString(),
      }),
    },
  );
  assert.equal(completed.case.state, "COMPLETED");
}

async function selectGoldenJourney() {
  await browser.clickLabel("Use my location");
  await browser.waitFor(
    `Boolean(
      document.querySelector('[aria-label="Show nearby bus stops in this area"]') ||
      document.querySelector('[aria-label="Select bus stop manually"]')
    )`,
    "nearby-stop controls",
  );
  await clickFirstAvailable([
    "Show nearby bus stops in this area",
    "Select bus stop manually",
  ]);
  await browser.waitFor(
    `document.body?.innerText.includes("Nearby bus stops")`,
    "nearby bus stops",
  );
  await browser.clickLabel("bus stop 18301", { contains: true });
  await browser.clickLabel("Choose this stop");
  await browser.waitFor(
    `document.body?.innerText.includes("Choose your bus")`,
    "bus selection",
  );
  await browser.clickLabel("Bus 95", { contains: true });
  await browser.waitFor(
    `document.body?.innerText.includes("Where are you getting off?")`,
    "destination selection",
  );
  await browser.clickLabel("Ctrl Lib", { contains: true });
  await browser.clickLabel("Review journey");
  await browser.waitFor(
    `document.body?.innerText.includes("Your journey")`,
    "journey review",
  );
  await clickFirstAvailable([
    "Skip assistance and start",
    "Start this journey",
  ]);
}

async function main() {
  await api("/admin/reset", { method: "POST" });
  await api(`/api/operations/vehicles/${BUS_ID}/capabilities`, {
    method: "PUT",
    body: JSON.stringify({
      busService: SERVICE,
      autonomous: true,
      autonomyLevel: "MOCK_ROUTE_AUTOMATION",
      ramp: true,
      externalAudio: true,
      visualDisplay: true,
      dwellControl: true,
      wheelchairSpaceCapacity: 1,
      supportedTelemetry: [
        "vehicleStopped",
        "parkingBrakeActive",
        "doorOpen",
        "deploymentPathClear",
        "rampPosition",
      ],
      updatedAt: new Date().toISOString(),
    }),
  });

  browser = await createBrowserHarness({
    appUrl: APP_URL,
    debugPort: Number(process.env.GOASSIST_E2E_DEBUG_PORT ?? 9341),
    width: 441,
    height: 844,
    geolocation: START_LOCATION,
    preloadSource: preloadSource(),
  });
  try {
    await browser.waitFor(
      `document.body?.innerText.includes("Find your bus")`,
      "GoAssist app",
      40_000,
    );
    await selectGoldenJourney();
    await observeStage("WALK");
    const initialScroll = await browser.evaluate("scrollY");

    await browser.setGeolocation({
      latitude: BOARDING_STOP.latitude,
      longitude: BOARDING_STOP.longitude,
      accuracy: 6,
    });
    await observeStage("WAIT");
    const waitingScroll = await browser.evaluate("scrollY");
    assert.ok(
      Math.abs(waitingScroll - initialScroll) < 120,
      `Guide moved unexpectedly from scroll ${initialScroll} to ${waitingScroll}`,
    );

    await browser.clickLabel("Assist, tab", { contains: true });
    await talk(
      "Which route is sheltered?",
      "Shelter coverage isn’t verified for the current routes",
    );
    assert.equal(await visibleTextIncludes("Live journey"), true);
    assert.equal(
      await visibleTextIncludes(
        "The AI assistant cannot drive or control equipment",
      ),
      false,
    );

    await talk("Could you walk me through everything?", EXPECTED_GUIDE);
    assert.equal(await visibleTextIncludes("GoAssist travel guide"), true);
    const assistantCalls = await browser.evaluate(
      "window.__GOASSIST_E2E_ASSISTANT__?.calls ?? []",
    );
    assert.equal(assistantCalls.length, 1);
    assert.match(assistantCalls[0].prompt, /journey-stages:en-SG/);

    assert.equal((await assistanceRequests()).count, 0);
    await talk(
      "I need the wheelchair ramp",
      "Request ramp assistance for Service 95?",
    );
    assert.equal((await assistanceRequests()).count, 0);
    await talk("Yes", "Your ramp request for Service 95 has been sent.");
    const afterBoardingRequest = await assistanceRequests();
    assert.equal(afterBoardingRequest.count, 1);
    assert.equal(
      afterBoardingRequest.requests[0].boardingOrAlighting,
      "BOARDING",
    );
    assert.deepEqual(afterBoardingRequest.requests[0].assistanceTypes, [
      "WHEELCHAIR_RAMP",
    ]);
    let caseList = await cases();
    const boardingCase = caseList.cases.find(
      (item) => item.phase === "BOARDING",
    );
    assert.ok(boardingCase);

    await browser.clickLabel("Journey, tab", { contains: true });
    await api("/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({ busId: BUS_ID, status: "APPROACHING" }),
    });
    await delay(250);
    await api("/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({ busId: BUS_ID, status: "ARRIVED" }),
    });
    await observeStage("BOARD");
    assert.equal(await visibleTextIncludes("Ramp ready"), false);
    await makeRampReady(boardingCase);
    await browser.waitFor(
      `document.body?.innerText.includes("Ramp ready")`,
      "boarding ramp readiness",
    );

    await browser.clickLabel("I'm onboard");
    await observeStage("RIDE");
    await completeRampCase(boardingCase);

    await browser.clickLabel("Assist, tab", { contains: true });
    await talk("What's my next stop?", "Your next stop is");
    assert.equal(await visibleTextIncludes("Live journey"), true);
    await talk(
      "Help me get off the bus",
      "I’ll request alighting assistance for Ctrl Lib. Should I send it?",
    );
    assert.equal((await assistanceRequests()).count, 1);
    await talk("Yes", "Your alighting assistance request has been sent.");
    const afterAlightingRequest = await assistanceRequests();
    assert.equal(afterAlightingRequest.count, 2);
    assert.equal(
      afterAlightingRequest.requests.filter(
        (item) => item.boardingOrAlighting === "ALIGHTING",
      ).length,
      1,
    );
    caseList = await cases();
    const alightingCase = caseList.cases.find(
      (item) => item.phase === "ALIGHTING",
    );
    assert.ok(alightingCase);

    await browser.clickLabel("Journey, tab", { contains: true });
    await makeRampReady(alightingCase);
    await browser.waitFor(
      `document.body?.innerText.includes("Ramp ready")`,
      "alighting ramp readiness",
    );
    await observeStage("EXIT");

    for (let step = 0; step < 6; step += 1) {
      if (
        await browser.evaluate(
          `Boolean(document.querySelector('[aria-label="I\\'ve safely alighted"]'))`,
        )
      ) {
        break;
      }
      const nextAvailable = await browser.evaluate(
        `Boolean(document.querySelector('[aria-label="Simulate next stop"]'))`,
      );
      if (!nextAvailable) break;
      await browser.clickLabel("Simulate next stop");
      await delay(160);
    }
    await browser.waitFor(
      `Boolean(document.querySelector('[aria-label="I\\'ve safely alighted"]'))`,
      "safe alighting confirmation",
    );
    await completeRampCase(alightingCase);
    await browser.waitFor(
      `window.__goassistE2ESockets?.some((socket) =>
        socket.inbound.some((message) =>
          message.includes(${JSON.stringify(alightingCase.caseId)}) &&
          message.includes('"state":"COMPLETED"')
        )
      )`,
      "completed alighting case event",
    );
    await delay(250);
    await browser.clickLabel("I've safely alighted");
    await browser.waitFor(
      `document.body?.innerText.includes("Find your bus")`,
      "completed journey returning to idle",
    );

    await browser.clickLabel("Assist, tab", { contains: true });
    await browser.waitFor(
      `document.body?.innerText.includes("Talk to GoAssist")`,
      "assistant after journey completion",
    );
    const assistantContextCleared = await browser.evaluate(
      `!document.body?.innerText.includes("Could you walk me through everything?") &&
       !document.body?.innerText.includes("What's my next stop?")`,
    );
    assert.equal(assistantContextCleared, true);

    assert.deepEqual([...observedStages].sort(), [
      "BOARD",
      "EXIT",
      "RIDE",
      "WAIT",
      "WALK",
    ]);
    const finalState = await browser.evaluate(`({
      activeJourneyPresent: Object.keys(localStorage).some((key) =>
        key.includes("sg-goassist.active-journey.v1")),
      preferences: localStorage.getItem("sg-goassist.preferences.v1"),
      errors: window.__goassistE2EErrors ?? [],
      api: window.__goassistE2EApi ?? [],
      sockets: window.__goassistE2ESockets ?? [],
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      assistantCalls: window.__GOASSIST_E2E_ASSISTANT__?.calls ?? [],
    })`);
    assert.equal(finalState.activeJourneyPresent, false);
    assert.match(finalState.preferences ?? "", /"wheelchairAssistance":true/);
    assert.equal(finalState.errors.length, 0);
    assert.equal(finalState.overflow, false);
    assert.ok(
      finalState.sockets.some((socket) =>
        socket.inbound.some((message) => message.includes("CASE_STATUS")),
      ),
      "No assistance-case WebSocket event was observed",
    );
    assert.ok(
      finalState.sockets.some((socket) =>
        socket.inbound.some((message) => message.includes("VEHICLE_STATUS")),
      ),
      "No vehicle-status WebSocket event was observed",
    );
    const finalCases = await cases();
    assert.equal(
      finalCases.cases.filter((item) => item.state === "COMPLETED").length,
      2,
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          viewport: 441,
          observedStages: [...observedStages],
          assistanceRequests: afterAlightingRequest.count,
          completedCases: 2,
          assistantModelCalls: finalState.assistantCalls.length,
          browserApiCalls: finalState.api.length,
          websocketConnections: finalState.sockets.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const backend = {};
    for (const [key, path] of [
      ["requests", "/api/assistance"],
      ["cases", "/api/operations/cases"],
      ["telemetry", `/api/operations/vehicles/${BUS_ID}/telemetry`],
      ["logs", "/admin/logs"],
    ]) {
      try {
        backend[key] = await api(path);
      } catch (captureError) {
        backend[key] = { error: String(captureError) };
      }
    }
    const files = await browser.captureFailureArtifacts(
      artifacts,
      "journey-assistant",
      { backend, hostApiCalls },
    );
    await writeFile(
      join(artifacts, "journey-assistant-latest-backend.json"),
      JSON.stringify({ backend, hostApiCalls }, null, 2),
      "utf8",
    );
    console.error(
      `Failure artifacts: ${files.screenshot}, ${files.diagnostics}`,
    );
    throw error;
  } finally {
    await browser?.close();
    await api("/admin/reset", { method: "POST" }).catch(() => undefined);
  }
}

await main();
