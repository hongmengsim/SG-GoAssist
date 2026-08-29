import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const APP_URL = process.env.GOASSIST_APP_URL ?? "http://localhost:8081";
const DEBUG_PORT = Number(process.env.GOASSIST_CDP_PORT ?? 9333);
const WIDTHS = [280, 320, 360, 390, 430];
const VIEWPORT_HEIGHT = 844;
const EDGE_PATH =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const commandArguments = process.argv.slice(2);
const uiRefinementMode = commandArguments.includes("--ui-refinement");
const retryFailureMode = commandArguments.includes("--retry-failure");
const directionsMode = commandArguments.includes("--directions");
const requestedOutputDir = commandArguments.find(
  (argument) => !argument.startsWith("--"),
);
const outputDir = requestedOutputDir
  ? resolve(requestedOutputDir)
  : await mkdtemp(join(tmpdir(), "goassist-map-smoke-output-"));
const profileDir = await mkdtemp(join(tmpdir(), "goassist-map-smoke-profile-"));
await mkdir(outputDir, { recursive: true });

const browser = spawn(
  EDGE_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-background-networking",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForDebugTarget() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(
        `http://127.0.0.1:${DEBUG_PORT}/json/list`,
      ).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Edge may not have opened its debugging socket yet.
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for the Edge debugging target.");
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const ready = new Promise((resolveReady, rejectReady) => {
    socket.addEventListener("open", resolveReady, { once: true });
    socket.addEventListener("error", rejectReady, { once: true });
  });

  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolveRequest, rejectRequest) => {
        const id = nextId++;
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
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
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function captureJourneyEntry(client, mode) {
  const results = [];
  for (const width of WIDTHS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: VIEWPORT_HEIGHT,
    });
    await delay(350);
    const metrics = await evaluate(
      client,
      `(() => {
        const tabButtons = [...document.querySelectorAll('[aria-label*=", tab,"]')];
        const journeyTab = document.querySelector('[aria-label^="Journey, tab"]');
        const tabRects = tabButtons.map((tab) => tab.getBoundingClientRect());
        const useLocation = document.querySelector('[aria-label="Use my location"]');
        const manual = document.querySelector('[aria-label="Select bus stop manually"]');
        const actionRects = [useLocation, manual]
          .filter(Boolean)
          .map((action) => action.getBoundingClientRect());
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          hasJourneyCopy:
            document.body.innerText.includes("Find your bus") &&
            document.body.innerText.includes("Accessible journeys. Guided with care."),
          hasJourneyArtwork: Boolean(document.querySelector('[data-testid="journey-hero-artwork"]')),
          homeTabCount: document.querySelectorAll('[aria-label^="Home, tab"]').length,
          tabCount: tabButtons.length,
          journeySelected:
            journeyTab?.getAttribute("aria-selected") === "true" ||
            journeyTab?.getAttribute("aria-label")?.includes("selected") === true,
          minimumTabHeight: tabRects.length
            ? Math.min(...tabRects.map((rect) => rect.height))
            : 0,
          tabWidthSpread: tabRects.length
            ? Math.max(...tabRects.map((rect) => rect.width)) -
              Math.min(...tabRects.map((rect) => rect.width))
            : Infinity,
          actionCount: actionRects.length,
          minimumActionHeight: actionRects.length
            ? Math.min(...actionRects.map((rect) => rect.height))
            : 0,
        };
      })()`,
    );
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = join(
      outputDir,
      `journey-entry-${mode}-${width}x${VIEWPORT_HEIGHT}.png`,
    );
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    results.push({ width, mode, screenshotPath, ...metrics });
  }
  return results;
}

const tileZoomExpression = `(() => {
  const zooms = [...document.querySelectorAll(".leaflet-tile")]
    .map((tile) => Number(tile.src.match(/\\/(\\d+)\\/\\d+\\/\\d+\\.png/)?.[1]))
    .filter(Number.isFinite);
  return zooms.length ? Math.max(...zooms) : -1;
})()`;

let client;
try {
  const target = await waitForDebugTarget();
  client = createCdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  if (directionsMode) {
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const originalFetch = window.fetch.bind(window);
        window.__goassistWalkingRouteRequests = [];
        window.__goassistWalkingRouteResponses = [];
        window.__goassistSpokenGuidance = [];
        window.__goassistSpeechRuntime = {
          supported: Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance),
        };
        const speechSynthesis = window.speechSynthesis;
        if (speechSynthesis?.speak) {
          const nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
          speechSynthesis.speak = (utterance) => {
            window.__goassistSpokenGuidance.push({
              lang: utterance.lang,
              rate: utterance.rate,
              text: utterance.text,
            });
            return nativeSpeak(utterance);
          };
        }
        window.fetch = async (...arguments_) => {
          const input = arguments_[0];
          const url = typeof input === "string" ? input : input?.url ?? String(input);
          if (url.includes("/routed-foot/route/v1/")) {
            window.__goassistWalkingRouteRequests.push(url);
            try {
              const response = await originalFetch(...arguments_);
              window.__goassistWalkingRouteResponses.push({
                ok: response.ok,
                status: response.status,
                url,
              });
              return response;
            } catch (error) {
              window.__goassistWalkingRouteResponses.push({
                error: String(error),
                url,
              });
              throw error;
            }
          }
          return originalFetch(...arguments_);
        };
      })();`,
    });
  }
  if (uiRefinementMode) {
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const originalFetch = window.fetch.bind(window);
        const representativeStop = {
          busStopCode: "18139",
          roadName: "Lower Kent Ridge Rd",
          description: "Opp Yusof Ishak House",
          latitude: 1.29812,
          longitude: 103.77424,
          distanceMeters: 12,
          services: ["151", "183", "188", "190", "200"],
        };
        window.fetch = async (...arguments_) => {
          const response = await originalFetch(...arguments_);
          const input = arguments_[0];
          const url = typeof input === "string" ? input : input?.url ?? String(input);
          if (!url.includes("/api/bus-stops/nearby?")) return response;
          const body = await response.clone().json();
          body.stops = [
            representativeStop,
            ...body.stops.filter(
              (stop) => stop.busStopCode !== representativeStop.busStopCode,
            ),
          ];
          return new Response(JSON.stringify(body), {
            status: response.status,
            statusText: response.statusText,
            headers: { "Content-Type": "application/json" },
          });
        };
      })();`,
    });
  }
  if (retryFailureMode) {
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const originalFetch = window.fetch.bind(window);
        let failuresRemaining = 1;
        window.__goassistRegionalFailureCount = 0;
        window.fetch = async (...arguments_) => {
          const input = arguments_[0];
          const url = typeof input === "string" ? input : input?.url ?? String(input);
          if (url.includes("/api/bus-stops/nearby?") && failuresRemaining > 0) {
            failuresRemaining -= 1;
            window.__goassistRegionalFailureCount += 1;
            throw new TypeError("Simulated regional bus-stop request failure");
          }
          return originalFetch(...arguments_);
        };
      })();`,
    });
  }
  await client.send("Browser.grantPermissions", {
    origin: new URL(APP_URL).origin,
    permissions: ["geolocation"],
  });
  if (directionsMode) {
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  }
  await client.send("Emulation.setGeolocationOverride", {
    latitude: uiRefinementMode ? 1.29812 : 1.3521,
    longitude: uiRefinementMode ? 103.77424 : 103.8198,
    accuracy: 12,
  });
  await client.send("Page.navigate", { url: APP_URL });

  try {
    await waitFor(
      client,
      `document.body?.innerText.toLowerCase().includes("journey")`,
      "the GoAssist shell",
    );
  } catch (error) {
    const diagnosis = await evaluate(
      client,
      `({
        bodyText: document.body?.innerText?.slice(0, 2000) ?? "",
        rootHtml: document.querySelector("#root")?.innerHTML?.slice(0, 2000) ?? "",
        readyState: document.readyState,
        location: location.href,
      })`,
    );
    throw new Error(`${error.message}\n${JSON.stringify(diagnosis, null, 2)}`);
  }

  const journeyEntryResults = [
    ...(await captureJourneyEntry(client, "standard-light")),
  ];
  await evaluate(
    client,
    `document.querySelector('[aria-label^="Profile, tab"]')?.click()`,
  );
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label^="Sign in as Visual Guidance Profile"]'))`,
    "the demo profile",
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label^="Sign in as Visual Guidance Profile"]')?.click()`,
  );
  await waitFor(
    client,
    `document.body?.innerText.toLowerCase().includes("my profile")`,
    "Profile",
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label^="Journey, tab"]')?.click()`,
  );
  await waitFor(
    client,
    `document.body?.innerText.toLowerCase().includes("find your bus")`,
    "Journey entry",
  );
  journeyEntryResults.push(
    ...(await captureJourneyEntry(client, "high-contrast-light-large-text")),
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label^="Profile, tab"]')?.click()`,
  );
  await waitFor(
    client,
    `document.body?.innerText.toLowerCase().includes("my profile")`,
    "Profile",
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label="Dark mode"]')?.click()`,
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label^="Journey, tab"]')?.click()`,
  );
  await waitFor(
    client,
    `document.body?.innerText.toLowerCase().includes("find your bus")`,
    "Journey entry",
  );
  journeyEntryResults.push(
    ...(await captureJourneyEntry(client, "high-contrast-dark-large-text")),
  );

  const journeyEntryFailures = journeyEntryResults.flatMap((result) => {
    const messages = [];
    if (result.viewportWidth !== result.width)
      messages.push("viewport width mismatch");
    if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
    if (!result.hasJourneyCopy || !result.hasJourneyArtwork)
      messages.push("Journey entry content missing");
    if (result.homeTabCount !== 0) messages.push("Home tab still present");
    if (result.tabCount !== 3 || !result.journeySelected)
      messages.push("three-tab Journey selection missing");
    if (result.minimumTabHeight < 44) messages.push("tab target below 44px");
    if (result.tabWidthSpread > 1) messages.push("tabs not evenly distributed");
    if (result.actionCount !== 2 || result.minimumActionHeight < 44)
      messages.push("Journey entry action target missing or too small");
    return messages.map(
      (message) => `${result.mode} ${result.width}px: ${message}`,
    );
  });
  if (journeyEntryFailures.length) {
    throw new Error(journeyEntryFailures.join("\n"));
  }

  const useLocationClicked = await evaluate(
    client,
    `(() => {
      const labels = [...document.querySelectorAll("div, span")]
        .filter((node) => node.textContent?.trim() === "Use my location");
      const label = labels.at(-1);
      const control = label?.closest('[role="button"], button, a');
      if (!control) return false;
      control.click();
      return true;
    })()`,
  );
  if (!useLocationClicked)
    throw new Error("Could not start Journey location discovery.");

  await waitFor(
    client,
    `Boolean(document.querySelector(".goassist-leaflet-map"))`,
    "the Leaflet map",
  );

  let retryRecovery = null;
  if (retryFailureMode) {
    await waitFor(
      client,
      `Boolean(document.querySelector('[role="alert"]')) &&
        document.body?.innerText.includes("Unable to load bus stops")`,
      "the regional stop failure alert",
    );
    const beforeRetry = await evaluate(
      client,
      `(() => ({
        mapCount: document.querySelectorAll(".goassist-leaflet-map").length,
        retryButtonPresent: Boolean(
          document.querySelector('[aria-label="Retry loading bus stops"]'),
        ),
        failureCount: window.__goassistRegionalFailureCount ?? 0,
      }))()`,
    );
    const retryClicked = await evaluate(
      client,
      `(() => {
        const retry = document.querySelector('[aria-label="Retry loading bus stops"]');
        if (!retry) return false;
        retry.click();
        return true;
      })()`,
    );
    if (!retryClicked)
      throw new Error("Could not activate the bus-stop Retry control.");
    await waitFor(
      client,
      `document.querySelectorAll(".goassist-stop-marker, .goassist-leaflet-cluster").length > 0 &&
        !document.body?.innerText.includes("Unable to load bus stops")`,
      "regional markers after Retry",
      30_000,
    );
    const afterRetry = await evaluate(
      client,
      `(() => ({
        mapCount: document.querySelectorAll(".goassist-leaflet-map").length,
        markerSurfaceCount: document.querySelectorAll(
          ".goassist-stop-marker, .goassist-leaflet-cluster",
        ).length,
        alertPresent: Boolean(document.querySelector('[role="alert"]')),
      }))()`,
    );
    retryRecovery = { beforeRetry, afterRetry };
    if (
      beforeRetry.mapCount !== 1 ||
      !beforeRetry.retryButtonPresent ||
      beforeRetry.failureCount !== 1 ||
      afterRetry.mapCount !== 1 ||
      afterRetry.markerSurfaceCount < 1 ||
      afterRetry.alertPresent
    ) {
      throw new Error(
        `Regional Retry recovery failed: ${JSON.stringify(retryRecovery)}`,
      );
    }
  }
  await waitFor(
    client,
    `document.querySelectorAll(".goassist-stop-marker, .goassist-leaflet-cluster").length > 0`,
    "regional stop markers or clusters",
    30_000,
  );

  const results = [];
  for (const width of WIDTHS) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: VIEWPORT_HEIGHT,
    });
    await delay(900);

    const metrics = await evaluate(
      client,
      `(() => {
        const attribution = document.querySelector(".leaflet-control-attribution");
        const rect = attribution?.getBoundingClientRect();
        const style = attribution ? getComputedStyle(attribution) : null;
        const nearbySheet = document.querySelector('[aria-label^="Nearby bus stops,"]');
        const bottomTabs = [...document.querySelectorAll('[aria-label*=", tab,"]')];
        const mapRect = document.querySelector(".goassist-leaflet-map")
          ?.getBoundingClientRect();
        const emptyRoundedOverlays = [...document.querySelectorAll("body *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const elementStyle = getComputedStyle(element);
            const color = elementStyle.backgroundColor.match(/[\\d.]+/g)?.slice(0, 3)
              .map(Number) ?? [];
            const paleSurface = color.length === 3 && color.every((channel) => channel >= 238);
            const overlapsMap = mapRect && rect.right > mapRect.left &&
              rect.left < mapRect.right && rect.bottom > mapRect.top && rect.top < mapRect.bottom;
            return Boolean(
              overlapsMap && paleSurface && parseFloat(elementStyle.borderRadius) >= 6 &&
              rect.width >= 24 && rect.height >= 18 &&
              !element.textContent?.trim() &&
              !element.closest(".goassist-user-puck") &&
              !element.querySelector("svg, img, input, canvas") &&
              elementStyle.display !== "none" && elementStyle.visibility !== "hidden"
            );
          })
          .map((element) => ({
            tag: element.tagName,
            className: String(element.className).slice(0, 120),
            ariaLabel: element.getAttribute("aria-label"),
          }));
        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          mapCount: document.querySelectorAll(".goassist-leaflet-map").length,
          markerCount: document.querySelectorAll(".goassist-stop-marker").length,
          clusterCount: document.querySelectorAll(".goassist-leaflet-cluster").length,
          customMapControls: [
            'Centre map on my current location',
            'Show nearby bus stops in this area',
            'More',
          ].filter((label) => document.querySelector('[aria-label="' + label + '"]')).length,
          keyboardMapInteractive:
            document.querySelector(".leaflet-container")?.tabIndex === 0,
          attributionVisible: Boolean(
            attribution && rect && rect.width > 0 && rect.height > 0 &&
            style?.display !== "none" && style?.visibility !== "hidden"
          ),
          nearbySheetOpen: Boolean(nearbySheet),
          bottomNavigationVisible:
            bottomTabs.length === 3 &&
            bottomTabs.every((tab) => {
              const tabRect = tab.getBoundingClientRect();
              const tabStyle = getComputedStyle(tab);
              return tabRect.width > 0 && tabRect.height >= 44 &&
                tabStyle.display !== "none" && tabStyle.visibility !== "hidden";
            }),
          leafletTooltipCount: document.querySelectorAll(".leaflet-tooltip").length,
          leafletPopupCount: document.querySelectorAll(".leaflet-popup").length,
          emptyRoundedOverlays,
        };
      })()`,
    );

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = join(outputDir, `journey-map-${width}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    results.push({ width, screenshotPath, ...metrics });
  }

  const locateClicked = await evaluate(
    client,
    `(() => {
      const locate = document.querySelector('[aria-label="Centre map on my current location"]');
      if (!locate) return false;
      locate.click();
      return true;
    })()`,
  );
  if (!locateClicked) throw new Error("Could not activate the Locate control.");
  await waitFor(
    client,
    `Boolean(document.querySelector('[aria-label^="Your location"]'))`,
    "the stable user-location marker",
  );
  const userMarkerBeforeRefresh = true;

  const clusterZoomBefore = await evaluate(client, tileZoomExpression);
  const activatedClusterLabel = await evaluate(
    client,
    `(() => {
      const cluster = document.querySelector(".goassist-leaflet-cluster");
      if (!cluster) return null;
      const label = cluster.getAttribute("aria-label");
      cluster.click();
      return label;
    })()`,
  );
  if (!activatedClusterLabel) {
    throw new Error("Could not activate a rendered marker cluster.");
  }
  await waitFor(
    client,
    `${tileZoomExpression} > ${clusterZoomBefore}`,
    "the cluster to expand the map zoom",
  );
  const clusterZoomAfter = await evaluate(client, tileZoomExpression);

  await waitFor(
    client,
    `Boolean(document.querySelector('.goassist-stop-marker-default[aria-label^="Bus stop "]'))`,
    "an individual bus-stop marker after cluster expansion",
  );
  const selectedMarkerLabel = await evaluate(
    client,
    `(() => {
      const marker = document.querySelector('.goassist-stop-marker-default[aria-label^="Bus stop "]');
      if (!marker) return null;
      marker.click();
      return marker.getAttribute("aria-label");
    })()`,
  );
  await waitFor(
    client,
    `Boolean(document.querySelector('.goassist-stop-marker-selected[aria-label^="Selected bus stop "]'))`,
    "selected-stop marker styling",
  );

  const refreshTriggered = await evaluate(
    client,
    `(() => {
      const cluster = document.querySelector(".goassist-leaflet-cluster");
      if (cluster) {
        cluster.click();
        return "cluster";
      }
      const map = document.querySelector(".leaflet-container");
      if (!map) return null;
      map.focus();
      map.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Equal",
        key: "+",
        keyCode: 187,
        which: 187,
      }));
      return "keyboard-zoom";
    })()`,
  );
  if (!refreshTriggered) throw new Error("Could not trigger a map refresh.");
  await delay(1_800);
  const selectionPersisted = await evaluate(
    client,
    `Boolean(document.querySelector('.goassist-stop-marker-selected[aria-label^="Selected bus stop "]'))`,
  );
  if (!selectionPersisted) {
    throw new Error("Selected stop did not persist after a map refresh.");
  }
  const userMarkerAfterRefresh = await evaluate(
    client,
    `Boolean(document.querySelector('[aria-label^="Your location"]'))`,
  );
  if (!userMarkerAfterRefresh) {
    throw new Error("User marker did not persist after regional stop refresh.");
  }

  const interactions = {
    activatedClusterLabel,
    clusterZoomBefore,
    clusterZoomAfter,
    selectedMarkerLabel,
    refreshTriggered,
    selectionPersisted,
    userMarkerBeforeRefresh,
    userMarkerAfterRefresh,
  };

  let uiRefinementResults = null;
  let uiRefinementControls = null;
  let uiRefinementEmptySearch = null;
  if (uiRefinementMode) {
    await evaluate(
      client,
      `(() => {
        const input = document.querySelector('[aria-label="Search bus stop, service or place"]');
        input?.focus();
        input?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      })()`,
    );
    await waitFor(
      client,
      `Boolean(document.querySelector('[aria-label="Close search"]'))`,
      "the empty search overlay",
    );
    const emptySearchViewports = [];
    for (const width of WIDTHS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });
      await delay(250);
      const metrics = await evaluate(
        client,
        `({
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          promptVisible: document.body.innerText.includes("Search for a bus stop or place"),
          searchResultsShellCount: document.querySelectorAll('[data-testid="search-results-shell"]').length,
        })`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDir,
        `empty-map-search-${width}x${VIEWPORT_HEIGHT}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      emptySearchViewports.push({ width, screenshotPath, ...metrics });
    }
    const emptySearchFailures = emptySearchViewports.flatMap((result) => {
      const messages = [];
      if (result.viewportWidth !== result.width)
        messages.push("viewport width mismatch");
      if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
      if (!result.promptVisible) messages.push("empty-search guidance missing");
      if (result.searchResultsShellCount)
        messages.push("empty search-results shell mounted");
      return messages.map((message) => `${result.width}px: ${message}`);
    });
    if (emptySearchFailures.length) {
      throw new Error(emptySearchFailures.join("\n"));
    }
    const whitespaceAndValidSearch = await evaluate(
      client,
      `(async () => {
        const updateInput = async (value) => {
          const inputs = [...document.querySelectorAll('[aria-label="Search bus stop, service or place"]')];
          const input = inputs.at(-1);
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (!input || !setter) return false;
          setter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 100));
          return true;
        };
        const whitespaceUpdated = await updateInput("   ");
        const whitespaceShellCount = document.querySelectorAll('[data-testid="search-results-shell"]').length;
        const validUpdated = await updateInput("Kent Ridge");
        const validShellCount = document.querySelectorAll('[data-testid="search-results-shell"]').length;
        return {
          whitespaceUpdated,
          whitespaceShellCount,
          validUpdated,
          validShellCount,
        };
      })()`,
    );
    if (
      !whitespaceAndValidSearch.whitespaceUpdated ||
      whitespaceAndValidSearch.whitespaceShellCount !== 0 ||
      !whitespaceAndValidSearch.validUpdated ||
      whitespaceAndValidSearch.validShellCount !== 1
    ) {
      throw new Error(
        `Search shell conditional failed: ${JSON.stringify(whitespaceAndValidSearch)}`,
      );
    }
    uiRefinementEmptySearch = {
      viewports: emptySearchViewports,
      whitespaceAndValidSearch,
    };
    await evaluate(
      client,
      `document.querySelector('[aria-label="Close search"]')?.click()`,
    );
    await waitFor(
      client,
      `!document.querySelector('[aria-label="Close search"]')`,
      "search overlay to close",
    );
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 430,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 430,
      screenHeight: VIEWPORT_HEIGHT,
    });
    await evaluate(
      client,
      `document.querySelector('[aria-label="Centre map on my current location"]')?.click()`,
    );
    await waitFor(
      client,
      `Boolean(document.querySelector('[aria-label^="Recommended bus stop Opp Yusof Ishak House"], [aria-label^="Bus stop Opp Yusof Ishak House"]'))`,
      "the representative stop marker",
    );
    await evaluate(
      client,
      `document.querySelector('[aria-label^="Recommended bus stop Opp Yusof Ishak House"], [aria-label^="Bus stop Opp Yusof Ishak House"]')?.click()`,
    );
    await waitFor(
      client,
      `Boolean(document.querySelector('[aria-label="Bus service 183"]'))`,
      "representative service chips",
    );
    await evaluate(
      client,
      `document.querySelector('[aria-label="Bus service 183"]')?.click()`,
    );
    await waitFor(
      client,
      `Boolean(document.querySelector('[aria-label="Bus service 183, selected"]'))`,
      "selected service state",
    );

    const selectedStopResults = [];
    for (const width of WIDTHS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });
      await delay(700);
      const metrics = await evaluate(
        client,
        `(() => {
          const contrastRatio = (foreground, background) => {
            const luminance = (color) => {
              const channels = color.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [];
              const linear = channels.map((channel) => {
                const value = channel / 255;
                return value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
            };
            const values = [luminance(foreground), luminance(background)]
              .sort((a, b) => b - a);
            return (values[0] + 0.05) / (values[1] + 0.05);
          };
          const services = ["151", "183", "188", "190", "200"].map((service) => {
            const button = document.querySelector(
              '[aria-label="Bus service ' + service + '"]' +
              ', [aria-label="Bus service ' + service + ', selected"]',
            );
            const text = [...(button?.querySelectorAll("div, span") ?? [])]
              .find((node) => node.textContent?.trim() === service);
            const rect = button?.getBoundingClientRect();
            const buttonStyle = button ? getComputedStyle(button) : null;
            const textStyle = text ? getComputedStyle(text) : null;
            return {
              service,
              present: Boolean(button && text),
              height: rect?.height ?? 0,
              left: rect?.left ?? 0,
              right: rect?.right ?? 0,
              top: rect?.top ?? 0,
              selected:
                button?.getAttribute("aria-selected") === "true" ||
                button
                  ?.getAttribute("aria-label")
                  ?.endsWith(", selected") === true,
              iconCount: button?.querySelectorAll("svg").length ?? 0,
              contrast: buttonStyle && textStyle
                ? contrastRatio(textStyle.color, buttonStyle.backgroundColor)
                : 0,
            };
          });
          const serviceButtons = services.filter((service) => service.present);
          const serviceRowLeft = Math.min(...serviceButtons.map((service) => service.left));
          const serviceRowRight = Math.max(...serviceButtons.map((service) => service.right));
          const ctaText = [...document.querySelectorAll("div, span")].find(
            (node) => node.textContent?.trim() === "Choose this stop",
          );
          const cta = ctaText?.closest('[role="button"], button');
          const navigationText = [...document.querySelectorAll("div, span")].find(
            (node) => node.textContent?.trim() === "Journey" &&
              node.closest('[aria-label^="Journey, tab"]'),
          );
          const navigation = navigationText?.closest('[aria-label^="Journey, tab"]');
          const ctaRect = cta?.getBoundingClientRect();
          const navigationRect = navigation?.getBoundingClientRect();
          const mapRect = document.querySelector(".goassist-leaflet-map")
            ?.getBoundingClientRect();
          const emptyRoundedOverlays = [...document.querySelectorAll("body *")]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              const color = style.backgroundColor.match(/[\\d.]+/g)?.slice(0, 3)
                .map(Number) ?? [];
              const paleSurface = color.length === 3 && color.every((channel) => channel >= 238);
              const overlapsMap = mapRect && rect.right > mapRect.left &&
                rect.left < mapRect.right && rect.bottom > mapRect.top && rect.top < mapRect.bottom;
              return Boolean(
                overlapsMap && paleSurface && parseFloat(style.borderRadius) >= 6 &&
                rect.width >= 24 && rect.height >= 18 &&
                !element.textContent?.trim() &&
                !element.closest(".goassist-user-puck") &&
                !element.querySelector("svg, img, input, canvas") &&
                style.display !== "none" && style.visibility !== "hidden"
              );
            })
            .map((element) => ({
              tag: element.tagName,
              className: String(element.className).slice(0, 120),
              ariaLabel: element.getAttribute("aria-label"),
            }));
          const attribution = document.querySelector(".leaflet-control-attribution");
          return {
            services,
            servicesClipped: serviceRowLeft < 0 || serviceRowRight > window.innerWidth,
            serviceRowCount: new Set(serviceButtons.map((service) => Math.round(service.top))).size,
            selectedServiceHasCheckmark:
              services.find((service) => service.service === "183")?.iconCount >= 1,
            selectedServiceClear:
              services.find((service) => service.service === "183")?.selected === true,
            leafletTooltipCount: document.querySelectorAll(".leaflet-tooltip").length,
            leafletPopupCount: document.querySelectorAll(".leaflet-popup").length,
            emptyRoundedOverlays,
            userLabelCount: [...document.querySelectorAll('[data-user-location-label="true"]')]
              .filter((label) => label.textContent?.trim() === "You").length,
            validMarkerTitle: (() => {
              const marker = document.querySelector(
                '[aria-label^="Selected bus stop Opp Yusof Ishak House"]',
              );
              return Boolean(marker?.getAttribute("title")?.trim());
            })(),
            attributionVisible: Boolean(attribution?.textContent?.trim()),
            ctaVisible: Boolean(ctaRect && ctaRect.width > 0 && ctaRect.height > 0),
            ctaAboveNavigation: Boolean(
              ctaRect && navigationRect && ctaRect.bottom <= navigationRect.top + 1,
            ),
            navigationVisible: Boolean(
              navigationRect && navigationRect.top >= 0 &&
              navigationRect.bottom <= window.innerHeight + 1,
            ),
          };
        })()`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDir,
        `selected-stop-services-${width}x${VIEWPORT_HEIGHT}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      selectedStopResults.push({ width, screenshotPath, ...metrics });
    }

    const uiFailures = selectedStopResults.flatMap((result) => {
      const messages = [];
      if (result.services.some((service) => !service.present))
        messages.push("service number missing");
      if (result.services.some((service) => service.height < 44))
        messages.push("service touch target below 44px");
      if (result.services.some((service) => service.contrast < 4.5))
        messages.push("service contrast below 4.5:1");
      if (result.servicesClipped) messages.push("service chips clipped");
      if (!result.selectedServiceClear || !result.selectedServiceHasCheckmark)
        messages.push("selected service state unclear");
      if (result.leafletTooltipCount || result.leafletPopupCount)
        messages.push("unexpected Leaflet tooltip or popup");
      if (result.emptyRoundedOverlays.length)
        messages.push("empty rounded overlay detected");
      if (result.userLabelCount !== 0)
        messages.push("permanent user label present");
      if (!result.validMarkerTitle) messages.push("valid marker title missing");
      if (!result.attributionVisible) messages.push("attribution hidden");
      if (!result.ctaVisible || !result.ctaAboveNavigation)
        messages.push("primary action obstructed by navigation");
      if (!result.navigationVisible) messages.push("bottom navigation hidden");
      return messages.map((message) => `${result.width}px: ${message}`);
    });
    if (uiFailures.length) throw new Error(uiFailures.join("\n"));
    uiRefinementResults = selectedStopResults;

    const userMarkerBeforeControls = await evaluate(
      client,
      `(() => {
        const rect = document.querySelector('[aria-label^="Your location"]')
          ?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top } : null;
      })()`,
    );
    await evaluate(
      client,
      `document.querySelector('[aria-label="Show nearby bus stops in this area"]')?.click()`,
    );
    await waitFor(
      client,
      `Boolean(document.querySelector('[aria-label="Nearby bus stops"]'))`,
      "the Nearby sheet to open",
    );
    const nearbyWorks = true;
    await evaluate(
      client,
      `document.querySelector('[aria-label="More"]')?.click()`,
    );
    await waitFor(
      client,
      `document.body?.innerText.includes("Map options")`,
      "the More map options to open",
    );
    const userMarkerAfterControls = await evaluate(
      client,
      `(() => {
        const rect = document.querySelector('[aria-label^="Your location"]')
          ?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top } : null;
      })()`,
    );
    const userMarkerStable = Boolean(
      userMarkerBeforeControls &&
      userMarkerAfterControls &&
      Math.abs(userMarkerBeforeControls.left - userMarkerAfterControls.left) <=
        1 &&
      Math.abs(userMarkerBeforeControls.top - userMarkerAfterControls.top) <= 1,
    );
    if (!userMarkerStable) {
      throw new Error("User marker moved while opening Nearby and More.");
    }
    uiRefinementControls = {
      locateWorks: userMarkerBeforeRefresh,
      nearbyWorks,
      moreWorks: true,
      userMarkerStable,
    };
  }

  let directionsResults = null;
  if (directionsMode) {
    await evaluate(
      client,
      `(() => {
        const close = document.querySelector('[aria-label="Close map options"]');
        close?.click();
      })()`,
    );
    await delay(250);
    const directionsClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Directions");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!directionsClicked) {
      throw new Error(
        "Could not activate walking Directions for the selected stop.",
      );
    }
    try {
      await waitFor(
        client,
        `Boolean(document.querySelector(".goassist-walking-route-primary")) &&
          document.body?.innerText.includes("Start guidance")`,
        "a real walking route and directions summary",
        45_000,
      );
    } catch (error) {
      const diagnostic = await evaluate(
        client,
        `({
          requests: window.__goassistWalkingRouteRequests ?? [],
          responses: window.__goassistWalkingRouteResponses ?? [],
          directionsText: [...document.querySelectorAll('[aria-label^="Walking directions to "]')]
            .map((node) => node.innerText)
            .join("\\n"),
          overlayPaths: [...document.querySelectorAll('.leaflet-overlay-pane path')]
            .map((path) => ({
              className: path.getAttribute('class'),
              dLength: path.getAttribute('d')?.length ?? 0,
              stroke: path.getAttribute('stroke'),
            })),
        })`,
      );
      throw new Error(
        `${error.message}\n${JSON.stringify(diagnostic, null, 2)}`,
      );
    }

    const directionViewports = [];
    for (const width of WIDTHS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });
      await delay(650);
      const metrics = await evaluate(
        client,
        `(() => {
          const primaryRoute = document.querySelector(".goassist-walking-route-primary");
          const routePath = primaryRoute?.getAttribute("d") ?? "";
          const routeSegments = (routePath.match(/[Ll]/g) ?? []).length;
          const userPuck = document.querySelector(".goassist-user-puck");
          const destination = document.querySelector(".goassist-destination-marker");
          const userPuckRect = userPuck?.getBoundingClientRect();
          const destinationRect = destination?.getBoundingClientRect();
          const summary = document.querySelector(
            '[aria-label^="Walking directions, approximately"]',
          );
          const startText = [...document.querySelectorAll("div, span")]
            .find((node) => node.textContent?.trim() === "Start guidance");
          const startButton = startText?.closest('[role="button"], button');
          const startRect = startButton?.getBoundingClientRect();
          const mapRect = document.querySelector(".goassist-leaflet-map")
            ?.getBoundingClientRect();
          const directionsRect = document.querySelector(
            '[aria-label^="Walking directions to "]',
          )?.getBoundingClientRect();
          const bottomTabs = [...document.querySelectorAll('[aria-label*=" tab,"]')];
          const navigationTop = Math.min(
            ...bottomTabs.map((tab) => tab.getBoundingClientRect().top),
          );
          const visibleMapBottom = Math.min(
            directionsRect?.top ?? window.innerHeight,
            Number.isFinite(navigationTop) ? navigationTop : window.innerHeight,
          );
          const permanentYouLabels = document.querySelectorAll(
            '[data-user-location-label="true"]',
          ).length;
          return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            hasHorizontalOverflow:
              document.documentElement.scrollWidth > window.innerWidth + 1,
            routePrimaryCount: document.querySelectorAll(
              ".goassist-walking-route-primary",
            ).length,
            routeOutlineCount: document.querySelectorAll(
              ".goassist-walking-route-outline",
            ).length,
            routeSegments,
            userPuckVisible: Boolean(
              userPuckRect && mapRect && userPuckRect.width >= 40 &&
              userPuckRect.top >= mapRect.top && userPuckRect.bottom <= visibleMapBottom,
            ),
            destinationVisible: Boolean(
              destinationRect && mapRect && destinationRect.width >= 30 &&
              destinationRect.top >= mapRect.top &&
              destinationRect.bottom <= visibleMapBottom,
            ),
            summaryVisible: Boolean(summary),
            startGuidanceReachable: Boolean(
              startRect && startRect.top >= 0 &&
              startRect.bottom <= (Number.isFinite(navigationTop)
                ? navigationTop
                : window.innerHeight),
            ),
            mapStillVisible: Boolean(
              mapRect && directionsRect && directionsRect.top - mapRect.top >= 170,
            ),
            searchUsable: Boolean(
              document.querySelector('[aria-label="Search bus stop, service or place"]'),
            ),
            bottomNavigationVisible:
              bottomTabs.length === 3 &&
              bottomTabs.every((tab) => {
                const rect = tab.getBoundingClientRect();
                return rect.width > 0 && rect.height >= 44 &&
                  rect.bottom <= window.innerHeight + 1;
              }),
            permanentYouLabels,
            routingAttributionVisible:
              document.body?.innerText.includes("Routing © OpenStreetMap contributors") &&
              document.body?.innerText.includes("Report a map issue"),
            routingRequestCount:
              window.__goassistWalkingRouteRequests?.length ?? 0,
          };
        })()`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDir,
        `walking-directions-${width}x${VIEWPORT_HEIGHT}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      directionViewports.push({ width, screenshotPath, ...metrics });
    }

    const directionFailures = directionViewports.flatMap((result) => {
      const messages = [];
      if (result.viewportWidth !== result.width)
        messages.push("viewport width mismatch");
      if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
      if (result.routePrimaryCount !== 1 || result.routeOutlineCount !== 1)
        messages.push("outlined walking route missing");
      if (result.routeSegments < 2)
        messages.push("routed geometry did not contain multiple segments");
      if (!result.userPuckVisible) messages.push("user puck hidden");
      if (!result.destinationVisible)
        messages.push("destination marker hidden");
      if (!result.summaryVisible) messages.push("directions summary hidden");
      if (!result.startGuidanceReachable)
        messages.push("Start guidance unreachable");
      if (!result.mapStillVisible)
        messages.push("directions sheet covers the map");
      if (!result.searchUsable) messages.push("search unusable");
      if (!result.bottomNavigationVisible)
        messages.push("bottom navigation hidden");
      if (result.permanentYouLabels !== 0)
        messages.push("permanent You bubble present");
      if (!result.routingAttributionVisible)
        messages.push("routing attribution missing");
      if (result.routingRequestCount < 1)
        messages.push("walking provider was not requested");
      return messages.map((message) => `${result.width}px: ${message}`);
    });
    if (directionFailures.length) {
      throw new Error(directionFailures.join("\n"));
    }

    const routingRequestUrl = await evaluate(
      client,
      `window.__goassistWalkingRouteRequests?.[0] ?? null`,
    );
    if (!routingRequestUrl) {
      throw new Error("No walking provider request was observed.");
    }
    const routeCoordinateMatch = decodeURIComponent(routingRequestUrl).match(
      /\/route\/v1\/[^/]+\/([^?]+)/,
    );
    const destinationPart = routeCoordinateMatch?.[1]?.split(";")[1];
    const [destinationLongitude, destinationLatitude] = (destinationPart ?? "")
      .split(",")
      .map(Number);
    if (
      !Number.isFinite(destinationLatitude) ||
      !Number.isFinite(destinationLongitude)
    ) {
      throw new Error(`Could not read destination from ${routingRequestUrl}`);
    }

    const guidanceClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Start guidance");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!guidanceClicked) throw new Error("Could not start walking guidance.");
    await waitFor(
      client,
      `document.body?.innerText.includes("Walking guidance") ||
        document.body?.innerText.includes("You've reached the bus stop")`,
      "active walking guidance",
    );
    const guidanceVisible = true;

    await waitFor(
      client,
      `(window.__goassistSpokenGuidance?.length ?? 0) > 0 &&
        Boolean([...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Repeat guidance"))`,
      "spoken guidance and its Repeat control",
    );
    await delay(800);
    const speechBeforeRepeat = await evaluate(
      client,
      `window.__goassistSpokenGuidance.map((entry) => ({ ...entry }))`,
    );
    const repeatClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Repeat guidance");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!repeatClicked) throw new Error("Could not repeat spoken guidance.");
    await waitFor(
      client,
      `(window.__goassistSpokenGuidance?.length ?? 0) === ${speechBeforeRepeat.length + 1}`,
      "one repeated spoken instruction",
    );
    await delay(800);
    const speechAfterRepeat = await evaluate(
      client,
      `window.__goassistSpokenGuidance.map((entry) => ({ ...entry }))`,
    );
    const repeatedSpeech = speechAfterRepeat.at(-1);
    const speechBeforeRepeatText = speechBeforeRepeat.at(-1)?.text;
    if (
      !speechBeforeRepeatText ||
      repeatedSpeech?.text !== speechBeforeRepeatText ||
      speechAfterRepeat.length !== speechBeforeRepeat.length + 1
    ) {
      throw new Error(
        `Repeat or duplicate suppression failed: ${JSON.stringify({
          speechBeforeRepeat,
          speechAfterRepeat,
        })}`,
      );
    }

    const guidanceViewports = [];
    for (const width of WIDTHS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });
      await delay(450);
      const metrics = await evaluate(
        client,
        `(() => {
          const card = [...document.querySelectorAll('[aria-label]')]
            .find((node) => /, (?:\\d+ m|\\d+(?:\\.\\d+)? km)\\.$/
              .test(node.getAttribute("aria-label") ?? ""));
          const cardRect = card?.getBoundingClientRect();
          const textSizes = [...(card?.querySelectorAll("div, span") ?? [])]
            .map((node) => parseFloat(getComputedStyle(node).fontSize))
            .filter(Number.isFinite);
          const iconSizes = [...(card?.querySelectorAll("svg") ?? [])]
            .map((icon) => icon.getBoundingClientRect())
            .map((rect) => Math.min(rect.width, rect.height));
          const puckPulse = document.querySelector(".goassist-user-puck-pulse");
          return {
            cardVisible: Boolean(
              cardRect && cardRect.width > 0 && cardRect.height > 0 &&
              cardRect.left >= 0 && cardRect.right <= window.innerWidth + 1
            ),
            documentWidth: document.documentElement.scrollWidth,
            hasHorizontalOverflow:
              document.documentElement.scrollWidth > window.innerWidth + 1,
            headingFallbackWorks:
              !document.querySelector('[data-user-heading="true"]') &&
              Boolean(document.querySelector('[aria-label="Your location"]')),
            instructionFontSize: textSizes.length ? Math.max(...textSizes) : 0,
            maneuverIconSize: iconSizes.length ? Math.max(...iconSizes) : 0,
            reducedMotionMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
            reducedMotionPulseStopped:
              !puckPulse || getComputedStyle(puckPulse).animationName === "none",
            viewportWidth: window.innerWidth,
          };
        })()`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDir,
        `walking-guidance-${width}x${VIEWPORT_HEIGHT}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      guidanceViewports.push({ width, screenshotPath, ...metrics });
    }
    const guidanceViewportFailures = guidanceViewports.flatMap((result) => {
      const messages = [];
      if (result.viewportWidth !== result.width)
        messages.push("viewport width mismatch");
      if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
      if (!result.cardVisible)
        messages.push("current instruction card clipped or hidden");
      if (result.instructionFontSize < 25)
        messages.push("current instruction is not prominent");
      if (result.maneuverIconSize < 34)
        messages.push("maneuver icon was allowed to shrink");
      if (!result.headingFallbackWorks)
        messages.push("heading-unavailable fallback missing");
      if (!result.reducedMotionMatches || !result.reducedMotionPulseStopped)
        messages.push("Reduced Motion did not stop the puck pulse");
      return messages.map((message) => `${result.width}px: ${message}`);
    });
    if (guidanceViewportFailures.length) {
      throw new Error(
        `${guidanceViewportFailures.join("\n")}\n${JSON.stringify(
          guidanceViewports,
          null,
          2,
        )}`,
      );
    }

    const exitGuidanceClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Exit guidance");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!exitGuidanceClicked)
      throw new Error("Could not exit walking guidance.");
    await waitFor(
      client,
      `document.body?.innerText.includes("Bus stop details") &&
        !document.querySelector(".goassist-walking-route-primary")`,
      "bus-stop details after exiting guidance",
    );
    const guidanceExitViewports = [];
    for (const width of WIDTHS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: VIEWPORT_HEIGHT,
      });
      await delay(300);
      const metrics = await evaluate(
        client,
        `(() => {
          const selectedSheet = document.querySelector('[aria-label^="Selected stop "]');
          const bottomNavigation = document.querySelector('[aria-label^="Journey, tab,"]')
            ?.parentElement?.parentElement;
          const emptyStopMarkers = [...document.querySelectorAll(".goassist-stop-marker > span")]
            .filter((marker) => !marker.textContent?.trim() && !marker.querySelector("svg"));
          const emptyStatusPills = [...document.querySelectorAll('[data-testid="map-status-pill"]')]
            .filter((pill) => !pill.textContent?.trim());
          return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            hasHorizontalOverflow:
              document.documentElement.scrollWidth > window.innerWidth + 1,
            selectedStopDetailsVisible: Boolean(selectedSheet) &&
              document.body.innerText.includes("Bus stop details"),
            selectedSheetHeight: selectedSheet?.getBoundingClientRect().height ?? 0,
            routePrimaryCount: document.querySelectorAll(".goassist-walking-route-primary").length,
            routeOutlineCount: document.querySelectorAll(".goassist-walking-route-outline").length,
            currentInstructionCount: document.querySelectorAll('[data-testid="walking-current-instruction"]').length,
            guidanceTextVisible: document.body.innerText.includes("Walking guidance"),
            userPuckVisible: Boolean(document.querySelector(".goassist-user-puck")),
            userPuckPulsed: Boolean(document.querySelector(".goassist-user-puck-pulsed")),
            freeMapControlVisible: Boolean(document.querySelector('[aria-label="Centre map on my current location"]')),
            bottomNavigationVisible: Boolean(bottomNavigation) &&
              bottomNavigation.getBoundingClientRect().bottom <= window.innerHeight + 1,
            emptyStopMarkerCount: emptyStopMarkers.length,
            emptyStatusPillCount: emptyStatusPills.length,
          };
        })()`,
      );
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = join(
        outputDir,
        `walking-guidance-exit-${width}x${VIEWPORT_HEIGHT}.png`,
      );
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      guidanceExitViewports.push({ width, screenshotPath, ...metrics });
    }
    const guidanceExitFailures = guidanceExitViewports.flatMap((result) => {
      const messages = [];
      if (result.viewportWidth !== result.width)
        messages.push("viewport width mismatch");
      if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
      if (
        !result.selectedStopDetailsVisible ||
        result.selectedSheetHeight < 250
      )
        messages.push(
          "selected-stop details did not return at a useful height",
        );
      if (result.routePrimaryCount || result.routeOutlineCount)
        messages.push("walking route remained mounted");
      if (result.currentInstructionCount || result.guidanceTextVisible)
        messages.push("guidance UI remained mounted");
      if (!result.userPuckVisible || result.userPuckPulsed)
        messages.push("user puck was removed or remained pulsed");
      if (!result.freeMapControlVisible)
        messages.push("map remained in follow mode");
      if (!result.bottomNavigationVisible)
        messages.push("bottom navigation was obscured");
      if (result.emptyStopMarkerCount || result.emptyStatusPillCount)
        messages.push("an empty map overlay remained mounted");
      return messages.map((message) => `${result.width}px: ${message}`);
    });
    if (guidanceExitFailures.length) {
      throw new Error(
        `${guidanceExitFailures.join("\n")}\n${JSON.stringify(
          guidanceExitViewports,
          null,
          2,
        )}`,
      );
    }
    const exitGuidanceWorks = true;

    await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Directions");
        label?.closest('[role="button"], button')?.click();
      })()`,
    );
    await waitFor(
      client,
      `document.body?.innerText.includes("Start guidance")`,
      "cached walking directions",
    );
    const cachedRoutingRequestCount = await evaluate(
      client,
      `window.__goassistWalkingRouteRequests?.length ?? 0`,
    );
    if (cachedRoutingRequestCount !== 1) {
      throw new Error(
        `Immediate route reuse bypassed the cache: ${cachedRoutingRequestCount} requests.`,
      );
    }
    await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Start guidance");
        label?.closest('[role="button"], button')?.click();
      })()`,
    );
    await waitFor(
      client,
      `document.body?.innerText.includes("Walking guidance")`,
      "the second clean guidance session",
    );
    const backExitClicked = await evaluate(
      client,
      `(() => {
        const back = document.querySelector('[aria-label="Back to bus stop details"]');
        if (!back) return false;
        back.click();
        return true;
      })()`,
    );
    if (!backExitClicked) {
      throw new Error("Could not exit the second guidance session with Back.");
    }
    await waitFor(
      client,
      `document.body?.innerText.includes("Bus stop details") &&
        !document.querySelector(".goassist-walking-route-primary") &&
        !document.querySelector('[data-testid="walking-current-instruction"]')`,
      "bus-stop details after Back exits guidance",
    );
    const backExitGuidanceWorks = await evaluate(
      client,
      `Boolean(document.querySelector(".goassist-user-puck")) &&
        !document.querySelector(".goassist-user-puck-pulsed") &&
        Boolean(document.querySelector('[aria-label="Centre map on my current location"]'))`,
    );
    if (!backExitGuidanceWorks) {
      throw new Error(
        "Back left stale guidance, pulse, or follow state behind.",
      );
    }
    await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Directions");
        label?.closest('[role="button"], button')?.click();
      })()`,
    );
    await waitFor(
      client,
      `document.body?.innerText.includes("Start guidance")`,
      "cached directions after Back",
    );
    await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Start guidance");
        label?.closest('[role="button"], button')?.click();
      })()`,
    );
    await waitFor(
      client,
      `document.body?.innerText.includes("Walking guidance")`,
      "guidance restart after Back",
    );

    const originPart = routeCoordinateMatch?.[1]?.split(";")[0];
    const [originLongitude, originLatitude] = (originPart ?? "")
      .split(",")
      .map(Number);
    if (!Number.isFinite(originLatitude) || !Number.isFinite(originLongitude)) {
      throw new Error(`Could not read origin from ${routingRequestUrl}`);
    }
    const approximateStraightDistance = Math.hypot(
      (destinationLatitude - originLatitude) * 111_320,
      (destinationLongitude - originLongitude) *
        111_320 *
        Math.cos((originLatitude * Math.PI) / 180),
    );
    const thresholdFraction = Math.min(
      0.9,
      Math.max(0.1, 1 - 65 / Math.max(1, approximateStraightDistance)),
    );
    const thresholdCoordinate = {
      latitude:
        originLatitude +
        (destinationLatitude - originLatitude) * thresholdFraction,
      longitude:
        originLongitude +
        (destinationLongitude - originLongitude) * thresholdFraction,
    };
    const speechBeforeThreshold = await evaluate(
      client,
      `window.__goassistSpokenGuidance.length`,
    );
    await client.send("Emulation.setGeolocationOverride", {
      ...thresholdCoordinate,
      accuracy: 8,
    });
    await waitFor(
      client,
      `window.__goassistSpokenGuidance.length > ${speechBeforeThreshold}`,
      "a turn or distance-threshold instruction",
      15_000,
    );
    const thresholdGuidanceChanged = true;

    const poorAccuracyCoordinates = [0, 1, 2].map((index) => ({
      latitude: originLatitude + 0.0015 + index * 0.0001,
      longitude: originLongitude + 0.0015 + index * 0.0001,
    }));
    for (const coordinate of poorAccuracyCoordinates) {
      await client.send("Emulation.setGeolocationOverride", {
        ...coordinate,
        accuracy: 90,
      });
      await delay(700);
    }
    await waitFor(
      client,
      `document.body?.innerText.includes("Location accuracy is limited")`,
      "the poor-location-accuracy warning",
    );
    const poorAccuracyState = await evaluate(
      client,
      `({
        offRouteVisible: document.body?.innerText.includes("You're off the suggested walking route."),
        warningVisible: document.body?.innerText.includes("Location accuracy is limited"),
        turnNowSpoken: window.__goassistSpokenGuidance
          .slice(${speechBeforeThreshold + 1})
          .some((entry) => /turn .*now/i.test(entry.text)),
      })`,
    );
    if (
      !poorAccuracyState.warningVisible ||
      poorAccuracyState.offRouteVisible ||
      poorAccuracyState.turnNowSpoken
    ) {
      throw new Error(
        `Poor-accuracy protection failed: ${JSON.stringify(poorAccuracyState)}`,
      );
    }

    const offRouteSpeechBefore = await evaluate(
      client,
      `window.__goassistSpokenGuidance.filter((entry) =>
        entry.text.includes("off the suggested walking route")
      ).length`,
    );
    const reliableOffRouteCoordinates = [0, 1, 2].map((index) => ({
      latitude: originLatitude + 0.0018 + index * 0.0001,
      longitude: originLongitude + 0.0018 + index * 0.0001,
    }));
    for (const coordinate of reliableOffRouteCoordinates) {
      await client.send("Emulation.setGeolocationOverride", {
        ...coordinate,
        accuracy: 8,
      });
      await delay(700);
    }
    await waitFor(
      client,
      `document.body?.innerText.includes("You're off the suggested walking route.")`,
      "the stable off-route state",
    );
    await delay(700);
    const offRouteState = await evaluate(
      client,
      `({
        continueAvailable: document.body?.innerText.includes("Continue without rerouting"),
        recalculateAvailable: document.body?.innerText.includes("Recalculate"),
        spokenCount: window.__goassistSpokenGuidance.filter((entry) =>
          entry.text.includes("off the suggested walking route")
        ).length,
      })`,
    );
    if (
      !offRouteState.continueAvailable ||
      !offRouteState.recalculateAvailable ||
      offRouteState.spokenCount !== offRouteSpeechBefore + 1
    ) {
      throw new Error(
        `Stable off-route guidance failed: ${JSON.stringify(offRouteState)}`,
      );
    }

    const recalculateClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Recalculate");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!recalculateClicked)
      throw new Error("Could not recalculate the route.");
    await waitFor(
      client,
      `document.body?.innerText.includes("Start guidance") &&
        window.__goassistWalkingRouteRequests.length >= 2 &&
        window.__goassistSpokenGuidance.some((entry) =>
          entry.text.startsWith("Walking route recalculated."))`,
      "the explicitly recalculated walking route",
      45_000,
    );
    const recalculatedRequestUrl = await evaluate(
      client,
      `window.__goassistWalkingRouteRequests.at(-1)`,
    );
    const recalculatedDestination = decodeURIComponent(recalculatedRequestUrl)
      .match(/\/route\/v1\/[^/]+\/([^?]+)/)?.[1]
      ?.split(";")[1];
    if (recalculatedDestination !== destinationPart) {
      throw new Error("Route recalculation changed the selected destination.");
    }
    await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Start guidance");
        label?.closest('[role="button"], button')?.click();
      })()`,
    );

    const arrivalOffsetLatitude = destinationLatitude + 0.00013;
    await client.send("Emulation.setGeolocationOverride", {
      latitude: arrivalOffsetLatitude,
      longitude: destinationLongitude,
      accuracy: 8,
    });
    await delay(900);
    const arrivalBeforeStableFix = await evaluate(
      client,
      `document.body?.innerText.includes("You've reached the bus stop")`,
    );
    if (arrivalBeforeStableFix) {
      throw new Error("Arrival was declared from one location observation.");
    }
    await client.send("Emulation.setGeolocationOverride", {
      latitude: destinationLatitude,
      longitude: destinationLongitude,
      accuracy: 8,
    });
    await waitFor(
      client,
      `document.body?.innerText.includes("You've reached the bus stop")`,
      "arrival at the selected bus stop",
      30_000,
    );
    await delay(800);
    const arrivalSpeechCount = await evaluate(
      client,
      `window.__goassistSpokenGuidance.filter((entry) =>
        entry.text.startsWith("You've reached the bus stop."))
      .length`,
    );
    if (arrivalSpeechCount !== 1) {
      throw new Error(
        `Arrival speech was not emitted exactly once: ${arrivalSpeechCount}.`,
      );
    }
    const arrivalVisible = true;
    const chooseStopClicked = await evaluate(
      client,
      `(() => {
        const label = [...document.querySelectorAll("div, span")]
          .find((node) => node.textContent?.trim() === "Choose this stop");
        const button = label?.closest('[role="button"], button');
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    if (!chooseStopClicked) {
      throw new Error(
        "Arrival did not offer the existing Choose this stop flow.",
      );
    }
    await waitFor(
      client,
      `document.body?.innerText.includes("Choose your bus")`,
      "service selection after walking arrival",
    );
    directionsResults = {
      arrivalVisible,
      arrivalSpeechCount,
      backExitGuidanceWorks,
      cachePreventedImmediateDuplicateRequest: true,
      chooseStopContinuesJourney: true,
      destination: {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      },
      exitGuidanceWorks,
      guidanceExitViewports,
      guidanceViewports,
      guidanceVisible,
      headingUnavailableFallbackWorks: guidanceViewports.every(
        (result) => result.headingFallbackWorks,
      ),
      noDuplicateSpeech: true,
      offRouteState,
      poorAccuracyState,
      recalculationPreservedDestination: true,
      reducedMotionWorks: guidanceViewports.every(
        (result) => result.reducedMotionPulseStopped,
      ),
      repeatGuidanceWorks: true,
      routeObserved: true,
      routingRequestUrl,
      spokenGuidanceRuntime: await evaluate(
        client,
        `({
          ...window.__goassistSpeechRuntime,
          announcements: window.__goassistSpokenGuidance,
        })`,
      ),
      thresholdGuidanceChanged,
      viewports: directionViewports,
    };
  }

  const failures = results.flatMap((result) => {
    const messages = [];
    if (result.viewportWidth !== result.width)
      messages.push("viewport width mismatch");
    if (result.hasHorizontalOverflow) messages.push("horizontal overflow");
    if (result.mapCount !== 1) messages.push("Leaflet map missing");
    if (result.markerCount + result.clusterCount < 1)
      messages.push("markers and clusters missing");
    if (result.customMapControls !== 3)
      messages.push("custom map controls missing");
    if (!result.keyboardMapInteractive)
      messages.push("map keyboard interaction missing");
    if (!result.attributionVisible) messages.push("attribution hidden");
    if (result.nearbySheetOpen) messages.push("Nearby sheet opened initially");
    if (!result.bottomNavigationVisible)
      messages.push("bottom navigation missing");
    if (result.leafletTooltipCount || result.leafletPopupCount)
      messages.push("unexpected Leaflet tooltip or popup");
    if (result.emptyRoundedOverlays.length)
      messages.push("empty rounded overlay detected");
    return messages.map((message) => `${result.width}px: ${message}`);
  });

  console.log(
    JSON.stringify(
      {
        appUrl: APP_URL,
        outputDir,
        viewportHeight: VIEWPORT_HEIGHT,
        journeyEntryResults,
        results,
        interactions,
        retryRecovery,
        uiRefinementResults,
        uiRefinementControls,
        uiRefinementEmptySearch,
        directionsResults,
      },
      null,
      2,
    ),
  );
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  client?.close();
  browser.kill();
  await Promise.race([
    new Promise((resolveExit) => browser.once("exit", resolveExit)),
    delay(2_000),
  ]);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
