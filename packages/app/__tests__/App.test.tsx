import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import fs from "fs";
import path from "path";
import { AccessibilityInfo, Platform, StyleSheet } from "react-native";
import App, {
  MapStatusPill,
  deriveJourneyNextAction,
  rankStopsForWheelchair,
  shouldStackAccessibilityChoices,
  shouldStackFeatureIllustration,
  shouldStackJourneyEntry,
  shouldStackPreferenceSummary,
} from "../App";
import type {
  BusStopArrivalsResponse,
  BusStopServiceRoutesResponse,
  NearbyBusStopsResponse,
} from "@buspass/shared";

const nearbyStopsResponse: NearbyBusStopsResponse = {
  stops: [
    {
      busStopCode: "18301",
      roadName: "Kent Ridge Cres",
      description: "Kent Ridge Crescent",
      latitude: 1.29398,
      longitude: 103.77104,
      services: ["95", "151", "A1", "A2"],
      distanceMeters: 45,
    },
    {
      busStopCode: "18321",
      roadName: "Kent Ridge Cres",
      description: "Opp Heng Mui Keng Terrace",
      latitude: 1.29295,
      longitude: 103.77508,
      services: ["95", "151", "A1"],
      distanceMeters: 210,
    },
  ],
  debug: {
    latitude: 1.2942,
    longitude: 103.7711,
    accuracyMeters: 0,
    maxDistanceMeters: 500,
  },
};

it("recommends a reachable step-free stop over a closer unavailable stop", () => {
  const ranked = rankStopsForWheelchair(nearbyStopsResponse.stops, {
    "18301": "UNAVAILABLE",
    "18321": "AVAILABLE",
  });
  expect(ranked.map((stop) => stop.busStopCode)).toEqual(["18321", "18301"]);
  expect(
    rankStopsForWheelchair(
      nearbyStopsResponse.stops,
      { "18301": "UNAVAILABLE", "18321": "AVAILABLE" },
      true,
    ).map((stop) => stop.busStopCode),
  ).toEqual(["18321"]);
});

it("derives changing next actions from the canonical journey phase", () => {
  expect(
    deriveJourneyNextAction({
      journeyPhase: "WALKING_TO_STOP",
      selectedStopName: "Yusof Ishak Hse",
      serviceNo: "151",
      walkingInstruction: "Continue along Kent Ridge Crescent.",
      wheelchairAssistance: true,
    }),
  ).toMatchObject({ step: 1, title: "Go to Yusof Ishak Hse" });
  expect(
    deriveJourneyNextAction({
      journeyPhase: "WAITING_FOR_BUS",
      selectedStopName: "Yusof Ishak Hse",
      serviceNo: "151",
      wheelchairAssistance: true,
    }),
  ).toMatchObject({ step: 2, title: "Wait for Service 151" });
  expect(
    deriveJourneyNextAction({
      journeyPhase: "DESTINATION_NEXT",
      destinationName: "Ctrl Lib",
      serviceNo: "151",
      wheelchairAssistance: true,
    }),
  ).toEqual({
    step: 4,
    title: "Prepare to alight",
    detail: "Ctrl Lib is next.",
  });
});

it.each([280, 320, 360, 390, 430])(
  "keeps accessibility choices responsive at %ipx for every text size",
  (width) => {
    const standard = shouldStackAccessibilityChoices({
      width,
      textSize: "STANDARD",
    });
    const large = shouldStackAccessibilityChoices({ width, textSize: "LARGE" });
    const extraLarge = shouldStackAccessibilityChoices({
      width,
      textSize: "EXTRA_LARGE",
    });
    expect(typeof standard).toBe("boolean");
    expect(Number(large)).toBeGreaterThanOrEqual(Number(standard));
    expect(extraLarge).toBe(true);
    if (width <= 320) expect(standard).toBe(true);
    if (width >= 390) expect(standard).toBe(false);
  },
);

it("stacks the accessibility summary before text can crowd the edit control", () => {
  expect(
    shouldStackPreferenceSummary({ width: 526, textSize: "STANDARD" }),
  ).toBe(true);
  expect(
    shouldStackPreferenceSummary({ width: 700, textSize: "STANDARD" }),
  ).toBe(false);
  expect(
    shouldStackPreferenceSummary({ width: 700, textSize: "LARGE" }),
  ).toBe(true);
  expect(
    shouldStackPreferenceSummary({ width: 800, textSize: "LARGE" }),
  ).toBe(false);
  expect(
    shouldStackPreferenceSummary({ width: 800, textSize: "EXTRA_LARGE" }),
  ).toBe(true);
});

it("keeps wheelchair routes visually distinct and exposes located accessibility warnings", () => {
  const mapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );
  expect(mapSource).toContain('routeMobilityMode === "WHEELCHAIR"');
  expect(mapSource).toContain('"goassist-wheelchair-route-primary"');
  expect(mapSource).toContain("dashArray:");
  expect(mapSource).toContain(
    "title={`Accessibility warning: ${warning.label}`}",
  );
  expect(mapSource).toContain("routeWarnings.map");
});

it("gives every Leaflet stop DivIcon meaningful marker content", () => {
  const mapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  expect(mapSource).toContain("const markerContent =");
  expect(mapSource).toContain('<svg aria-hidden="true" viewBox="0 0 16 16"');
  expect(mapSource).toContain("${markerContent}</span>");
  expect(mapSource).not.toContain(
    'const centerContent = kind === "selected" ? "&#10003;" : ""',
  );
});

it.each([undefined, null, "", "   \n\t"])(
  "does not mount a map status pill for an empty message (%p)",
  (message) => {
    const view = render(
      <MapStatusPill message={message} lightMode highContrast={false} />,
    );

    expect(view.queryByTestId("map-status-pill")).toBeNull();
  },
);

it("renders a trimmed, accessible map status message", () => {
  render(
    <MapStatusPill
      message="  Loading nearby stops  "
      lightMode
      highContrast={false}
    />,
  );

  expect(screen.getByTestId("map-status-pill")).toBeTruthy();
  expect(screen.getByText("Loading nearby stops")).toBeTruthy();
  expect(screen.getByLabelText("Loading nearby stops")).toBeTruthy();
});

const exploredAreaResponse: NearbyBusStopsResponse = {
  stops: [
    {
      busStopCode: "19011",
      roadName: "Lower Kent Ridge Rd",
      description: "Kent Ridge MRT Station",
      latitude: 1.29318,
      longitude: 103.78408,
      services: ["95", "151"],
      distanceMeters: 120,
    },
    {
      busStopCode: "19019",
      roadName: "South Buona Vista Rd",
      description: "Opp Kent Ridge Station",
      latitude: 1.29278,
      longitude: 103.78486,
      services: ["95", "200"],
      distanceMeters: 220,
    },
  ],
  debug: {
    latitude: 1.298,
    longitude: 103.7819,
    accuracyMeters: 0,
    maxDistanceMeters: 500,
  },
};

const clusteredStopsResponse: NearbyBusStopsResponse = {
  ...nearbyStopsResponse,
  stops: [
    nearbyStopsResponse.stops[0],
    {
      busStopCode: "18309",
      roadName: "Kent Ridge Cres",
      description: "Opp Kent Ridge Crescent",
      latitude: 1.29429,
      longitude: 103.77125,
      services: ["95"],
      distanceMeters: 60,
    },
    {
      busStopCode: "18311",
      roadName: "Prince George's Park",
      description: "Prince George's Park",
      latitude: 1.29485,
      longitude: 103.77158,
      services: ["A1", "A2"],
      distanceMeters: 72,
    },
  ],
};

const arrivalsResponse: BusStopArrivalsResponse = {
  busStop: {
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
    services: ["95", "151", "A1", "A2"],
  },
  services: [
    {
      serviceNo: "95",
      buses: [
        {
          busId: "SGA-95-001",
          serviceNo: "95",
          arrivalSlot: "NEXT_BUS",
          etaSeconds: 90,
          wheelchairAccessible: true,
          vehicleType: "SD",
          destination: "Kent Ridge Terminal",
        },
      ],
    },
  ],
};

const stop19069 = {
  busStopCode: "19069",
  roadName: "Dover Rd",
  description: "Opp Ayer Rajah Telecoms",
  latitude: 1.30778758326419,
  longitude: 103.77671170466877,
  services: ["33", "196"],
  distanceMeters: 63,
};

const nearby19069Response: NearbyBusStopsResponse = {
  stops: [stop19069],
  debug: {
    latitude: stop19069.latitude,
    longitude: stop19069.longitude,
    accuracyMeters: 0,
    maxDistanceMeters: 800,
  },
};

function routeResponseFor19069(
  serviceNo: "33" | "196",
): BusStopServiceRoutesResponse {
  const terminal =
    serviceNo === "33"
      ? {
          busStopCode: "16009",
          roadName: "Clementi Rd",
          description: "Kent Ridge Ter",
          latitude: 1.29425341056334,
          longitude: 103.76988323197696,
          services: ["33"],
        }
      : {
          busStopCode: "17009",
          roadName: "Clementi Ave 3",
          description: "Clementi Int",
          latitude: 1.31491572870629,
          longitude: 103.76412225438476,
          services: ["196"],
        };
  return {
    busStop: stop19069,
    serviceNo,
    routes: [
      {
        serviceNo,
        direction: 1,
        destination: terminal,
        stops: [
          { ...stop19069, sequence: 0 },
          { ...terminal, sequence: 1 },
        ],
      },
    ],
  };
}

function mockStop19069Apis() {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nearby19069Response),
      });
    }
    if (url.includes("/api/bus-stops/nearby")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            stops: nearby19069Response.stops,
            radiusMeters: 3_500,
          }),
      });
    }
    if (url.includes("/api/location/bus-stops/19069/arrivals")) {
      return Promise.resolve({ ok: false });
    }
    const routeMatch = url.match(
      /\/api\/bus-stops\/19069\/services\/(33|196)\/routes/,
    );
    if (routeMatch) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(routeResponseFor19069(routeMatch[1] as "33" | "196")),
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const normalized = hex.replace("#", "");
    const channels = [0, 2, 4].map(
      (start) => parseInt(normalized.slice(start, start + 2), 16) / 255,
    );
    const linear = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mapSideControlStackStyle() {
  return StyleSheet.flatten(
    screen.getByTestId("map-side-control-stack").props.style,
  );
}

function mapSideControlStackPosition() {
  const style = mapSideControlStackStyle();
  return {
    gap: style?.gap,
    position: style?.position,
    right: style?.right,
    top: style?.top,
    width: style?.width,
    zIndex: style?.zIndex,
  };
}

function nearbySheetHeader(state: "collapsed" | "expanded") {
  return screen.getByLabelText(`Nearby bus stops, ${state}`);
}

function queryNearbySheetHeader(state: "collapsed" | "expanded") {
  return screen.queryByLabelText(`Nearby bus stops, ${state}`);
}

function pressNearbySheetHeader(state: "collapsed" | "expanded") {
  fireEvent.press(nearbySheetHeader(state));
}

async function openNearbySheet() {
  const nearbyControl = screen.queryByLabelText(
    "Show nearby bus stops in this area",
  );
  fireEvent.press(
    nearbyControl ?? screen.getByLabelText("Select bus stop manually"),
  );
  return screen.findByLabelText("Nearby bus stops");
}

function focusMapSearchField() {
  fireEvent(
    screen.getByLabelText("Search bus stop, service or place"),
    "focus",
  );
}

function mockSuccessfulJourneyApis(
  assistanceStatus: "SENDING" | "ACKNOWLEDGED" = "ACKNOWLEDGED",
) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("routing.openstreetmap.de/routed-foot")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            code: "Ok",
            routes: [
              {
                distance: 112,
                duration: 105,
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [103.7711, 1.2942],
                    [103.77122, 1.29412],
                    [103.77104, 1.29398],
                  ],
                },
                legs: [
                  {
                    steps: [
                      {
                        distance: 72,
                        duration: 65,
                        name: "Kent Ridge Cres",
                        maneuver: {
                          type: "depart",
                          modifier: "south",
                          location: [103.7711, 1.2942],
                        },
                      },
                      {
                        distance: 40,
                        duration: 40,
                        name: "",
                        maneuver: {
                          type: "turn",
                          modifier: "left",
                          location: [103.77122, 1.29412],
                        },
                      },
                      {
                        distance: 0,
                        duration: 0,
                        name: "",
                        maneuver: {
                          type: "arrive",
                          modifier: "straight",
                          location: [103.77104, 1.29398],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
      });
    }
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nearbyStopsResponse),
      });
    }

    if (url.includes("/api/bus-stops/nearby")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            stops: nearbyStopsResponse.stops,
            radiusMeters: 3500,
          }),
      });
    }

    if (url.includes("/api/bus-stops/search")) {
      const query = new URL(url).searchParams.get("q")?.toLowerCase() ?? "";
      const stops = nearbyStopsResponse.stops.filter((stop) =>
        [stop.busStopCode, stop.description, stop.roadName, ...stop.services]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ stops, query, total: stops.length }),
      });
    }

    if (url.includes("/api/location/bus-stops/18301/arrivals")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(arrivalsResponse),
      });
    }

    if (url.includes("/api/assistance/request")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            requestId: "REQ-ONBOARD-1",
            status: assistanceStatus,
            createdAt: "2026-08-15T13:00:00.000Z",
          }),
      });
    }

    if (url.includes("/api/assistance/") && url.includes("/cancel")) {
      return Promise.resolve({ ok: true });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

function mockExplorableMapApis() {
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: { body?: string }) => {
      if (url.includes("/api/location/nearby-bus-stops")) {
        const body = options?.body ? JSON.parse(options.body) : {};
        const response =
          body.longitude > 103.78 ? exploredAreaResponse : nearbyStopsResponse;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(response),
        });
      }

      if (url.includes("/api/bus-stops/nearby")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              stops: exploredAreaResponse.stops,
              radiusMeters: 3500,
            }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    },
  );
}

async function selectBusFromManualStopFlow() {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));

  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
}

async function reviewSelectedServiceJourney() {
  await screen.findByText("Where are you getting off?");
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
}

async function signInDemoProfile() {
  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.press(screen.getByLabelText(/Sign in as Visual Guidance Profile/i));
  await screen.findByText("My profile");
}

async function openJourneyMap(
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    heading?: number;
  } = { latitude: 1.2942, longitude: 103.7711, accuracy: 12 },
) {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords,
  });
  if (!screen.queryByText("Find your bus")) {
    fireEvent.press(
      screen.getByLabelText(/Journey, tab, find bus ready, 1 of 3/),
    );
  }
  fireEvent.press(screen.getByLabelText("Use my location"));
  await screen.findByLabelText("Search bus stop, service or place");
}

async function emitWatchedLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number;
}) {
  await waitFor(() => {
    expect(Location.watchPositionAsync).toHaveBeenCalled();
  });
  const watcher = (Location.watchPositionAsync as jest.Mock).mock.calls.at(
    -1,
  )?.[1];
  expect(typeof watcher).toBe("function");
  await act(async () => {
    watcher({ coords });
  });
}

function visibleTextOrder(node: unknown): string[] {
  if (node == null || typeof node === "boolean") {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }

  if (Array.isArray(node)) {
    return node.flatMap(visibleTextOrder);
  }

  if (typeof node === "object" && "children" in node) {
    return visibleTextOrder((node as { children?: unknown }).children);
  }

  return [];
}

async function startOnboardJourney() {
  mockSuccessfulJourneyApis();
  const view = render(<App />);
  await signInDemoProfile();

  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
  return view;
}

async function startWheelchairOnboardJourney({
  assistanceStatus = "ACKNOWLEDGED",
  simplified = false,
  lowVision = false,
}: {
  assistanceStatus?: "SENDING" | "ACKNOWLEDGED";
  simplified?: boolean;
  lowVision?: boolean;
} = {}) {
  mockSuccessfulJourneyApis(assistanceStatus);
  const view = render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Apply Mobility support preset"));
  if (simplified) {
    fireEvent.press(screen.getByLabelText("Apply Simpler journeys preset"));
  }
  if (lowVision) {
    fireEvent.press(screen.getByLabelText("Apply Low-vision support preset"));
  }
  fireEvent.press(screen.getByText("Save needs"));

  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  await screen.findByTestId("waiting-for-bus-status");
  fireEvent.press(screen.getByText("I'm onboard"));
  await screen.findByText("ONBOARD JOURNEY");
  return view;
}

function advanceToDestinationNext() {
  fireEvent.press(screen.getByText("Simulate next stop"));
  fireEvent.press(screen.getByText("Simulate next stop"));
}

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = false;
  delete (globalThis as any).document;
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "ios",
  });
});

it("renders the journey entry actions without inactive repeat guidance", () => {
  render(<App />);

  expect(screen.getByText("SG GoAssist")).toBeTruthy();
  expect(screen.getByText("Find your bus")).toBeTruthy();
  expect(
    screen.getByText("Choose a nearby stop and the bus you want to board."),
  ).toBeTruthy();
  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByText("Use my location")).toBeTruthy();
  expect(screen.getByText("Select bus stop manually")).toBeTruthy();
  expect(screen.queryByText("Find a nearby bus stop")).toBeNull();
  expect(
    screen.queryByLabelText(
      "Illustration of nearby accessible bus stops on a map",
    ),
  ).toBeNull();
  expect(screen.queryByLabelText("Repeat guidance")).toBeNull();
  expect(
    screen.getByLabelText("Journey, tab, selected, find bus ready, 1 of 3")
      .props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(screen.getByLabelText(/Assist, tab.*2 of 3/)).toBeTruthy();
  expect(screen.getByLabelText(/Profile, tab, 3 of 3/)).toBeTruthy();
  expect(screen.queryByText("Home")).toBeNull();

  const heroStyle = StyleSheet.flatten(
    screen.getByTestId("journey-feature-hero").props.style,
  );
  const illustrationStyle = StyleSheet.flatten(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true })
      .props.style,
  );
  expect(heroStyle).toMatchObject({
    minHeight: 148,
    paddingHorizontal: 16,
  });
  expect(["row", "column"]).toContain(heroStyle.flexDirection);
  expect([14, 16]).toContain(heroStyle.paddingVertical);
  expect(heroStyle.flex).toBeUndefined();
  expect(heroStyle.height).toBeUndefined();
  expect(illustrationStyle).toMatchObject({
    flexShrink: 0,
    height: 148,
    width: 166,
  });
});

it("uses the supplied Journey artwork safely across standard display themes", () => {
  render(<App />);

  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.press(screen.getByLabelText("Dark mode"));
  fireEvent.press(
    screen.getByLabelText(/Journey, tab, find bus ready, 1 of 3/),
  );
  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.press(screen.getByLabelText("Light mode"));
  fireEvent.press(
    screen.getByLabelText(/Journey, tab, find bus ready, 1 of 3/),
  );
  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();
});

it("keeps the Journey artwork visible on high-contrast light and dark surfaces", async () => {
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(
    screen.getByLabelText(/Journey, tab, find bus ready, 1 of 3/),
  );
  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.press(screen.getByLabelText("Dark mode"));
  fireEvent.press(
    screen.getByLabelText(/Journey, tab, find bus ready, 1 of 3/),
  );
  expect(
    screen.getByTestId("journey-hero-artwork", { includeHiddenElements: true }),
  ).toBeTruthy();
});

it("keeps repeat guidance in Journey after spoken stop guidance exists", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");

  expect(screen.getByLabelText("Repeat guidance")).toBeTruthy();
  expect(
    screen.getByLabelText("Repeat guidance").props.accessibilityState,
  ).toMatchObject({
    disabled: false,
  });
});

it("uses a contextual location loading state before showing the real map", async () => {
  let resolveLocation: ((position: { coords: any }) => void) | null = null;
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveLocation = resolve;
      }),
  );
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return new Promise(() => undefined);
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  expect(await screen.findByText("Finding nearby bus stops...")).toBeTruthy();
  expect(screen.getByTestId("journey-location-loading-panel")).toBeTruthy();
  expect(
    screen.getByTestId("location-loading-artwork", {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(screen.getByText("This should only take a moment.")).toBeTruthy();
  expect(screen.getByText("SG GoAssist")).toBeTruthy();
  expect(
    screen.getByText("Accessible journeys. Guided with care."),
  ).toBeTruthy();
  expect(screen.getByText("Find your bus")).toBeTruthy();
  expect(
    screen.getByLabelText("Journey, tab, selected, find bus ready, 1 of 3")
      .props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(screen.queryByText("Use my location")).toBeNull();
  expect(screen.queryByText("Select bus stop manually")).toBeNull();
  expect(
    screen.queryByText("Choose a nearby stop and the bus you want to board."),
  ).toBeNull();
  expect(
    screen.queryByLabelText(
      "Illustration of nearby accessible bus stops on a map",
    ),
  ).toBeNull();

  await act(async () => {
    resolveLocation?.({
      coords: {
        latitude: 1.2942,
        longitude: 103.7711,
        accuracy: 12,
      },
    });
  });
  await screen.findByLabelText("Search bus stop, service or place");
});

it("does not flash the Journey loading panel for an immediate location result", async () => {
  mockSuccessfulJourneyApis();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 12,
    },
  });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByLabelText("Search bus stop, service or place");
  expect(screen.queryByTestId("journey-location-loading-panel")).toBeNull();
  expect(
    screen.queryByLabelText(
      "Illustration of nearby accessible bus stops on a map",
    ),
  ).toBeNull();
});

it.each([
  [280, 1, true],
  [320, 1, true],
  [360, 1, false],
  [390, 1, false],
  [430, 1, false],
  [768, 1, false],
  [390, 1.5, true],
  [390, 2, true],
] as const)(
  "selects a non-overlapping Journey entry layout at %ipx and %f× text scale",
  (width, fontScale, stacked) => {
    expect(
      shouldStackJourneyEntry({ width, fontScale, largeText: false }),
    ).toBe(stacked);
  },
);

it("always stacks the Journey entry when the Large Text preference is enabled", () => {
  expect(
    shouldStackJourneyEntry({ width: 430, fontScale: 1, largeText: true }),
  ).toBe(true);
});

it.each([
  [280, 1, true],
  [320, 1, true],
  [360, 1, false],
  [390, 1, false],
  [430, 1, false],
  [768, 1, false],
  [390, 1.5, true],
  [390, 2, true],
] as const)(
  "selects a non-overlapping feature-card layout at %ipx and %fÃ— text scale",
  (width, fontScale, stacked) => {
    expect(
      shouldStackFeatureIllustration({ width, fontScale, largeText: false }),
    ).toBe(stacked);
  },
);

it("keeps Journey and Assist available before a bus is selected", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  expect(
    screen.getByLabelText(/Journey, tab, selected, find bus ready, 1 of 3/)
      .props.accessibilityState,
  ).toMatchObject({
    disabled: false,
  });
  expect(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/).props
      .accessibilityState,
  ).toMatchObject({
    disabled: false,
  });

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  expect(screen.queryByLabelText("Nearby bus stops")).toBeNull();
  expect(
    screen.getByLabelText(/Journey, tab, selected, map ready, 1 of 3/),
  ).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");
  expect(screen.getByLabelText("Service 95")).toBeTruthy();
  expect(screen.getByLabelText("Request ramp for Service 95")).toBeTruthy();
  expect(screen.queryByText("Edit saved preferences")).toBeNull();
});

it("opens the Journey map with Nearby closed and hides map controls when unavailable", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");

  expect(screen.queryByLabelText("Nearby bus stops")).toBeNull();
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(
    screen.getByLabelText(
      /Unable to load map. We couldn't load the map right now/i,
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Retry map")).toBeTruthy();
  expect(screen.getByLabelText("Select bus stop manually")).toBeTruthy();
  expect(
    screen.queryByLabelText("Centre map on my current location"),
  ).toBeNull();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();
  expect(screen.queryByLabelText("More")).toBeNull();

  await openNearbySheet();

  expect(screen.getByLabelText("Nearby bus stops")).toBeTruthy();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();
});

it("does not mount an empty search-results shell", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  await openJourneyMap();
  focusMapSearchField();
  await screen.findByText("Search for a destination");
  expect(screen.queryByTestId("search-results-shell")).toBeNull();

  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "   ",
  );
  expect(screen.queryByTestId("search-results-shell")).toBeNull();

  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "Kent Ridge",
  );
  expect(screen.getByTestId("search-results-shell")).toBeTruthy();
});

it("plans a searched origin-to-destination route and starts with the walking leg", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  focusMapSearchField();
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "NUH",
  );

  await screen.findByText("NUH");
  fireEvent.press(
    screen.getByLabelText(/NUH, Bus Stop 18121, Lower Kent Ridge Rd/i),
  );

  await screen.findByText("RECOMMENDED FOR YOU");
  expect(screen.getByText("ROUTE OPTIONS")).toBeTruthy();
  expect(screen.getByText("Start this journey")).toBeTruthy();
  expect(
    screen.getByLabelText(/Fastest accessible route.*Take Bus/i),
  ).toBeTruthy();

  fireEvent.press(screen.getByText("Start this journey"));

  expect(screen.getByText("Walking to your stop")).toBeTruthy();
  expect(screen.getByText(/Walk to .* Stop/i)).toBeTruthy();
  expect(
    screen.queryByText("Every spoken update is also displayed on this screen."),
  ).toBeNull();
  expect(screen.queryByText(/Vibration alerts:/i)).toBeNull();
  expect(
    screen.getByLabelText(/Journey, tab, selected, active journey, 1 of 3/),
  ).toBeTruthy();
});

it("gates destination map picking on provider readiness", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "chooseDestinationOnMap",
    'setMapPickMode("DESTINATION")',
    'mapReady && mapPickMode === "DESTINATION" && !searchActive',
    "<MapDestinationPicker",
    "Set as destination",
  ].forEach((token) => expect(source).toContain(token));
});

it("opens the nearby stop list even when journey route options are available", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  focusMapSearchField();
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "NUH",
  );
  await screen.findByText("NUH");
  fireEvent.press(
    screen.getByLabelText(/NUH, Bus Stop 18121, Lower Kent Ridge Rd/i),
  );
  await screen.findByText("RECOMMENDED FOR YOU");

  await openNearbySheet();

  await waitFor(() => {
    expect(screen.queryByText("RECOMMENDED FOR YOU")).toBeNull();
    expect(screen.getAllByText(/bus stops/i).length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Show nearby bus stops in this area"),
    ).toBeNull();
  });
});

it("lets a passenger manually choose a stop, confirm it, and see arriving buses", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  expect(screen.queryByLabelText("SG GoAssist")).toBeNull();
  expect(screen.getByText("Nearby bus stops")).toBeTruthy();
  expect(
    screen.getByLabelText("Search bus stop, service or place"),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();
  expect(screen.getByLabelText("Map provider unavailable")).toBeTruthy();
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(screen.getByLabelText("Retry map")).toBeTruthy();
  expect(screen.getByLabelText("Select bus stop manually")).toBeTruthy();
  expect(screen.queryByLabelText("More")).toBeNull();
  expect(screen.queryByLabelText("Your current location.")).toBeNull();
  expect(
    screen.queryByLabelText("Centre map on my current location"),
  ).toBeNull();

  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByText("Choose this stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("BOARDING AT")).toBeTruthy();
  expect(screen.getByText("Which bus are you taking?")).toBeTruthy();
  expect(screen.getByText("95")).toBeTruthy();
  expect(screen.getByText("Kent Ridge Terminal")).toBeTruthy();
});

it("selects a nearby stop from the map and opens the selected stop card", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );

  expect(screen.getByText("Kent Ridge Crescent")).toBeTruthy();
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(screen.getByText("Services")).toBeTruthy();
  const service95 = screen.getByLabelText("Bus service 95");
  expect(service95.props.accessibilityRole).toBe("button");
  expect(service95.props.accessibilityState).toMatchObject({ selected: false });
  fireEvent.press(service95);
  expect(
    screen.getByLabelText("Bus service 95, selected").props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("Live arrival unavailable")).toBeTruthy();
  expect(screen.getByText("Choose this stop")).toBeTruthy();
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(screen.queryByText("Search this area")).toBeNull();
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();

  fireEvent.press(screen.getByText("Choose this stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("95")).toBeTruthy();
});

it("selecting the nearest stop from Nearby opens details without screen-position markers", async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 12,
    },
  });
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));
  await screen.findByLabelText("Search bus stop, service or place");
  await openNearbySheet();

  const nearestLabel =
    /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i;

  fireEvent.press(screen.getByLabelText(nearestLabel));

  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(screen.getByText("Services")).toBeTruthy();
  expect(screen.queryByTestId(/current-user-location-/)).toBeNull();

  fireEvent.press(screen.getByLabelText("Minimize stop panel"));
  expect(screen.queryByText("Services")).toBeNull();

  fireEvent.press(screen.getByLabelText("Back to nearby bus stops"));
  expect(screen.getByLabelText(nearestLabel)).toBeTruthy();
});

it("uses map Back to undo map task state before leaving the map", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  expect(screen.getByLabelText("Back to map")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  expect(screen.getByLabelText("Back to nearby bus stops")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Back to nearby bus stops"));
  expect(
    screen.queryByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeNull();
  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Back to map"));
  fireEvent.press(screen.getByLabelText("Back to previous view"));
  expect(screen.getByText("Find your bus")).toBeTruthy();
});

it("keeps Locate focused on map positioning without opening Nearby results", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    'key: "locate"',
    'label: followState === "FREE" ? "Locate" : "Following"',
    'followState === "FOLLOW_USER_HEADING"',
    "onLocateMap();",
    "mapReady && !searchActive",
    "<MapSideControls",
  ].forEach((token) => expect(source).toContain(token));
});

it("uses Nearby to load and open nearby bus stops without sharing Locate behaviour", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  pressNearbySheetHeader("expanded");
  expect(queryNearbySheetHeader("collapsed")).toBeNull();

  (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear();
  (global.fetch as jest.Mock).mockClear();
  await openNearbySheet();

  await waitFor(() =>
    expect(
      screen.getByLabelText(
        /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
      ),
    ).toBeTruthy(),
  );
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getAllByText("Nearby bus stops").length).toBeGreaterThan(0);
  expect(
    screen.getByLabelText(
      /Opp Heng Mui Keng Terrace, Kent Ridge Cres, bus stop 18321/i,
    ),
  ).toBeTruthy();
});

it("keeps Locate Nearby and More fixed while the Nearby sheet changes state", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    'testID="map-side-control-stack"',
    "top: mapSideControlTopOffset",
    "right: mapOverlayMargin",
    "zIndex: mapLayerZ.sideControls",
    'key: "locate"',
    'key: "nearby"',
    'key: "more"',
    "nearbyOpen={nearbyOpen}",
    "moreOpen={showMoreControls}",
    "mapReady && !searchActive",
  ].forEach((token) => expect(source).toContain(token));
});

it("keeps the fixed map control stack in place after selecting a nearby stop", async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 12,
    },
  });
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));
  await screen.findByLabelText("Search bus stop, service or place");
  await openNearbySheet();

  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );

  expect(screen.queryByTestId("map-side-control-stack")).toBeNull();
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(screen.queryByTestId(/current-user-location-/)).toBeNull();
});

it("opens the Nearby sheet from the Journey planner and shows stop entries immediately", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  expect(screen.queryByText("Search this area")).toBeNull();
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();

  await openNearbySheet();

  await waitFor(() => {
    expect(
      screen.getByLabelText("Search bus stop, service or place"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText("Show nearby bus stops in this area"),
    ).toBeNull();
    expect(screen.queryByText("Search this area")).toBeNull();
  });
});

it("shows Nearby loading feedback immediately before nearby stop data arrives", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return new Promise(() => undefined);
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));

  expect(await screen.findByText("Loading bus stop choices...")).toBeTruthy();
  expect(screen.getByTestId("journey-location-loading-panel")).toBeTruthy();
  expect(
    screen.queryByLabelText("Search bus stop, service or place"),
  ).toBeNull();
});

it("keeps the collapsed bottom sheet from opening Nearby stops", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  pressNearbySheetHeader("expanded");
  expect(queryNearbySheetHeader("collapsed")).toBeNull();

  (global.fetch as jest.Mock).mockClear();

  expect(
    screen.queryByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();
  expect(queryNearbySheetHeader("collapsed")).toBeNull();

  await openNearbySheet();

  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();
  expect(nearbySheetHeader("expanded").props.accessibilityState).toMatchObject({
    expanded: true,
  });
});

it("starts manual-stop loading only after the Journey entry action", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return new Promise(() => undefined);
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  expect(screen.queryByText("Loading bus stop choices...")).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));

  expect(await screen.findByText("Loading bus stop choices...")).toBeTruthy();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("keeps the Nearby sheet open when the floating Nearby query is empty", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...nearbyStopsResponse,
            count: 0,
            stops: [],
          }),
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  (global.fetch as jest.Mock).mockClear();

  expect(queryNearbySheetHeader("collapsed")).toBeNull();
  expect(screen.queryByText("No nearby stops found")).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));

  expect(await screen.findByText("No nearby stops found")).toBeTruthy();
  expect(screen.getByText("Move the map or search another area.")).toBeTruthy();
  expect(nearbySheetHeader("expanded")).toBeTruthy();
});

it("keeps the Nearby sheet open with retry when the floating Nearby query fails", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.reject(new Error("Nearby unavailable"));
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  await openJourneyMap();
  await screen.findByLabelText("Search bus stop, service or place");
  (global.fetch as jest.Mock).mockClear();

  expect(queryNearbySheetHeader("collapsed")).toBeNull();
  expect(global.fetch).not.toHaveBeenCalled();

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));

  expect(await screen.findByText("Couldn't load nearby stops")).toBeTruthy();
  expect(screen.getByLabelText("Try again")).toBeTruthy();
  expect(nearbySheetHeader("expanded")).toBeTruthy();
});

it("toggles Nearby between useful list height and peek without losing list content", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  pressNearbySheetHeader("expanded");

  await openNearbySheet();
  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();

  pressNearbySheetHeader("expanded");
  expect(queryNearbySheetHeader("collapsed")).toBeNull();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();

  await openNearbySheet();
  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();
});

it("uses Leaflet viewport changes, not a fake canvas, for Search this area", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const webMapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "handleProviderViewportChange",
    "onProviderViewportChange",
    'mode: "USER_PAN"',
    "const searchThisAreaVisible = useMemo",
    "Find bus stops in the currently visible map area",
    "requestOrigin: payload",
  ].forEach((token) => expect(appSource).toContain(token));

  [
    "useMapEvents",
    "moveend:",
    "map.getCenter()",
    "onViewportChange({",
    "map.flyTo(toLatLng(viewport.center)",
  ].forEach((token) => expect(webMapSource).toContain(token));

  expect(appSource).not.toContain("Nearby bus stop map canvas");
  expect(appSource).not.toContain("onLongPress={handleMapCanvasLongPress}");
});

it("does not render permanent zoom controls on the map", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");

  expect(screen.queryByLabelText("Zoom map in")).toBeNull();
  expect(screen.queryByLabelText("Zoom map out")).toBeNull();
  expect(screen.queryByText(/Zoom 15|Zoom 16|\+|-/)).toBeNull();
});

it("keeps a conventional north-up compass without fragile Leaflet rotation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    'accessibilityLabel="Reset map to north"',
    "prominent={mapIsRotated}",
    "onResetHeading",
    "bearingDegrees",
    "mapReady && !searchActive",
  ].forEach((token) => expect(source).toContain(token));
  expect(source).not.toContain(
    'accessibilityLabel: `Rotate map, ${rotationEnabled ? "on" : "off"}`',
  );
});

it("makes each visible More menu option contextual and functional", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "function MapLayerQuickControls",
    "MAP LAYERS",
    "JOURNEY",
    "MAP VIEW",
    "Choose a bus service first",
    "Select a stop or bus route first",
    'accessibilityLabel: "Bus vehicles"',
    'label: "Places"',
    'accessibilityLabel: "Accessibility information"',
    'label: "Stops"',
    'label: "North up"',
    "onResetHeading",
    "onResetMap",
    "onViewFullRoute",
    "mapReady && showMoreControls",
  ].forEach((token) => expect(source).toContain(token));
});

it("uses Nearby around the provider viewport without requesting GPS", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "async function showNearbyStopsInArea",
    "nearbySearchOrigin",
    "setNearbyOpen(true)",
    'source: "SEARCH_RESULT"',
    'transportDiscovery.nearbyStopsStatus === "idle"',
    "searchThisAreaVisible",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("Nearby bus stop map canvas");
});

it("returns to the passenger viewport with Locate after provider panning", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "async function locateCurrentPosition",
    "Location.requestForegroundPermissionsAsync",
    'mode: "USER_LOCATION"',
    'source: "USER_LOCATION"',
    '"locateUser"',
  ].forEach((token) => expect(source).toContain(token));
});

it("lets manual provider panning win over a stale Locate result", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const runCameraCommand = useCallback",
    "cameraIntentIdRef.current += 1",
    "cameraIntentId !== cameraIntentIdRef.current",
    '"USER_PAN"',
    "setMapCameraMode(cameraMode)",
  ].forEach((token) => expect(source).toContain(token));
});

it("uses Leaflet-native current location markers tied to coordinates", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "<Circle",
    "center={toLatLng(currentLocation)}",
    "radius={currentLocation.accuracyMeters}",
    "<AccessibleMarker",
    "position={toLatLng(currentLocation)}",
    "headingAccessibilityLabel(",
    "currentLocation.headingDegrees",
    "userLocationIcon(",
    "locationPulseKey",
  ].forEach((token) => expect(source).toContain(token));

  [
    "function UserLocationMarker",
    "current-user-location-",
    "left: userLocationPosition",
    "top: userLocationPosition",
    "styles.currentLocationMarker",
    'data-user-location-label="true"',
  ].forEach((token) => expect(source).not.toContain(token));
});

it("keeps map camera, user location, and query origin separated", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  const webMapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "type CameraCommand",
    "type CameraMode",
    '"FOLLOW_USER"',
    '"MANUAL"',
    '"SEARCH_RESULT"',
    '"CLUSTER_FOCUS"',
    '"STOP_FOCUS"',
    '"ROUTE_FOCUS"',
    '"FOLLOW_JOURNEY"',
    "type MapOverlayInsets",
    "type MapCameraGeometry",
    "type UsableMapRect",
    "type ProviderViewportChange",
    "mapTopControlRowHeight",
    "contextualMapControlHeight",
    "mapCameraInsetSpacing",
    "contextualActionVisible",
    "const [mapCameraMode",
    "initialCameraAppliedRef",
    "cameraIntentIdRef",
    "selectedStopCameraIntentRef",
    "mapCameraGeometryRef",
    "bottomSheetStateRef",
    "currentLocationRef",
    "runCameraCommand",
    "handleProviderViewportChange",
    "onProviderViewportChange",
    "cameraModeForViewportSource",
    "getCurrentMapInsets",
    "usableMapRectForCamera",
    "centerSafeZoneForRect",
    "cameraPaddingForProvider",
    "usableMapTargetPercent",
    "cameraCenterForUserLocation",
    "projectedPointInRect",
    ").projectRaw(currentLocation)",
    "Map padding too large",
    "projectRaw",
    "handleStopSelectionCamera",
    "stopSelectionCameraViewport",
    "panCameraCenterToRevealCoordinate",
    "zoomToFitCoordinates",
    "STOP_SELECTION_CAMERA",
    "selectStopReveal",
    "debugMapCameraSnapshot",
    "INVALID MAP VIEWPORT",
    "MapCameraDebugOverlay",
    "followUserMovementThresholdMeters",
    'mapCameraMode !== "MANUAL"',
    'followState === "FREE"',
    "updateCamera?: boolean",
    "keepViewport: true",
    "requestOrigin: payload",
    "setTransportDiscovery((current) => ({",
    "lastSuccessfulLocation: position.coords",
    "cameraIntentId !== cameraIntentIdRef.current",
    "createMapProjection(viewport.center, viewport.zoom)",
    "mapSpanMetersForZoom",
    "currentLocationLabelSurface",
    "currentLocationLabelText",
    "bottom: 0",
    "controlText",
    "enableLocationDebugLogs",
    "USER LOCATION CHANGED",
    "const viewportCenterProjected",
  ].forEach((token) => {
    expect(source).toContain(token);
  });

  [
    "useMapEvents",
    "map.flyTo(toLatLng(viewport.center)",
    "center={toLatLng(currentLocation)}",
    "position={toLatLng(currentLocation)}",
    "map.invalidateSize({ animate: false, pan: false })",
  ].forEach((token) => expect(webMapSource).toContain(token));

  expect(source).not.toContain(
    "bottomNavigationHeight + mapBottomSheetHeights[bottomSheetState]",
  );
  expect(source).not.toContain("mapBottomSheetHeights[bottomSheetState]");
  expect(source).not.toContain("function mapPaddingForCamera");
  expect(source).not.toContain('runCameraCommand("focusStop"');
  expect(source).not.toContain("center: stop,\n        zoom: 17");
  expect(source).not.toContain("function UserLocationMarker");
  expect(source).not.toContain("<UserLocationMarker");
  expect(source).not.toContain("lastSuccessfulLocation: queryCenter");
});

it("hides the stop sheet fully and restores Nearby from the floating button", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );

  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));

  expect(screen.queryByText("Nearby bus stops")).toBeNull();
  expect(screen.queryByText(/Bus Stop 18301 · About 45 m away/i)).toBeNull();
  expect(
    screen.queryByLabelText("Show nearby bus stops in this area"),
  ).toBeNull();

  await openNearbySheet();

  expect(screen.getByText("Nearby bus stops")).toBeTruthy();
  expect(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  ).toBeTruthy();
});

it("shows routed walking directions, guidance, and route fitting for a selected stop", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);

  expect(await screen.findByText("Walking")).toBeTruthy();
  expect(screen.getByText("2 min · 110 m")).toBeTruthy();
  expect(
    (global.fetch as jest.Mock).mock.calls.some(([url]) =>
      String(url).includes(
        "/103.7725,1.2955;103.77104,1.29398?alternatives=false&steps=true&geometries=geojson&overview=full",
      ),
    ),
  ).toBe(true);
  expect(screen.getByText("Start guidance")).toBeTruthy();
  expect(screen.getByText("View steps")).toBeTruthy();
  fireEvent.press(screen.getByText("Start guidance"));
  expect(screen.getByText("Walking guidance")).toBeTruthy();
  expect(screen.getByText("Turn left")).toBeTruthy();
  await emitWatchedLocation({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await emitWatchedLocation({
    latitude: 1.29551,
    longitude: 103.77251,
    accuracy: 12,
  });
  await emitWatchedLocation({
    latitude: 1.29552,
    longitude: 103.77252,
    accuracy: 12,
  });
  expect(
    await screen.findByText("You're off the suggested walking route."),
  ).toBeTruthy();
  expect(screen.getByText("Continue without rerouting")).toBeTruthy();
  expect(
    screen.getByLabelText("Walking directions to Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByText("Recalculate"));
  expect(await screen.findByText("Start guidance")).toBeTruthy();
  expect(
    screen.getByLabelText("Walking directions to Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Back to bus stop details"));
  expect(screen.queryByText("Walking guidance")).toBeNull();
});

it("fully tears down active guidance, stays idempotent, and starts cleanly again", async () => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  const removeLocationWatcher = jest.fn();
  let staleLocationWatcher: ((position: { coords: any }) => void) | null = null;
  (Location.watchPositionAsync as jest.Mock).mockImplementation(
    (_options, watcher) => {
      staleLocationWatcher = watcher;
      return Promise.resolve({ remove: removeLocationWatcher });
    },
  );
  const mapMock = require("../__mocks__/JourneyMap") as {
    getLastJourneyMapProps: () => {
      currentLocation: {
        latitude: number;
        longitude: number;
        accuracyMeters?: number;
      };
      locationPulseKey: number;
      routeStops: Array<{ latitude: number; longitude: number }>;
    };
  };
  mockSuccessfulJourneyApis();
  render(<App />);
  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  await screen.findByText("Start guidance");
  fireEvent.press(screen.getByText("View steps"));
  fireEvent.press(screen.getByText("Start guidance"));
  await screen.findByText("Exit guidance");
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalled());

  const locationBeforeExit = mapMock.getLastJourneyMapProps().currentLocation;
  expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(3);
  expect(
    screen.getByLabelText("Following my location").props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(mapMock.getLastJourneyMapProps().locationPulseKey).toBeGreaterThan(0);

  let exitGuidanceNode: any = screen.getByText("Exit guidance");
  while (
    exitGuidanceNode &&
    typeof exitGuidanceNode.props?.onPress !== "function"
  ) {
    exitGuidanceNode = exitGuidanceNode.parent;
  }
  const exitGuidance = exitGuidanceNode?.props.onPress;
  expect(typeof exitGuidance).toBe("function");
  act(() => {
    exitGuidance();
    exitGuidance();
  });

  await screen.findByLabelText("Selected stop Kent Ridge Crescent");
  await waitFor(() => expect(removeLocationWatcher).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Walking guidance")).toBeNull();
  expect(screen.queryByTestId("walking-current-instruction")).toBeNull();
  expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(0);
  expect(
    screen.getByLabelText("Centre map on my current location").props
      .accessibilityState,
  ).toMatchObject({ selected: false });
  expect(mapMock.getLastJourneyMapProps().locationPulseKey).toBe(0);
  expect(mapMock.getLastJourneyMapProps().currentLocation).toEqual(
    locationBeforeExit,
  );

  await act(async () => {
    staleLocationWatcher?.({
      coords: {
        latitude: 1.31,
        longitude: 103.8,
        accuracy: 10,
      },
    });
  });
  expect(mapMock.getLastJourneyMapProps().currentLocation).toEqual(
    locationBeforeExit,
  );

  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  await screen.findByText("Start guidance");
  fireEvent.press(screen.getByText("Start guidance"));
  await screen.findByText("Walking guidance");
  fireEvent.press(screen.getByLabelText("Back to bus stop details"));
  await screen.findByLabelText("Selected stop Kent Ridge Crescent");
  expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(0);
  expect(screen.queryByText("Walking guidance")).toBeNull();

  fireEvent.press(screen.getByLabelText("Back to nearby bus stops"));
  expect(await screen.findByLabelText("Nearby bus stops")).toBeTruthy();
});

it("defaults Directions to a real wheelchair mode and labels standard walking fallback", async () => {
  mockSuccessfulJourneyApis();
  const normalImplementation = (
    global.fetch as jest.Mock
  ).getMockImplementation()!;
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: RequestInit) => {
      if (url.includes("valhalla1.openstreetmap.de/route")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              trip: {
                status: 0,
                summary: { length: 0.15, time: 150 },
                legs: [
                  {
                    shape: "_p~iF~ps|U_ulLnnqC",
                    maneuvers: [
                      {
                        instruction: "Continue along the accessible path",
                        length: 0.15,
                        time: 150,
                        type: 1,
                        begin_shape_index: 0,
                      },
                    ],
                  },
                ],
              },
            }),
        });
      }
      return normalImplementation(url, options);
    },
  );
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Mobility accessibility settings"));
  fireEvent.press(screen.getByLabelText("Wheelchair-friendly routing"));
  expect(
    screen.getByLabelText("Wheelchair-friendly routing").props
      .accessibilityState,
  ).toMatchObject({ checked: true });
  fireEvent.press(screen.getByText("Save needs"));

  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await openNearbySheet();
  const stop = await screen.findByLabelText(
    /Kent Ridge Crescent.*bus stop 18301/i,
  );
  fireEvent.press(stop);
  fireEvent.press(screen.getByText("Wheelchair directions"));

  expect(await screen.findByText("Wheelchair-friendly route")).toBeTruthy();
  expect(
    screen.getByText("Accessibility confidence: Limited data"),
  ).toBeTruthy();
  expect(
    screen.getByText(/Based on available map accessibility data/i),
  ).toBeTruthy();
  const wheelchairCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
    String(url).includes("valhalla1.openstreetmap.de/route"),
  );
  expect(wheelchairCall).toBeTruthy();
  expect(
    JSON.parse(new URL(wheelchairCall![0]).searchParams.get("json")!),
  ).toMatchObject({
    costing: "pedestrian",
    costing_options: {
      pedestrian: { transport_type: "wheelchair", max_grade: 6 },
    },
  });

  fireEvent.press(screen.getByLabelText("Standard walking"));
  expect(await screen.findByText("Walking")).toBeTruthy();
  expect(
    screen.getByText(
      "Standard walking route selected. It has not been checked for wheelchair access.",
    ),
  ).toBeTruthy();
});

it("keeps the map mounted, fits routed geometry with safe padding, and cleans up on exit", async () => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  const mapMock = require("../__mocks__/JourneyMap") as {
    getJourneyMapMountCount: () => number;
    getLastJourneyMapProps: () => {
      currentLocation: {
        latitude: number;
        longitude: number;
        accuracyMeters?: number;
        headingDegrees?: number;
      };
      destination: { latitude: number; longitude: number } | null;
      routeFitKey: number;
      routeFitPadding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
      };
      routeStops: Array<{ latitude: number; longitude: number }>;
    };
  };
  mockSuccessfulJourneyApis();
  render(<App />);
  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 18,
    heading: 45,
  });
  await screen.findByTestId("leaflet-map-mock");
  const mountCount = mapMock.getJourneyMapMountCount();
  const locationBeforeNearby = mapMock.getLastJourneyMapProps().currentLocation;
  await openNearbySheet();
  expect(mapMock.getLastJourneyMapProps().currentLocation).toEqual(
    locationBeforeNearby,
  );
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  await screen.findByText("Start guidance");

  const routedProps = mapMock.getLastJourneyMapProps();
  expect(routedProps.routeStops).toHaveLength(3);
  expect(routedProps.routeFitKey).toBeGreaterThan(0);
  expect(routedProps.routeFitPadding).toMatchObject({
    top: expect.any(Number),
    right: expect.any(Number),
    bottom: expect.any(Number),
    left: expect.any(Number),
  });
  expect(routedProps.routeFitPadding.bottom).toBeGreaterThanOrEqual(330);
  expect(routedProps.currentLocation).toMatchObject({
    latitude: 1.2955,
    longitude: 103.7725,
    headingDegrees: 45,
  });
  expect(routedProps.destination).toMatchObject({
    latitude: 1.29398,
    longitude: 103.77104,
  });
  expect(mapMock.getJourneyMapMountCount()).toBe(mountCount);

  fireEvent.press(screen.getByLabelText("Back to bus stop details"));
  expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(0);
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(mapMock.getJourneyMapMountCount()).toBe(mountCount);

  fireEvent.press(screen.getByText("Locate"));
  expect(await screen.findByText("Following")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Pan mock map to Clementi"));
  expect(screen.getByText("Locate")).toBeTruthy();
  expect(mapMock.getJourneyMapMountCount()).toBe(mountCount);
});

it("keeps manual stop selection available when directions need location", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);

  expect(
    screen.getByText("Your location is needed for walking directions."),
  ).toBeTruthy();
  expect(screen.getByText("Use my location")).toBeTruthy();
  expect(
    screen.getByLabelText("Walking directions to Kent Ridge Crescent"),
  ).toBeTruthy();
});

it("retries a routing failure without losing the selected stop or map state", async () => {
  mockSuccessfulJourneyApis();
  const successfulImplementation = (
    global.fetch as jest.Mock
  ).getMockImplementation()!;
  let routeAttempts = 0;
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: RequestInit) => {
      if (
        url.includes("routing.openstreetmap.de/routed-foot") &&
        routeAttempts++ === 0
      ) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({}),
        });
      }
      return successfulImplementation(url, options);
    },
  );
  render(<App />);
  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);

  expect(await screen.findByText("Walking route unavailable.")).toBeTruthy();
  expect(
    screen.getByLabelText("Walking directions to Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByText("Try again"));
  expect(await screen.findByText("Start guidance")).toBeTruthy();
  expect(
    screen.getByLabelText("Walking directions to Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(routeAttempts).toBe(2);
});

it("does not let a late walking-route response reopen directions after exit", async () => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  mockSuccessfulJourneyApis();
  const successfulImplementation = (
    global.fetch as jest.Mock
  ).getMockImplementation()!;
  const successfulRouteResponse = successfulImplementation(
    "https://routing.openstreetmap.de/routed-foot/route/v1/foot/example",
  );
  let resolveRouteResponse!: (response: unknown) => void;
  const pendingRouteResponse = new Promise((resolve) => {
    resolveRouteResponse = resolve;
  });
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: RequestInit) =>
      url.includes("routing.openstreetmap.de/routed-foot")
        ? pendingRouteResponse
        : successfulImplementation(url, options),
  );
  const mapMock = require("../__mocks__/JourneyMap") as {
    getLastJourneyMapProps: () => {
      routeStops: Array<{ latitude: number; longitude: number }>;
    };
  };
  render(<App />);
  await openJourneyMap({
    latitude: 1.2955,
    longitude: 103.7725,
    accuracy: 12,
  });
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  await screen.findByLabelText("Finding walking route");

  fireEvent.press(screen.getByLabelText("Back to bus stop details"));
  await screen.findByLabelText("Selected stop Kent Ridge Crescent");

  await act(async () => {
    resolveRouteResponse(await successfulRouteResponse);
    await pendingRouteResponse;
  });
  await waitFor(() => {
    expect(screen.queryByText("Start guidance")).toBeNull();
    expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(0);
  });
});

it("announces arrival once guidance starts within the bus-stop radius", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  await screen.findByText("Start guidance");
  fireEvent.press(screen.getByText("Start guidance"));

  await emitWatchedLocation({
    latitude: 1.29399,
    longitude: 103.77104,
    accuracy: 8,
  });
  await emitWatchedLocation({
    latitude: 1.29398,
    longitude: 103.77104,
    accuracy: 8,
  });

  expect(await screen.findByText("You've reached the bus stop")).toBeTruthy();
  expect(screen.getByText("Choose this stop")).toBeTruthy();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    "You've reached the bus stop. Kent Ridge Crescent, Bus Stop 18301.",
  );
});

it("keeps walking direction map controls fixed independently of the sheet", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const mapSideControlTopOffset = 190",
    "top: mapSideControlTopOffset",
    "right: mapOverlayMargin",
    "width: rightToolbarWidth",
    "zIndex: mapLayerZ.sideControls",
    "directionsActive={directionsActive}",
    "onStopDirections",
    "mapReady && !searchActive",
  ].forEach((token) => expect(source).toContain(token));
});

it("supports landmark search without automatically selecting a bus stop", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "University Hall",
  );
  await screen.findByText("Places");
  fireEvent.press(
    screen.getByLabelText(
      "University Hall, place. Select to view nearby bus stops.",
    ),
  );

  await screen.findByText("Unable to load map");
  expect(screen.queryByLabelText(/Selected stop/i)).toBeNull();
  expect(screen.getByLabelText("Select bus stop manually")).toBeTruthy();
});

it("uses mature Leaflet clustering while keeping priority stops independent", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  );

  [
    'import "leaflet.markercluster"',
    "markerClusterGroup({",
    "chunkedLoading: true",
    "disableClusteringAtZoom: 18",
    "maxClusterRadius: clusterRadiusForZoom",
    "removeOutsideVisibleBounds: true",
    "spiderfyOnMaxZoom: true",
    "<ClusteredStopMarkers",
    "priorityStops.map((stop)",
    "stop.busStopCode !== selectedStop?.busStopCode",
    "stop.busStopCode !== recommendedStopCode",
    "createLeafletMarker(toLatLng(stop)",
    'clusterGroup.on("clusterclick", handleClusterClick)',
  ].forEach((token) => expect(source).toContain(token));

  expect(packageJson.dependencies["leaflet.markercluster"]).toBe("1.5.3");
  expect(packageJson.dependencies["react-leaflet-cluster"]).toBeUndefined();
  expect(packageJson.devDependencies["@types/leaflet.markercluster"]).toBe(
    "1.5.6",
  );
  expect(source).not.toContain("MarkerClusterer");
  expect(source).not.toContain("function clusterStops");
  expect(source).not.toContain("stopClusterHitTarget");
  expect(source).not.toContain("Nearby bus stop map canvas");
});

it("debounces regional stop loading, aborts stale requests, and preserves selected markers", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );

  await waitFor(() =>
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).includes("/api/bus-stops/nearby"),
      ),
    ).toBe(true),
  );
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(queryNearbySheetHeader("collapsed")).toBeNull();

  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  [
    "regionalStopsRequestRef.current.controller?.abort()",
    "}, 225)",
    "if (selectedStop) byCode.set(selectedStop.busStopCode, selectedStop)",
    "regionalStopRadiusForZoom(mapViewport.zoom)",
    'setRegionalStopsStatus("ERROR")',
  ].forEach((token) => expect(source).toContain(token));
});

it("makes Leaflet clusters and marker hierarchy accessible without moving the user", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "function ClusterAccessibilityController",
    "MutationObserver",
    'data-cluster-count="${count}"',
    "Cluster of ${count} nearby bus stops. Activate to zoom in.",
    'event.key !== "Enter" && event.key !== " "',
    "cluster.click()",
    "const label = selected",
    '"Selected bus stop"',
    '"Recommended bus stop"',
    "${stop.description}, ${stop.roadName}, stop ${stop.busStopCode}",
    "zIndexOffset={selected ? 650 : 500}",
    "zIndexOffset={1100}",
    "stopMarkerIcon({",
  ].forEach((token) => expect(source).toContain(token));

  expect(source.indexOf("<ClusteredStopMarkers")).toBeLessThan(
    source.indexOf("priorityStops.map"),
  );
  expect(source.indexOf("priorityStops.map")).toBeLessThan(
    source.indexOf("accessibilityLabel={headingAccessibilityLabel("),
  );
});

it("keeps selected-stop services readable, selectable, and wrapped in every theme", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  const serviceSectionStart = source.indexOf(
    "<View style={styles.stopServiceRow}>",
  );
  const serviceSection = source.slice(
    serviceSectionStart,
    source.indexOf(
      "<View style={styles.serviceUnavailableBlock}",
      serviceSectionStart,
    ),
  );

  [
    "<View style={styles.stopServiceRow}>",
    "{services.map((service) =>",
    "backgroundColor: selected",
    "theme.colors.surfaceSelected",
    "theme.colors.surfaceInteractive",
    "theme.colors.borderSelected",
    "theme.colors.borderInteractive",
    "theme.colors.textOnSelected",
    "theme.colors.actionPrimary",
    "highContrast && styles.highContrastServiceChip",
    'accessibilityRole="button"',
    'accessibilityLabel={`Bus service ${service}${selected ? ", selected" : ""}`}',
    "accessibilityState={{ selected }}",
    "<CircleCheck",
    'flexWrap: "wrap"',
    "minHeight: touchTarget.min",
    "fontSize: 18",
    "const compactServiceChips = sheetViewportWidth <= 320",
    "const numberFirstServiceChips = sheetViewportWidth < 300",
    "styles.compactStopServiceChip",
    "!numberFirstServiceChips",
    "paddingHorizontal: 8",
    'label="Choose this stop"',
  ].forEach((token) => expect(source).toContain(token));

  expect(serviceSection).not.toContain("services.slice(");
  expect(serviceSection).not.toContain("disabled=");
  expect(serviceSection).not.toContain("opacity:");
  expect(serviceSection).not.toContain("serviceDisabled");
  expect(serviceSection).not.toContain("styles.highContrastControl");

  const relativeLuminance = (hex: string) => {
    const channels = hex
      .match(/[\da-f]{2}/gi)!
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrastRatio = (foreground: string, background: string) => {
    const values = [
      relativeLuminance(foreground),
      relativeLuminance(background),
    ].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const serviceChipThemePairs = [
    ["#0B6670", "#FFFFFF"],
    ["#62D4E8", "#203B43"],
    ["#074B6A", "#FFFFFF"],
    ["#7FE8FF", "#181818"],
    ["#FFFFFF", "#0B6670"],
    ["#EFFFFF", "#0F4E5A"],
    ["#FFFFFF", "#074B6A"],
    ["#000000", "#9FF2FF"],
  ];
  serviceChipThemePairs.forEach(([foreground, background]) => {
    expect(source).toContain(foreground);
    expect(source).toContain(background);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

it("uses a label-free navigation puck and never creates empty Leaflet overlays", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const mapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    'className: "goassist-leaflet-marker goassist-user-location-marker"',
    'class="goassist-user-puck',
    'data-user-heading="true"',
    'return "Your location"',
    "const normalizedAccessibilityLabel = accessibilityLabel.trim()",
    'element.removeAttribute("aria-label")',
    "title={normalizedAccessibilityLabel || undefined}",
  ].forEach((token) => expect(mapSource).toContain(token));

  expect(mapSource).not.toContain('data-user-location-label="true"');
  expect(mapSource).not.toContain(">You<");

  expect(mapSource).not.toMatch(/\bTooltip\b/);
  expect(mapSource).not.toMatch(/\bPopup\b/);
  expect(mapSource).not.toContain("bindTooltip");
  expect(mapSource).not.toContain("bindPopup");
  expect(mapSource).not.toContain('class="marker-label"></');
});

it("does not render empty search shells and keeps selected-stop actions above navigation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const showSearchResults = query.trim().length > 0",
    "showSearchResults && !selectedStop",
    'if (state === "HIDDEN_PEEK" || nearbySheetClosed)',
    "return null",
    "const hasQuery = searchState.query.trim().length > 0",
    "Search for a bus stop or place",
    "styles.selectedStopSheetBody",
    "styles.selectedStopActions",
    "bottom: bottomNavigationHeight",
    "mapBottomSheetSelectedStop",
  ].forEach((token) => expect(source).toContain(token));

  expect(
    source.indexOf(
      "</ScrollView>\n          <View\n            style={[\n              styles.selectedStopActions",
    ),
  ).toBeGreaterThan(-1);
});

it("records real provider panning without fabricating a camera jump", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const webMapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "const markMapMoved = useCallback",
    'setViewportSource("USER_PAN")',
    'setMapCameraMode("MANUAL")',
    "setMapManuallyMoved(true)",
    "handleProviderViewportChange",
  ].forEach((token) => expect(appSource).toContain(token));
  ["dragstart:", "zoomstart:", "moveend:", "map.getCenter()"].forEach((token) =>
    expect(webMapSource).toContain(token),
  );

  expect(appSource).not.toContain("latitude: current.center.latitude + 0.0038");
  expect(appSource).not.toContain(
    "longitude: current.center.longitude + 0.0108",
  );
  expect(appSource).not.toContain(
    'zoom: clampMapZoom(current.zoom - 1, "USER_PAN")',
  );
});

it("keeps narrow controls, the Nearby sheet, and OSM attribution in safe layers", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const mapCss = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.css"),
    "utf8",
  );

  [
    "const mapSideControlTopOffset = 190",
    "right: mapOverlayMargin",
    "width: rightToolbarWidth",
    "mapBottomSheetGrabber",
    "collapsedNearbyHeading",
    "bottom: bottomNavigationHeight",
    "zIndex: mapLayerZ.sheet",
  ].forEach((token) => expect(appSource).toContain(token));
  [
    ".leaflet-control-attribution",
    "margin-top: 78px !important",
    "max-width: min(240px, calc(100% - 24px))",
    "pointer-events: auto",
    "z-index: 850",
  ].forEach((token) => expect(mapCss).toContain(token));
});

it("preserves zoom-derived stop clustering in the native renderer", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const nativeMapSource = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "NativeJourneyMap.native.tsx",
    ),
    "utf8",
  );

  [
    "clusterStops(",
    "selectedStop?.busStopCode",
    "viewport.zoom",
    "onPress={() => onFocusCluster(cluster.center)}",
    "coordinate={cluster.center}",
    "cluster.stops.length",
  ].forEach((token) => expect(nativeMapSource).toContain(token));

  [
    "focusStopCluster",
    '"CLUSTER_EXPAND"',
    '"expandCluster"',
    "Zooming into clustered nearby bus stops.",
  ].forEach((token) => expect(appSource).toContain(token));
});

it("uses a keyless OpenStreetMap web provider with clean retry lifecycle", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const webMapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );
  const mapConfigSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "mapConfig.ts"),
    "utf8",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
  );

  [
    "function shouldUseOpenStreetMapProvider",
    "<JourneyMap",
    "MapProviderUnavailableState",
    'webProvider: Platform.OS === "web" ? "OPENSTREETMAP" : undefined',
    'console.info("[Map] retry requested"',
    "setMapProviderRetryKey",
  ].forEach((token) => expect(appSource).toContain(token));

  [
    "MapContainer",
    "TileLayer",
    "WEB_TILE_URL",
    "WEB_TILE_ATTRIBUTION",
    "tileerror: handleTileError",
    "tileload: handleTileLoad",
    'useState<ProviderState>("INITIALIZING")',
    "key={providerRetryKey}",
    "ResizeObserver",
    "map.invalidateSize({ animate: false, pan: false })",
  ].forEach((token) => expect(webMapSource).toContain(token));

  [
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "OpenStreetMap</a> contributors",
    "EXPO_PUBLIC_MAP_TILE_URL",
    "DEFAULT_ZOOM",
    "MIN_MAP_ZOOM",
    "MAX_MAP_ZOOM",
  ].forEach((token) => expect(mapConfigSource).toContain(token));

  expect(appSource).not.toContain("function shouldUseGoogleMapsProvider");
  expect(appSource).not.toContain("GoogleMapsProviderJourneyMap");
  expect(appSource).not.toContain("loadGoogleMapsSdk");
  expect(appSource).not.toContain("@googlemaps/");
  expect(appSource).not.toContain("AIza");
  expect(appSource).not.toContain("Nearby bus stop map canvas");
  expect(appSource).not.toContain("mapSelectionHidesTabBar");
  expect(appSource).not.toContain("bottomNavigationVisible");
  expect(packageJson.dependencies.leaflet).toBe("1.9.4");
  expect(packageJson.dependencies["react-leaflet"]).toBe("4.2.1");
  expect(packageJson.dependencies["@googlemaps/js-api-loader"]).toBeUndefined();
  expect(
    packageJson.dependencies["@googlemaps/markerclusterer"],
  ).toBeUndefined();
});

it("uses provider-native geographic maps on Android and iOS", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const nativeMapSource = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "components",
      "NativeJourneyMap.native.tsx",
    ),
    "utf8",
  );
  const nativeWrapperSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.native.tsx"),
    "utf8",
  );
  const expoConfigSource = fs.readFileSync(
    path.join(__dirname, "..", "app.config.js"),
    "utf8",
  );

  [
    "function shouldUseNativeMapsProvider",
    "<JourneyMap",
    "nativeMapsProviderConfigured",
  ].forEach((token) => expect(appSource).toContain(token));

  ["NativeJourneyMap", "<NativeJourneyMap {...props}"].forEach((token) =>
    expect(nativeWrapperSource).toContain(token),
  );

  [
    "react-native-maps",
    "provider={PROVIDER_GOOGLE}",
    "style={StyleSheet.absoluteFillObject}",
    "<Marker",
    "coordinate={currentLocation}",
    "<Circle",
    "<Polyline",
    "onRegionChangeComplete",
    "clusterStops(",
  ].forEach((token) => expect(nativeMapSource).toContain(token));

  [
    "../../.env",
    "googleMapsApiKey",
    "googleMaps",
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
  ].forEach((token) => expect(expoConfigSource).toContain(token));

  expect(nativeMapSource).not.toContain("window.innerWidth");
  expect(nativeMapSource).not.toContain("Dimensions.get");
  expect(expoConfigSource).not.toContain("AIza");
});

it("keeps the Journey map visual hierarchy closer to a polished navigation map", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const webMapSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "JourneyMap.web.tsx"),
    "utf8",
  );

  [
    "MapLayerQuickControls",
    "mapReady && !searchActive",
    "mapTopControlRowHeight",
    "mapSideControlTopOffset",
  ].forEach((token) => expect(appSource).toContain(token));

  [
    "MapContainer",
    "TileLayer",
    "<Polyline",
    "routeOutline",
    "routePrimary",
    "<AccessibleMarker",
    "stopMarkerIcon({",
    "vehicleIcon(",
    "userLocationIcon(",
  ].forEach((token) => expect(webMapSource).toContain(token));

  [
    "busStopGlyphWindow",
    "busStopGlyphWheels",
    "selectedBusStopGlyphWindow",
    "nearestBusStopGlyphWheel",
  ].forEach((token) => expect(appSource).not.toContain(token));
});

it("keeps the selected stop when arrival loading fails", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nearbyStopsResponse),
      });
    }

    if (url.includes("/api/location/bus-stops/18301/arrivals")) {
      return Promise.resolve({
        ok: false,
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("BOARDING AT")).toBeTruthy();
  expect(screen.getByText("Which bus are you taking?")).toBeTruthy();
  expect(screen.getByText("Arrival info unavailable")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it.each([
  ["33", "Kent Ridge Ter"],
  ["196", "Clementi Int"],
] as const)(
  "keeps stop 19069 service %s selectable and route-capable without live arrivals",
  async (serviceNo, destinationName) => {
    mockStop19069Apis();
    render(<App />);

    fireEvent.press(screen.getByText("Select bus stop manually"));
    await screen.findByLabelText("Nearby bus stops");
    fireEvent.press(
      screen.getByLabelText(/Recommended stop. Opp Ayer Rajah Telecoms/i),
    );

    expect(screen.getByText("Services")).toBeTruthy();
    const service33 = screen.getByLabelText("Bus service 33");
    const service196 = screen.getByLabelText("Bus service 196");
    expect(service33.props.accessibilityRole).toBe("button");
    expect(service196.props.accessibilityRole).toBe("button");

    fireEvent.press(serviceNo === "33" ? service33 : service196);
    expect(
      screen.getByLabelText(`Bus service ${serviceNo}, selected`).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    fireEvent.press(screen.getByText("Choose this stop"));

    await screen.findByText("Choose your bus");
    expect(screen.getAllByText("33").length).toBeGreaterThan(0);
    expect(screen.getAllByText("196").length).toBeGreaterThan(0);
    expect(
      await screen.findByText("Live arrival temporarily unavailable."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "You can still choose your destination and view the route.",
      ),
    ).toBeTruthy();
    expect(
      (await screen.findAllByText(destinationName)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Where are you getting off?")).toBeTruthy();
    expect(screen.getByText("Retry live arrivals")).toBeTruthy();
  },
);

it("reuses cached nearby stops when manual selection is opened again", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Back to map"));
  fireEvent.press(screen.getByLabelText("Back to previous view"));
  fireEvent.press(screen.getByText("Select bus stop manually"));

  await waitFor(() => {
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes("/api/location/nearby-bus-stops"),
      ),
    ).toHaveLength(1);
  });
});

it("does not refetch fresh arrivals for the same confirmed stop", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(nearbyStopsResponse),
      });
    }

    if (url.includes("/api/location/bus-stops/18301/arrivals")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...arrivalsResponse,
            services: [{ serviceNo: "95", buses: [] }],
          }),
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  expect(
    (await screen.findAllByText("Live arrival unavailable")).length,
  ).toBeGreaterThan(0);

  expect(
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/api/location/bus-stops/18301/arrivals"),
    ),
  ).toHaveLength(1);
});

it("searches stop codes and supports result selection", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "18321",
  );
  await screen.findByText("Opp Heng Mui Keng Terrace");
  fireEvent.press(
    screen.getByLabelText(
      /Opp Heng Mui Keng Terrace, Bus Stop 18321, Kent Ridge Cres/i,
    ),
  );
  expect(
    screen.getByLabelText("Selected stop Opp Heng Mui Keng Terrace"),
  ).toBeTruthy();
});

it("shows a compact manual fallback when location permission is denied", async () => {
  mockSuccessfulJourneyApis();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "denied",
  });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByText("Location access is off");
  expect(
    screen.getByText(
      "Allow location access to automatically find nearby bus stops.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Use my location")).toBeNull();
  expect(
    screen.queryByText("Choose a nearby stop and the bus you want to board."),
  ).toBeNull();
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.anything(),
  );

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  expect(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  ).toBeTruthy();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        latitude: 1.3521,
        longitude: 103.8198,
        accuracyMeters: 0,
      }),
    }),
  );
});

it("distinguishes a device location failure from a map provider failure", async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
    new Error("Device location unavailable"),
  );
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByText("We couldn't find your location");
  expect(
    screen.getByText(
      "Check your location settings or choose a bus stop manually.",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Try again")).toBeTruthy();
  expect(screen.getByLabelText("Select bus stop manually")).toBeTruthy();
  expect(screen.queryByText("Use my location")).toBeNull();
  expect(screen.queryByTestId("journey-location-loading-panel")).toBeNull();
  expect(screen.queryByText("Unable to load map")).toBeNull();
});

it("recovers when the browser location permission request never settles", async () => {
  const realSetTimeout = global.setTimeout;
  const timeoutSpy = jest
    .spyOn(global, "setTimeout")
    .mockImplementation(((callback: (...args: any[]) => void, delay?: number) => {
      if (delay === 8_000) {
        Promise.resolve().then(callback);
        return 1 as any;
      }
      return realSetTimeout(callback, delay);
    }) as typeof global.setTimeout);
  try {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<App />);

    fireEvent.press(screen.getByText("Use my location"));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("We couldn't find your location")).toBeTruthy();
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 8_000);
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    expect(screen.getByLabelText("Select bus stop manually")).toBeTruthy();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId("journey-location-loading-panel")).toBeNull();
  } finally {
    timeoutSpy.mockRestore();
  }
});

it("uses a recent last-known location when a fresh device fix is unavailable", async () => {
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  const fallbackCoordinates = {
    latitude: 1.3004,
    longitude: 103.7802,
    accuracy: 35,
  };
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
    new Error("Fresh location unavailable"),
  );
  (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
    coords: fallbackCoordinates,
    timestamp: Date.now() - 15_000,
  });
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByLabelText("Search bus stop, service or place");
  expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({
    maxAge: 5 * 60_000,
    requiredAccuracy: 1_000,
  });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        latitude: fallbackCoordinates.latitude,
        longitude: fallbackCoordinates.longitude,
        accuracyMeters: fallbackCoordinates.accuracy,
      }),
    }),
  );
  const mapMock = require("../__mocks__/JourneyMap") as {
    getLastJourneyMapProps: () => {
      currentLocation: { latitude: number; longitude: number };
      viewport: { center: { latitude: number; longitude: number } };
    };
  };
  expect(mapMock.getLastJourneyMapProps().currentLocation).toMatchObject({
    latitude: fallbackCoordinates.latitude,
    longitude: fallbackCoordinates.longitude,
  });
  expect(
    Math.abs(
      mapMock.getLastJourneyMapProps().viewport.center.latitude -
        fallbackCoordinates.latitude,
    ),
  ).toBeLessThan(0.01);
  expect(
    Math.abs(
      mapMock.getLastJourneyMapProps().viewport.center.longitude -
        fallbackCoordinates.longitude,
    ),
  ).toBeLessThan(0.01);
});

it("keeps a found location visible when nearby stops fail across Journey entry and map", async () => {
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 12,
    },
  });
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.reject(new Error("Network request failed"));
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByLabelText("Search bus stop, service or place");
  const mapMock = require("../__mocks__/JourneyMap") as {
    getLastJourneyMapProps: () => {
      currentLocation: { latitude: number; longitude: number };
      viewport: { center: { latitude: number; longitude: number } };
    };
  };
  expect(mapMock.getLastJourneyMapProps().currentLocation).toMatchObject({
    latitude: 1.2942,
    longitude: 103.7711,
  });
  expect(
    Math.abs(mapMock.getLastJourneyMapProps().viewport.center.latitude - 1.2942),
  ).toBeLessThan(0.01);
  expect(
    Math.abs(
      mapMock.getLastJourneyMapProps().viewport.center.longitude - 103.7711,
    ),
  ).toBeLessThan(0.01);
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(screen.queryByLabelText("Nearby bus stops")).toBeNull();
  expect(screen.queryByText("Couldn't find your location")).toBeNull();
  expect(
    screen.getByLabelText(/Journey, tab, selected, map ready, 1 of 3/),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  ).toBeTruthy();
  expect(screen.getByLabelText(/Profile, tab, 3 of 3/)).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Retry map"));
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(
    screen.getByLabelText(/Journey, tab, selected, map ready, 1 of 3/),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Back to previous view"));
  expect(screen.getByText("Location found")).toBeTruthy();
  expect(screen.getByText("Nearby stops couldn't be loaded.")).toBeTruthy();
  expect(screen.queryByText("We couldn't determine your location.")).toBeNull();

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));
  await screen.findByLabelText("Search bus stop, service or place");
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(screen.getByLabelText("Nearby bus stops")).toBeTruthy();
  expect(screen.getByText("Couldn't load nearby stops")).toBeTruthy();
});

it("searches by stop code after nearby loading fails and continues to bus selection", async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 12,
    },
  });
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.reject(new Error("Network request failed"));
    }

    if (url.includes("/api/location/bus-stops/18341/arrivals")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            busStop: {
              busStopCode: "18341",
              roadName: "Kent Ridge Cres",
              description: "Central Library",
              latitude: 1.29618,
              longitude: 103.77331,
            },
            services: [
              {
                serviceNo: "151",
                destination: "Hougang Central",
                buses: [],
              },
            ],
          }),
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));
  await screen.findByLabelText("Search bus stop, service or place");

  fireEvent.press(screen.getByLabelText("Select bus stop manually"));
  await screen.findByText("Couldn't load nearby stops");
  fireEvent.press(screen.getByText("Search for a stop"));
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "18341",
  );

  await screen.findByText("Central Library");
  expect(screen.getByText("Bus Stop 18341")).toBeTruthy();
  fireEvent.press(
    screen.getByLabelText(/Central Library, Bus Stop 18341, Kent Ridge Cres/i),
  );

  expect(screen.getByLabelText("Selected stop Central Library")).toBeTruthy();
  expect(screen.getByText("Choose this stop")).toBeTruthy();

  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  expect(
    screen.getByLabelText(/Bus 151 towards Hougang Central/i),
  ).toBeTruthy();
});

it("groups local search results for stop names, places, services and empty queries", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");

  fireEvent(
    screen.getByLabelText("Search bus stop, service or place"),
    "focus",
  );
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "Central",
  );

  await screen.findByText("Bus Stops");
  expect(screen.getByText("Central Library")).toBeTruthy();
  expect(screen.getByText("Opp Central Library")).toBeTruthy();

  fireEvent.press(screen.getAllByLabelText("Clear search")[0]);
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "Kent Ridge MRT",
  );
  await screen.findByText("Places");
  expect(screen.getAllByText("Kent Ridge MRT").length).toBeGreaterThan(0);

  fireEvent.press(screen.getAllByLabelText("Clear search")[0]);
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "151",
  );
  await screen.findByText("Bus Services");
  expect(screen.getByLabelText("Service 151. Stops serving 151.")).toBeTruthy();

  fireEvent.press(screen.getAllByLabelText("Clear search")[0]);
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "not-a-real-stop",
  );
  await screen.findByText("No matches found");
});

it("shows a neutral empty nearby state without stacking a generic error", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...nearbyStopsResponse,
            stops: [],
          }),
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  expect(screen.getByText("No nearby stops found")).toBeTruthy();
  expect(screen.getByText("Move the map or search another area.")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
  expect(screen.queryByText("0 stops near you")).toBeNull();
});

it("keeps short nearby states content-fit above the shared bottom navigation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).toContain("mapBottomSheetContentFit");
  expect(source).toContain('"HIDDEN_PEEK"');
  expect(source).toContain("lastExpandedSheetState");
  expect(source).toContain("mapBottomSheetHiddenPeek");
  expect(source).toContain("APP_ICONS.expand");
  expect(source).toContain("APP_ICONS.collapse");
  expect(source).toContain("const shortNearbyState");
  expect(source).toContain("effectiveSheetStyle");
  expect(source).toContain("const bottomNavigationHeight = 86");
  expect(source).toContain("const mapBottomSheetHeights");
  expect(source).toContain("bottom: bottomNavigationHeight");
  expect(source).toContain('overflow: "hidden"');
  expect(source).toContain('scrollEnabled={screen !== "STOP"}');
  expect(source).toContain("styles.mapWorkspaceScroll");
  expect(source).toContain("flexGrow: 1");
  expect(source).toContain('height: "100%"');
  expect(source).toContain("maxHeight: 360");
  expect(source).toContain("flexShrink: 1");
  expect(source).toContain("minHeight: mapBottomSheetHeights.HIDDEN_PEEK");
  expect(source).toContain("paddingBottom: 0");
  expect(source).toContain("borderTopWidth: 1");
  expect(source).toContain("zIndex: mapLayerZ.sheet");
  expect(source).toContain("zIndex: mapLayerZ.navigation");
  expect(source).not.toContain("height: 720");
});

it("keeps the high contrast light no-stops nearby state compact and visible", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const shortNearbyState",
    "styles.mapBottomSheetContentFit",
    "styles.mapBottomSheetCompactContent",
    "styles.mapBottomSheetTitle",
    "showSearchResults",
    "No matching stops found",
    "No nearby stops found",
    "Try another stop, road or place.",
    "Move the map or search another area.",
    'primaryActionLabel="Search stops"',
    'secondaryActionLabel="Search for a stop"',
    'primaryActionLabel?.toLowerCase().includes("search")',
    "bottom: bottomNavigationHeight",
    "active &&",
    "highContrast &&",
    "lightMode &&",
    "lightStyles.highContrastSelectedControl",
    "active",
    "? theme.colors.iconSelected",
    ": theme.colors.map.controlIcon",
    ": theme.colors.textPrimary",
    "minHeight: 48",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toMatch(
    /blackHand|debugPointer|gesturePointer|touchCursor|[☝👆👉🖐✋🤚]/,
  );
});

it("uses a shared map overlay layout manager with reserved toolbar space", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const rightToolbarWidth = 64",
    "const mapOverlayMargin = 12",
    "const mapTopOverlayMargin = 18",
    "const mapTopControlGap = 8",
    "const overlayLayout",
    "paddingRight: rightToolbarWidth + mapOverlayMargin",
    "mapOverlayLayoutManager",
    "mapTopControlRow",
    "mapSearchOverlay",
    "minWidth: 0",
    "const contextualMapControl",
    'type: "SEARCH_THIS_AREA"',
    "Invalid contextual map control",
    "ContextualMapControlIcon",
    "Find bus stops in the currently visible map area",
    "right: rightToolbarWidth + mapOverlayMargin + 8",
    "width: rightToolbarWidth",
    "Search stops or places",
    "No nearby stops found",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain('position: "absolute",\n    top: 72');
  expect(source).not.toContain("No bus stops found in this area.");
});

it("keeps More as a compact prioritized settings sheet", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const contextualMapControl",
    "!showMoreControls",
    "mapReady && searchThisAreaVisible && !showMoreControls && !searchActive",
    "ContextualMapControlIcon",
    "Invalid contextual map control",
    "const effectiveBottomSheetState",
    "state={effectiveBottomSheetState}",
    "mapReady && showMoreControls",
    "mapMoreHeader",
    "mapMoreCloseButton",
    "mapMoreSwitch",
    "mapMoreSwitchKnob",
    "bottom: bottomNavigationHeight + mapOverlayMargin",
    'maxHeight: "70%"',
    "paddingBottom: 20",
    "zIndex: mapLayerZ.morePanel",
    "PrimaryActionIcon",
    "? Search",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("const showAccessibilityNotice");
  expect(source).not.toContain("Accessibility information unavailable here");
});

it("keeps floating map controls viewport-anchored and limited to core actions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const mapSideControlTopOffset = 190",
    "top: mapSideControlTopOffset",
    "sideControls: 45",
    "morePanel: 46",
    "sheet: 40",
    "navigation: 50",
    'testID="map-side-control-stack"',
    'key: "locate"',
    'key: "nearby"',
    'key: "more"',
    'label="Directions"',
    "styles.selectedStopServicePill",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("directionsMode");
  expect(source).not.toContain("compactMapSideControls");
  expect(source).not.toContain("compactMapSideControl");
  expect(source).not.toContain('key: "directions"');
  expect(source).not.toContain("const stackBottom");
  expect(source).not.toContain("directionsControlSheetHeights[sheetState]");
  expect(source).not.toContain("mapBottomSheetHeights[sheetState]");
  expect(source).not.toContain("mapControlSheetClearance");
  expect(source).not.toContain("styles.mapSideControlsExpanded");
});

it("defines dark mode visibility tokens for controls, overlays, icons, and disabled states", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "textMuted",
    "iconPrimary",
    "iconSecondary",
    "iconSelected",
    "iconDisabled",
    "iconOnAccent",
    "selectedSurface",
    "mapOptionsScrim",
    "highContrastMapOptionsScrim",
    'indicatorStyle={lightMode ? "black" : "white"}',
    "rowIconColor",
    "backgroundColor: disabled",
    "selectedForeground",
    "theme.colors.selectedSurface",
    "disabledLabelColor",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("opacity: 0.25");
});

it("uses explicit app icon mappings with a development fallback", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const APP_ICONS",
    "journey: Route",
    "assist: Accessibility",
    "profile: User",
    "locate: LocateFixed",
    "nearby: List",
    "more: SlidersHorizontal",
    "search: Search",
    "back: ArrowLeft",
    "expand: ChevronUp",
    "collapse: ChevronDown",
    "Missing icon mapping:",
    "return CircleHelp",
    "function tabIconColor",
  ].forEach((token) => {
    expect(source).toContain(token);
  });
  expect(source).not.toContain('label="Home"');
  expect(source).not.toContain('icon="home"');
});

it("integrates the centralized illustrations without framed-image fallbacks", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "App.tsx"),
    "utf8",
  );
  const illustrationSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "components", "FeatureIllustration.tsx"),
    "utf8",
  );
  const illustrationRegistrySource = fs.readFileSync(
    path.join(__dirname, "..", "src", "illustrations.ts"),
    "utf8",
  );
  const suppliedAssets = [
    "home_find_bus.png",
    "wheelchair_ramp.png",
    "extra_boarding_time.png",
    "audio_identification.png",
  ].map((filename) => path.join(__dirname, "..", "assets", filename));
  const homeLoadingSource = appSource.slice(
    appSource.indexOf("function LocationLoadingPanel"),
    appSource.indexOf("function FeatureHero"),
  );

  [
    "type LoadingVisualKind",
    "function FeatureHero",
    "function JourneyFindBusIllustration",
    "function StatusConceptVisual",
    "function LargeTextConceptVisual",
    "function HighContrastConceptVisual",
    "shouldStackJourneyIntro",
    "function FindBusPanel",
    "function LocationLoadingPanel",
    "function LocationSearchVisual",
    "function resolveFindBusPanelState",
    "type FindBusPanelState",
    "useDelayedLoadingVisibility",
    'useDelayedFlag(state.kind === "LOCATING", 4000)',
    "Taking longer than expected?",
    "locationLookupRequestRef.current += 1",
    "locationLookupRequestId !== locationLookupRequestRef.current",
    "width < 340 || fontScale >= 1.2 || largeText",
    "width < 360 || fontScale >= 1.2 || largeText",
    'testID="journey-feature-hero"',
    'testID="journey-hero-artwork"',
    'testID="journey-location-loading-panel"',
    'testID="location-loading-artwork"',
    "journeyIntroPanel",
    "stackedJourneyIntroPanel",
    "lightStyles.journeyIntroPanel",
    "journeyIntroCopy",
    "largeJourneyIntroCopy",
    "journeyIntroArtwork",
    "stackedJourneyIntroArtwork",
    'flexBasis: "36%"',
    "minHeight: 116",
    'overflow: "hidden"',
    "paddingBottom: 170",
    "compactContainer",
    "toggleIllustrationSlot",
    "stackedToggleIllustrationSlot",
    "journeyEntryContainer",
    "journeyFindBusActions",
    "paddingBottom: bottomNavigationHeight + spacing.lg",
    "locationLoadingProgress",
    "locationSearchVisual",
    "source={illustrations.homeFindBus}",
    "illustrationSource={illustrations.wheelchairRamp}",
    "illustrationSource={illustrations.extraBoardingTime}",
    "illustrationSource={illustrations.audioIdentification}",
  ].forEach((token) => expect(appSource).toContain(token));

  [
    "height: 130",
    "source={illustrations.nearbyStops}",
    "illustrations.homeBusStopHero",
    "illustrations.extraTime",
    "function HomeBusIntroIllustration",
    "loadingIllustrationForMessage",
    "Large text accessibility mode shown on a phone",
    "High contrast display mode on a phone",
    "Illustration of nearby accessible bus stops on a map",
  ].forEach((token) => expect(appSource).not.toContain(token));

  expect(illustrationSource).toContain(
    'export type FeatureIllustrationSize = "small" | "medium" | "large" | "hero"',
  );
  expect(illustrationSource).toContain("style?: StyleProp<ViewStyle>");
  expect(illustrationSource).toContain('resizeMode="contain"');
  expect(illustrationSource).toContain("accessibilityIgnoresInvertColors");
  expect(illustrationSource).toContain(
    'importantForAccessibility={decorative ? "no" : "auto"}',
  );
  expect(illustrationSource).not.toContain("borderWidth");
  expect(illustrationSource).not.toContain("backgroundColor");
  expect(illustrationSource).not.toContain("Image.resolveAssetSource");
  expect(illustrationSource).not.toContain('height: "100%"');
  expect(illustrationSource).not.toContain('width: "100%"');
  [
    'homeFindBus: require("../assets/home_find_bus.png")',
    'wheelchairRamp: require("../assets/wheelchair_ramp.png")',
    'extraBoardingTime: require("../assets/extra_boarding_time.png")',
    'audioIdentification: require("../assets/audio_identification.png")',
  ].forEach((token) => expect(illustrationRegistrySource).toContain(token));
  suppliedAssets.forEach((asset) => {
    expect(fs.existsSync(asset)).toBe(true);
    expect(fs.statSync(asset).size).toBeGreaterThan(50_000);
  });
  expect(appSource).not.toContain("illustrations.locationLoading");
  expect(appSource.match(/illustrations\.wheelchairRamp/g)).toHaveLength(1);
  expect(appSource.match(/illustrations\.extraBoardingTime/g)).toHaveLength(1);
  expect(appSource.match(/illustrations\.audioIdentification/g)).toHaveLength(
    1,
  );
  expect(appSource).not.toContain("paddingRight: 128");
  expect(appSource).not.toContain("largeTextHomeIntroPanel");
  expect(homeLoadingSource).toContain("function LocationSearchVisual");
  expect(homeLoadingSource).toContain('accessibilityRole="progressbar"');
  expect(homeLoadingSource).toContain("locationLoadingProgress");
  expect(homeLoadingSource).toContain("locationSearchVisual");
  expect(homeLoadingSource).not.toContain("ActivityIndicator");
});

it("keeps visible zoom controls removed and strengthens selected bottom tabs", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).not.toContain("function MapZoomControls");
  expect(source).not.toContain("Zoom map in");
  expect(source).not.toContain("Zoom map out");
  expect(source).not.toContain("mapZoomBottomOffset");
  expect(source).not.toContain("mapOverlayGap");
  expect(source).toContain("selectedTabIconBadge");
  expect(source).toContain("height: 38");
  expect(source).toContain("width: 46");
  expect(source).toContain('textTransform: "uppercase"');
});

it("keeps simulator-only journey controls behind a development gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).toContain("__DEV__ ? (");
  expect(source).toContain("Simulate next stop");
  expect(source).toContain("I'm onboard");
  expect(source).not.toContain('label="Passenger is onboard"');
});

it("keeps focused assistance available without duplicating Profile settings", async () => {
  await selectBusFromManualStopFlow();

  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.queryByText("Set app accessibility")).toBeNull();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("We can't identify your bus stop yet.");
  expect(screen.getByLabelText("Use my location")).toBeTruthy();
  expect(screen.getByLabelText("Choose bus stop")).toBeTruthy();
  expect(screen.queryByText("Profile required")).toBeNull();
});

it("keeps display accessibility controls out of Assist for guest journeys", async () => {
  await selectBusFromManualStopFlow();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await waitFor(() =>
    expect(
      screen.getByText("We can't identify your bus stop yet."),
    ).toBeTruthy(),
  );
  expect(screen.queryByText("Phone Accessibility")).toBeNull();
  expect(screen.queryByText("Appearance")).toBeNull();
  expect(screen.queryByText("Screen-reader optimised")).toBeNull();
  expect(screen.queryByText("Haptic alerts")).toBeNull();
  expect(screen.queryByText("Large text")).toBeNull();
  expect(screen.queryByText("High contrast")).toBeNull();
});

it("keeps persistent assistance configuration in Profile instead of Assist", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));

  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");
  expect(screen.getByLabelText("Request ramp for Service 95")).toBeTruthy();
  expect(screen.queryByLabelText("Hear your bus, selected")).toBeNull();

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  expect(
    screen.getAllByLabelText(
      "Passenger defaults: Bus identification assistance.",
    ).length,
  ).toBeGreaterThan(0);
});

it("uses a real checkmark icon for selected assistance preference cards", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "CheckCircle2",
    "<CheckCircle2",
    "Circle",
    "<Circle",
    '`${label}, ${enabled ? "selected" : "not selected"}`',
    "selected: enabled",
  ].forEach((token) => expect(source).toContain(token));

  [
    "compactSelectionCheck",
    "compactSelectionCheckShort",
    "compactSelectionCheckLong",
    "compactSelectionEmptyDot",
    "compactSelectionIndicatorSelected",
  ].forEach((token) => expect(source).not.toContain(token));
});

it("uses teal Profile badge tokens for passenger default chips and icons", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "profileBadgeSurface",
    "profileBadgeBorder",
    "profileBadgeIcon",
    "profileBadgeText",
    "profileBadgeSelectedSurface",
    "profileBadgeSelectedBorder",
    "profileBadgeSelectedIcon",
    "theme.colors.profileBadgeSurface",
    "theme.colors.profileBadgeBorder",
    "theme.colors.profileBadgeIcon",
    "theme.colors.profileBadgeText",
  ].forEach((token) => expect(source).toContain(token));

  [
    "borderColor: colors.assistance",
    "tintColor: colors.assistance",
    "lightStyles.defaultsIconChip",
    "highContrastDefaultsIconChip",
    "highContrastDefaultsIconImage",
  ].forEach((token) => expect(source).not.toContain(token));
});

it("shows preference saves as a compact dismissible toast without haptic implementation copy", async () => {
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Hearing accessibility settings"));
  fireEvent.press(screen.getByLabelText("Off vibration alerts"));
  fireEvent.press(screen.getByText("Save needs"));

  expect(screen.getByText("Preferences saved")).toBeTruthy();
  expect(screen.queryByText("PROFILE PREFERENCES SAVED.")).toBeNull();
  expect(screen.queryByText("Haptic alert sent.")).toBeNull();

  fireEvent.press(screen.getByLabelText("Preferences saved"));
  expect(screen.queryByText("Preferences saved")).toBeNull();
});

it("separates quick presets from a compact customization list", async () => {
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByText("Edit accessibility preferences"));

  expect(screen.getByText("Quick presets")).toBeTruthy();
  expect(screen.getByText("Customize settings")).toBeTruthy();
  expect(
    screen.getByText(
      "Choose a starting point. You can fine-tune any setting afterwards.",
    ),
  ).toBeTruthy();
  expect(screen.getAllByText("7 options")).toHaveLength(2);
  expect(screen.getAllByText("3 options")).toHaveLength(2);
  expect(
    screen.queryByText(
      "Wheelchair-aware routes, boarding time and accessible stops",
    ),
  ).toBeNull();

  const mobilityPreset = screen.getByLabelText(
    "Apply Mobility support preset",
  );
  expect(mobilityPreset.props.accessibilityState).toMatchObject({
    selected: false,
  });
  fireEvent.press(mobilityPreset);
  expect(
    screen.getByLabelText("Apply Mobility support preset").props
      .accessibilityState,
  ).toMatchObject({ selected: true });
});

it("expands one compact checklist and reveals descriptions on demand", async () => {
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));

  const mobility = screen.getByLabelText("Mobility accessibility settings");
  expect(mobility.props.accessibilityState).toMatchObject({ expanded: false });
  fireEvent.press(mobility);
  expect(
    screen.getByLabelText("Mobility accessibility settings").props
      .accessibilityState,
  ).toMatchObject({ expanded: true });
  expect(screen.getByLabelText("Wheelchair assistance")).toBeTruthy();
  expect(
    screen.queryByText("Request ramp support when boarding"),
  ).toBeNull();

  const wheelchairDetails = screen.getByLabelText(
    "About Wheelchair assistance",
  );
  fireEvent(wheelchairDetails, "hoverIn");
  expect(screen.getByText("Request ramp support when boarding")).toBeTruthy();
  fireEvent(wheelchairDetails, "hoverOut");
  expect(
    screen.queryByText("Request ramp support when boarding"),
  ).toBeNull();
  fireEvent.press(wheelchairDetails);
  expect(screen.getByText("Request ramp support when boarding")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Vision accessibility settings"));
  expect(screen.queryByLabelText("Wheelchair assistance")).toBeNull();
  expect(screen.getByText("Text size")).toBeTruthy();
  expect(
    screen.getByLabelText("Vision accessibility settings").props
      .accessibilityState,
  ).toMatchObject({ expanded: true });
});

it("supports categorized text sizing and visibly enlarges shared controls", async () => {
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Vision accessibility settings"));
  fireEvent.press(screen.getByLabelText("Extra large text"));

  expect(
    screen.getByLabelText("Extra large text").props.accessibilityState,
  ).toMatchObject({ checked: true });

  fireEvent.press(screen.getByLabelText("Interaction accessibility settings"));
  fireEvent.press(screen.getByLabelText("Larger controls"));
  expect(
    StyleSheet.flatten(screen.getByLabelText("Save needs").props.style)
      ?.minHeight,
  ).toBe(68);
});

it("keeps the accessibility editor layout fixed while text-size changes are drafted", async () => {
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Vision accessibility settings"));

  const headingSizeBefore = StyleSheet.flatten(
    screen.getByText("Vision").props.style,
  )?.fontSize;
  fireEvent.press(screen.getByLabelText("Extra large text"));

  expect(
    screen.getByLabelText("Extra large text").props.accessibilityState,
  ).toMatchObject({ checked: true });
  expect(
    StyleSheet.flatten(screen.getByText("Vision").props.style)?.fontSize,
  ).toBe(headingSizeBefore);
  expect(screen.getByLabelText("Save needs")).toBeTruthy();
});

it("shows a simplified next action without creating a second journey flow", async () => {
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Apply Simpler journeys preset"));
  fireEvent.press(screen.getByText("Save needs"));
  fireEvent.press(screen.getByLabelText(/Journey, tab/));

  expect(screen.getByText("STEP 1")).toBeTruthy();
  expect(screen.getByText("Choose your bus stop")).toBeTruthy();
});

it("keeps wheelchair assistance separate from accessible routing dependencies", async () => {
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Mobility accessibility settings"));

  expect(
    screen.getByLabelText("Wheelchair-friendly routing").props
      .accessibilityState,
  ).toMatchObject({ checked: false });
  expect(
    screen.getByLabelText("Avoid steep slopes").props.accessibilityState,
  ).toMatchObject({ disabled: true });
  expect(
    screen.getByLabelText("Prefer accessible stops").props.accessibilityState,
  ).toMatchObject({ disabled: true });

  fireEvent.press(screen.getByLabelText("Wheelchair assistance"));
  expect(
    screen.getByLabelText("Wheelchair assistance").props.accessibilityState,
  ).toMatchObject({ checked: true });
  expect(
    screen.getByLabelText("Wheelchair-friendly routing").props
      .accessibilityState,
  ).toMatchObject({ checked: false });
  expect(
    screen.getByLabelText("Avoid steep slopes").props.accessibilityState,
  ).toMatchObject({ disabled: true });

  fireEvent.press(screen.getByLabelText("Wheelchair-friendly routing"));
  expect(
    screen.getByLabelText("Wheelchair-friendly routing").props
      .accessibilityState,
  ).toMatchObject({ checked: true });
  expect(
    screen.getByLabelText("Avoid steep slopes").props.accessibilityState,
  ).toMatchObject({ disabled: false });
  expect(
    screen.getByLabelText("Prefer accessible stops").props.accessibilityState,
  ).toMatchObject({ disabled: false });
  expect(
    screen.getByLabelText(
      "Avoid steps, included with wheelchair-friendly routing",
    ),
  ).toBeTruthy();
});

it("keeps one canonical global preference state plus the journey override", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  expect(source.match(/useState\(defaultAppPreferences\)/g) ?? []).toHaveLength(
    1,
  );
  expect(source).not.toContain(
    "const [requirements, setRequirements] = useState",
  );
  expect(source).toContain(
    "const [journeyRequirements, setJourneyRequirements]",
  );
});

it("keeps preference save feedback as one overlay toast that auto-dismisses", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "function StatusToast",
    'setVisualAlert("Preferences saved")',
    'AccessibilityInfo.announceForAccessibility("Preferences saved.")',
    "appPreferences.longerMessageDuration",
    "requirements.extendedDwellTime",
    "setTimeout(",
    "onDismiss={() => setVisualAlert(null)}",
    'position: "absolute"',
    "top: 78",
    "minHeight: 52",
    "highContrastLightToast",
    "highContrastDarkToast",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("message.toUpperCase()");
  expect(source).not.toContain(
    'detail={appPreferences.hapticAlerts ? "Haptic alert sent."',
  );
});

it("does not send a focused ramp request until the passenger presses the action", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));

  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");
  const requestCallsBefore = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  expect(requestCallsBefore).toHaveLength(0);

  const rampAction = screen.getByLabelText("Request ramp for Service 95");
  fireEvent.press(rampAction);
  await screen.findByText("REQUEST RECEIVED");
  expect(
    screen.getByLabelText(
      /Assist, tab, (?:selected, )?assistance request active, 2 of 3/,
    ),
  ).toBeTruthy();
  const requestCallsAfter = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  expect(requestCallsAfter).toHaveLength(1);
  const payload = JSON.parse(requestCallsAfter[0]?.[1]?.body ?? "{}");
  expect(payload).toMatchObject({
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
    boardingOrAlighting: "BOARDING",
  });
});

it("runs a grounded typed voice-assistant ramp flow through Focused Assist", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await openJourneyMap();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");

  const ask = async (command: string) => {
    fireEvent.changeText(screen.getByLabelText("Ask GoAssist"), command);
    fireEvent.press(screen.getByLabelText("Send to GoAssist"));
  };
  await ask("What bus is here?");
  expect(
    await screen.findByText("Service 95 is currently at your stop."),
  ).toBeTruthy();

  await ask("Request the ramp.");
  expect(
    await screen.findByText("Request ramp assistance for Service 95?"),
  ).toBeTruthy();
  expect(
    (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) =>
        typeof url === "string" && url.includes("/api/assistance/request"),
    ),
  ).toHaveLength(0);

  await ask("Yes");
  expect(
    await screen.findByText("Your ramp request for Service 95 has been sent."),
  ).toBeTruthy();
  const requestCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  expect(requestCalls).toHaveLength(1);
  expect(JSON.parse(requestCalls[0]?.[1]?.body ?? "{}")).toMatchObject({
    busService: "95",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
  });
});

it("shows a distinct focused ramp error and permits a safe retry", async () => {
  mockSuccessfulJourneyApis();
  const successfulFetch = (global.fetch as jest.Mock).getMockImplementation();
  let failNextRampRequest = true;
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: RequestInit) => {
      if (url.includes("/api/assistance/request") && failNextRampRequest) {
        failNextRampRequest = false;
        return Promise.resolve({ ok: false });
      }
      return successfulFetch!(url, options);
    },
  );
  render(<App />);
  await openJourneyMap();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");

  fireEvent.press(screen.getByLabelText("Request ramp for Service 95"));
  await screen.findByText("REQUEST NOT COMPLETED");
  expect(
    screen.getByText("We couldn't complete the ramp request."),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Try again"));
  await screen.findByText("REQUEST RECEIVED");
  const requestCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  expect(requestCalls).toHaveLength(2);
});

it("asks the passenger to choose when multiple demo buses are present", async () => {
  mockSuccessfulJourneyApis();
  const successfulFetch = (global.fetch as jest.Mock).getMockImplementation();
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: RequestInit) => {
      if (url.includes("/api/location/bus-stops/18301/arrivals")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...arrivalsResponse,
              services: [
                ...arrivalsResponse.services,
                {
                  serviceNo: "183",
                  buses: [
                    {
                      ...arrivalsResponse.services[0].buses[0],
                      busId: "AV-183-FOCUSED",
                      serviceNo: "183",
                      destination: "Buona Vista",
                    },
                  ],
                },
              ],
            }),
        });
      }
      return successfulFetch!(url, options);
    },
  );
  render(<App />);
  await openJourneyMap();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );

  await screen.findByText("Which bus do you need?");
  expect(screen.getByLabelText(/Choose Service 95/)).toBeTruthy();
  expect(screen.getByLabelText(/Choose Service 183/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Choose Service 183/));
  expect(screen.getByLabelText("Service 183")).toBeTruthy();
  expect(screen.getByLabelText("Request ramp for Service 183")).toBeTruthy();
});

it("uses the wheelchair, simplified, large-text, and high-contrast preferences in Focused Assist", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();
  fireEvent.press(screen.getByText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Apply Mobility support preset"));
  fireEvent.press(screen.getByLabelText("Apply Simpler journeys preset"));
  fireEvent.press(screen.getByLabelText("Apply Low-vision support preset"));
  fireEvent.press(screen.getByText("Save needs"));
  await openJourneyMap();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );

  await screen.findByText("BUS HERE");
  expect(screen.getByText("RAMP")).toBeTruthy();
  expect(screen.getByLabelText("Wheelchair-accessible vehicle.")).toBeTruthy();
  const rampActionStyle = StyleSheet.flatten(
    screen.getByLabelText("Request ramp for Service 95").props.style,
  );
  expect(rampActionStyle).toMatchObject({
    backgroundColor: "#000000",
    borderColor: "#FFFF00",
    minHeight: 196,
  });
});

it("shows a wheelchair symbol beside accessible bus numbers in the journey", async () => {
  await startOnboardJourney();

  expect(
    screen.getAllByLabelText("Wheelchair accessible bus").length,
  ).toBeGreaterThan(0);

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");

  expect(screen.getByText("95")).toBeTruthy();
  expect(
    screen.getAllByLabelText("Wheelchair accessible bus").length,
  ).toBeGreaterThan(0);
});

it("returns from Assist to the active Journey without resetting state", async () => {
  await selectBusFromManualStopFlow();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  expect(screen.getByText("We can't identify your bus stop yet.")).toBeTruthy();
  fireEvent.press(
    screen.getByLabelText(/Journey, tab, active journey, 1 of 3/),
  );
  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.getByText("Review journey")).toBeTruthy();
});

it("moves back from route preview to destination selection without a Home route", async () => {
  await selectBusFromManualStopFlow();
  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");

  fireEvent.press(screen.getByText("Back to destination"));

  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.getByText("Review journey")).toBeTruthy();
  expect(screen.queryByLabelText(/Home, tab/)).toBeNull();
});

it("lets passengers select a destination before boarding and preserves it onboard", async () => {
  await startOnboardJourney();

  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);

  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));

  await screen.findByText("ONBOARD JOURNEY");
  expect(
    screen.getByLabelText(/Onboard journey map.*Service 95/i),
  ).toBeTruthy();
  expect(screen.getByText("Journey map")).toBeTruthy();
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(screen.getByText("Remaining stops")).toBeTruthy();
  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("3 stops remaining")).toBeTruthy();
  expect(screen.getByText("Next stop")).toBeTruthy();
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);
  expect(screen.getByText("3 stops to Opp Science Drive")).toBeTruthy();
  expect(screen.getByText(/DESTINATION/)).toBeTruthy();
});

it("presents the waiting-for-bus journey, assistance, and boarding guidance in one hierarchy", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));

  await screen.findByTestId("waiting-for-bus-status");
  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("Arriving in about 2 min")).toBeTruthy();
  expect(screen.getByText("Boarding at:")).toBeTruthy();
  expect(screen.getByText("Kent Ridge Crescent, Stop 18301")).toBeTruthy();
  expect(screen.getByText("Destination:")).toBeTruthy();
  expect(screen.getByText("Opp Science Drive")).toBeTruthy();
  expect(screen.getByText("3 stops after boarding")).toBeTruthy();
  expect(screen.getByText("Boarding assistance")).toBeTruthy();
  expect(screen.getByLabelText("Ramp request: Not requested")).toBeTruthy();
  expect(screen.getByLabelText("Audio identification: On")).toBeTruthy();
  expect(screen.getByText("What to do")).toBeTruthy();
  expect(
    screen.getByLabelText("Step 1 of 3. Wait near the boarding point"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Step 2 of 3. Listen for bus identification"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      "Step 3 of 3. Board when the bus arrives and assistance is ready",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Request ramp")).toBeTruthy();
  expect(screen.getByLabelText("I'm onboard")).toBeTruthy();
  expect(
    screen.queryByText("Every spoken update is also displayed on this screen."),
  ).toBeNull();
});

it("adds a ramp to an active waiting assistance request and acknowledges it", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  await screen.findByLabelText("Ramp request: Not requested");

  fireEvent.press(screen.getByLabelText("Request ramp"));

  await screen.findByLabelText("Ramp request: Acknowledged");
  expect(
    screen.getByLabelText("Request ramp").props.accessibilityState,
  ).toMatchObject({ disabled: true });
  const requestCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  const rampRequest = JSON.parse(requestCalls.at(-1)?.[1]?.body ?? "{}");
  expect(rampRequest.assistanceTypes).toEqual(
    expect.arrayContaining(["BUS_AUDIO_IDENTIFICATION", "WHEELCHAIR_RAMP"]),
  );
});

it("previews onboard route stops before explicitly changing the destination", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));

  await screen.findByLabelText(/Onboard journey map.*Service 95/i);
  fireEvent.press(
    screen.getByLabelText(/Preview Science Drive, upcoming route stop/i),
  );

  expect(screen.getByText("Stop preview")).toBeTruthy();
  expect(screen.getAllByText("Science Drive").length).toBeGreaterThan(0);
  expect(screen.getByText("2 stops ahead")).toBeTruthy();
  expect(screen.getByText("3 stops to Opp Science Drive")).toBeTruthy();

  fireEvent.press(screen.getByText("Set as destination"));
  expect(screen.getByText("2 stops to Science Drive")).toBeTruthy();
  expect(screen.getAllByText(/DESTINATION/).length).toBeGreaterThan(0);
});

it("keeps onboard route progress usable while hiding map controls on provider failure", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));

  await screen.findByLabelText(/Onboard journey map.*Service 95/i);
  expect(screen.getByText("Unable to load map")).toBeTruthy();
  expect(
    screen.getByText("Journey details remain available without the map."),
  ).toBeTruthy();
  expect(screen.getByText("Remaining stops")).toBeTruthy();
  expect(
    screen.getByLabelText(
      /Preview Opp Heng Mui Keng Terrace, next route stop/i,
    ),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Zoom map in")).toBeNull();
  expect(screen.queryByLabelText("Zoom map out")).toBeNull();
  expect(screen.getByLabelText("More")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.getByText("Journey options")).toBeTruthy();
  expect(screen.getByLabelText("End journey")).toBeTruthy();
  expect(screen.queryByLabelText("Journey")).toBeNull();
  expect(screen.queryByLabelText("View stops")).toBeNull();
});

it("renders the onboard route through the real map provider abstraction", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "function OnboardJourneyMap",
    "<NearbyStopsMap",
    "routeStops={routeStops}",
    "destinationCoordinate={destinationStop}",
    "activeVehicle={{",
    'mapInteractionMode={followJourney ? "FOLLOW_JOURNEY" : "BROWSE"}',
    "remainingRouteStops",
    "routeProgressVisible =",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain('label="Move journey map manually"');
});

it("updates onboard progress and highlights when the destination is next", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));

  await screen.findByText("3 stops to Opp Science Drive");
  fireEvent.press(screen.getByText("Simulate next stop"));
  expect(screen.getByText("2 stops to Opp Science Drive")).toBeTruthy();

  fireEvent.press(screen.getByText("Simulate next stop"));
  expect(screen.getAllByText("YOUR STOP IS NEXT").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);
  expect(screen.getByText("Prepare to alight.")).toBeTruthy();
});

it("keeps remaining stops downstream-only and full route geographic", async () => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  const mapMock = require("../__mocks__/JourneyMap") as {
    getLastJourneyMapProps: () => {
      routeStops: Array<{ latitude: number; longitude: number }>;
      viewport: { mode: string };
    };
  };
  await startWheelchairOnboardJourney();

  expect(screen.getByLabelText("View remaining stops")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("View remaining stops"));

  const initialRemainingText = visibleTextOrder(
    screen.getByTestId("remaining-stops-list"),
  );
  expect(initialRemainingText).toContain("Opp Heng Mui Keng Terrace");
  expect(initialRemainingText).toContain("Science Drive");
  expect(initialRemainingText).toContain("Opp Science Drive");
  expect(initialRemainingText).not.toContain("Kent Ridge Crescent");
  expect(initialRemainingText).not.toContain("PASSED");

  fireEvent.press(screen.getByText("Simulate next stop"));
  const updatedRemainingText = visibleTextOrder(
    screen.getByTestId("remaining-stops-list"),
  );
  expect(updatedRemainingText).not.toContain("Opp Heng Mui Keng Terrace");
  expect(updatedRemainingText).toContain("Science Drive");
  expect(updatedRemainingText).toContain("Opp Science Drive");

  fireEvent.press(screen.getByTestId("remaining-stop-18331"));
  expect(screen.getByText("Stop preview")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.queryByLabelText("View route details")).toBeNull();
  fireEvent.press(screen.getByLabelText("View full route"));

  expect(screen.queryByTestId("remaining-stops-list")).toBeNull();
  expect(screen.queryByText("Stop preview")).toBeNull();
  expect(mapMock.getLastJourneyMapProps().viewport.mode).toBe("FULL_ROUTE");
  expect(mapMock.getLastJourneyMapProps().routeStops).toHaveLength(5);
});

it("hides remaining-stop controls at arrival and prioritizes safe alighting", async () => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  const view = await startWheelchairOnboardJourney();

  advanceToDestinationNext();
  expect(screen.getByLabelText("View remaining stops")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("View remaining stops"));
  expect(screen.getByTestId("remaining-stops-list")).toBeTruthy();

  fireEvent.press(screen.getByText("Simulate next stop"));

  expect(screen.getByText("YOU'VE REACHED YOUR STOP")).toBeTruthy();
  expect(screen.getByText("You have arrived.")).toBeTruthy();
  expect(screen.getByLabelText("I've safely alighted")).toBeTruthy();
  expect(screen.queryByLabelText("View remaining stops")).toBeNull();
  expect(screen.queryByLabelText("Hide remaining stops")).toBeNull();
  expect(screen.queryByTestId("remaining-stops-list")).toBeNull();
  expect(screen.queryByText(/0 (?:stops )?remaining/i)).toBeNull();

  const destinationText = visibleTextOrder(view.toJSON());
  expect(destinationText.indexOf("I've safely alighted")).toBeLessThan(
    destinationText.indexOf("Journey map"),
  );

  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.queryByLabelText("View route details")).toBeNull();
  expect(screen.getByLabelText("View full route")).toBeTruthy();
});

it("ends an active journey from More only after confirmation and preserves preferences", async () => {
  const view = await startWheelchairOnboardJourney();

  expect(screen.queryByLabelText("End journey")).toBeNull();
  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.getByText("Journey options")).toBeTruthy();
  expect(screen.queryByLabelText("View route details")).toBeNull();
  expect(screen.getByLabelText("Change destination")).toBeTruthy();
  expect(screen.getByLabelText("Accessibility options")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("End journey"));
  expect(screen.getByTestId("end-journey-confirmation")).toBeTruthy();
  expect(screen.getByText("End this journey?")).toBeTruthy();
  expect(screen.getAllByText("Service 95").length).toBeGreaterThan(0);
  expect(screen.getByText("Destination: Opp Science Drive")).toBeTruthy();
  expect(
    screen.getByText("Your route and live journey monitoring will stop."),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Keep journey"));
  expect(screen.queryByTestId("end-journey-confirmation")).toBeNull();
  expect(screen.getByText("ONBOARD JOURNEY")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("End journey"));
  const confirmEnd = screen.getAllByLabelText("End journey").at(-1);
  expect(confirmEnd).toBeTruthy();
  await act(async () => {
    fireEvent.press(confirmEnd!);
    fireEvent.press(confirmEnd!);
  });

  await screen.findByText("Find your bus");
  expect(screen.queryByText("ONBOARD JOURNEY")).toBeNull();
  expect(screen.queryByText("Opp Science Drive")).toBeNull();
  expect(
    screen.getByLabelText(/Passenger defaults: Wheelchair ramp/i),
  ).toBeTruthy();
  await waitFor(async () => {
    expect(
      await AsyncStorage.getItem("sg-goassist.active-journey.v1"),
    ).toBeNull();
  });
  const cancellationCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" &&
      url.includes("/api/assistance/") &&
      url.includes("/cancel"),
  );
  expect(cancellationCalls).toHaveLength(1);

  view.unmount();
  render(<App />);
  await screen.findByText("Find your bus");
  expect(screen.queryByText("ONBOARD JOURNEY")).toBeNull();
});

it("keeps destination-next assistance primary and finishes through safe wheelchair alighting", async () => {
  await startWheelchairOnboardJourney();
  advanceToDestinationNext();

  expect(screen.getByText("YOUR STOP IS NEXT")).toBeTruthy();
  expect(screen.getByLabelText("Request help to disembark")).toBeTruthy();
  expect(screen.queryByLabelText("End journey")).toBeNull();
  expect(screen.queryByLabelText("Finish journey")).toBeNull();

  fireEvent.press(screen.getByText("Simulate next stop"));
  expect(screen.getByText("YOU'VE REACHED YOUR STOP")).toBeTruthy();
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("I've safely alighted")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Request help to disembark"));
  await screen.findByText("Ramp request received");
  expect(screen.getByLabelText("I've safely alighted")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("I've safely alighted"));
  });

  await screen.findByText("Find your bus");
  expect(screen.queryByText("YOU'VE REACHED YOUR STOP")).toBeNull();
});

it("uses plain safe completion language for a simplified journey", async () => {
  await startWheelchairOnboardJourney({ simplified: true });

  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.getByText("Journey options")).toBeTruthy();
  expect(screen.queryByLabelText("View route details")).toBeNull();
  expect(screen.queryByLabelText("View remaining stops")).toBeNull();
  expect(screen.queryByLabelText("View full route")).toBeNull();
  expect(screen.getByLabelText("Change destination")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("More"));

  advanceToDestinationNext();
  fireEvent.press(screen.getByText("Simulate next stop"));

  expect(screen.getByText("YOU'VE REACHED YOUR STOP")).toBeTruthy();
  expect(screen.getByText("NEXT")).toBeTruthy();
  expect(screen.getByText("Leave the bus when it is safe.")).toBeTruthy();
  expect(screen.queryByLabelText("View remaining stops")).toBeNull();
  expect(screen.queryByLabelText("View full route")).toBeNull();
  fireEvent.press(screen.getByLabelText("Request help"));
  await screen.findByText("Assistance requested");
  expect(screen.getByLabelText("I've left the bus")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("I've left the bus"));
  });

  await screen.findByText("Find your bus");
});

it("offers Finish journey after a naturally completed journey without assistance", async () => {
  await selectBusFromManualStopFlow();
  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Start this journey"));
  await screen.findByTestId("waiting-for-bus-status");
  fireEvent.press(screen.getByText("I'm onboard"));
  await screen.findByText("ONBOARD JOURNEY");

  fireEvent.press(screen.getByText("Simulate next stop"));
  fireEvent.press(screen.getByText("Simulate next stop"));
  fireEvent.press(screen.getByText("Simulate next stop"));

  expect(screen.getByText("YOU'VE REACHED YOUR STOP")).toBeTruthy();
  expect(screen.getByLabelText("Finish journey")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Finish journey"));
  });
  await screen.findByText("Find your bus");
});

it("ignores a late route response after End journey and starts the next selection cleanly", async () => {
  mockSuccessfulJourneyApis();
  const standardFetch = (global.fetch as jest.Mock).getMockImplementation();
  let resolveRouteResponse: ((response: unknown) => void) | null = null;
  const pendingRouteResponse = new Promise((resolve) => {
    resolveRouteResponse = resolve;
  });
  (global.fetch as jest.Mock).mockImplementation(
    (url: string, options?: unknown) => {
      if (url.includes("/services/95/routes")) {
        return pendingRouteResponse;
      }
      return standardFetch!(url, options);
    },
  );

  render(<App />);
  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Start this journey"));
  await screen.findByTestId("waiting-for-bus-status");
  fireEvent.press(screen.getByText("I'm onboard"));
  await screen.findByText("ONBOARD JOURNEY");
  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("End journey"));
  const confirmEnd = screen.getAllByLabelText("End journey").at(-1);
  await act(async () => {
    fireEvent.press(confirmEnd!);
  });
  await screen.findByText("Find your bus");

  await act(async () => {
    resolveRouteResponse!({
      ok: true,
      json: () =>
        Promise.resolve({
          busStop: nearbyStopsResponse.stops[0],
          serviceNo: "95",
          routes: [],
        }),
    });
    await Promise.resolve();
  });

  expect(screen.getByText("Find your bus")).toBeTruthy();
  expect(screen.queryByText("ONBOARD JOURNEY")).toBeNull();
  fireEvent.press(screen.getByLabelText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  expect(screen.queryByText("Opp Science Drive")).toBeNull();
});

it("centralizes journey cleanup and invalidates journey-scoped async work", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "async function endJourney(completionKind: JourneyCompletionKind)",
    "journeyEndInProgressRef.current ||",
    "function invalidateJourneyAsyncWork()",
    "journeySessionIdRef.current += 1",
    "journeySessionId !== journeySessionIdRef.current",
    "arrivalsRequestRef.current.controller?.abort()",
    "routeDetailsRequestRef.current.controller?.abort()",
    "directionsRequestRef.current.controller?.abort()",
    "guidanceServiceRef.current!.stopActiveSpeech()",
    "guidanceServiceRef.current!.clearEvents()",
    "setWalkingRoute(null)",
    "setRouteStops([])",
    "setSelectedServiceOption(null)",
    "setSelectedAlightingStop(null)",
    'setJourneyPhase("DISCOVERY")',
    "queueActiveJourneyPersistence(clearSavedActiveJourney)",
  ].forEach((token) => expect(source).toContain(token));
});

it("collapses destination-next information and prioritizes the wheelchair alighting request", async () => {
  await startWheelchairOnboardJourney({ assistanceStatus: "SENDING" });

  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("Next stop")).toBeTruthy();
  expect(screen.getByText("3 stops to Opp Science Drive")).toBeTruthy();
  expect(screen.getByText("Available near your destination")).toBeTruthy();
  expect(screen.queryByLabelText("Request help to disembark")).toBeNull();

  advanceToDestinationNext();

  const destinationNextHero = screen.getByLabelText(
    "Your stop is next. Opp Science Drive. Prepare to alight.",
  );
  const heroText = visibleTextOrder(destinationNextHero);
  expect(heroText.filter((text) => text === "Opp Science Drive")).toHaveLength(
    1,
  );
  expect(heroText).not.toContain("Next stop");
  expect(heroText).not.toContain("Destination");
  expect(screen.getByText("Ramp assistance")).toBeTruthy();
  expect(screen.getByText("Not requested")).toBeTruthy();
  expect(screen.getByText("Extra alighting time")).toBeTruthy();
  expect(screen.getByText("Enabled")).toBeTruthy();
  expect(
    screen.queryByText(/More boarding time will be requested/i),
  ).toBeNull();
  expect(screen.queryByText(/Current progress:/i)).toBeNull();
  expect(
    screen.queryByLabelText(
      "Illustration of a passenger tracking the journey before disembarking",
    ),
  ).toBeNull();

  const requestButton = screen.getByLabelText("Request help to disembark");
  fireEvent.press(screen.getByLabelText("More"));
  const changeButton = screen.getByLabelText("Change destination");
  expect(
    StyleSheet.flatten(requestButton.props.style)?.backgroundColor,
  ).not.toBe(StyleSheet.flatten(changeButton.props.style)?.backgroundColor);

  fireEvent.press(requestButton);

  await screen.findByText("Assistance requested");
  expect(screen.getByText("Ramp request sent")).toBeTruthy();
  expect(screen.getByText("Extra alighting time requested")).toBeTruthy();
  expect(screen.queryByLabelText("Request help to disembark")).toBeNull();
  expect(screen.getByLabelText("Change destination")).toBeTruthy();
  expect(screen.getByLabelText("Repeat announcement")).toBeTruthy();
  const assistanceCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.includes("/api/assistance/request"),
  );
  expect(assistanceCalls).toHaveLength(2);
});

it("shows acknowledgement as request receipt without implying that the ramp is ready", async () => {
  await startWheelchairOnboardJourney();
  advanceToDestinationNext();

  fireEvent.press(screen.getByLabelText("Request help to disembark"));

  await screen.findByText("Ramp request received");
  expect(screen.getByText("Extra alighting time requested")).toBeTruthy();
  expect(screen.getByText("The bus has received your request.")).toBeTruthy();
  expect(
    screen.getByText(
      "Please remain onboard until the bus has stopped and the ramp is ready.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("Ramp is ready")).toBeNull();
  expect(screen.queryByLabelText("Request help to disembark")).toBeNull();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    "Your ramp request has been received. Extra alighting time request received.",
  );

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, assistance request active, 2 of 3/),
  );
  expect(screen.getByText("REQUEST RECEIVED")).toBeTruthy();
  expect(
    screen.getByText(
      "The bus received your request. Please wait until the bus stops and assistance is ready.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText("More boarding time")).toBeNull();
  expect(screen.queryByText("REQUEST HELP TO DISEMBARK")).toBeNull();
});

it("keeps the simplified, large-text, high-contrast destination alert singular and preference-driven", async () => {
  await startWheelchairOnboardJourney({ simplified: true, lowVision: true });

  fireEvent.press(screen.getByText("Simulate next stop"));
  const warningCallsBeforeDestination = (
    Haptics.notificationAsync as jest.Mock
  ).mock.calls.filter(([feedback]) => feedback === "warning").length;
  fireEvent.press(screen.getByText("Simulate next stop"));

  expect(screen.getByText("YOUR STOP IS NEXT")).toBeTruthy();
  expect(screen.getByText("Opp Science Drive")).toBeTruthy();
  expect(screen.getByText("NEXT")).toBeTruthy();
  expect(screen.getByText("Request help to get off the bus.")).toBeTruthy();
  expect(screen.getByLabelText("Request help")).toBeTruthy();
  expect(screen.queryByText("Service 95")).toBeNull();
  expect(screen.queryByText("Journey map")).toBeNull();
  expect(screen.getByLabelText("Show journey map")).toBeTruthy();

  const alertStyle = StyleSheet.flatten(
    screen.getByText("YOUR STOP IS NEXT").props.style,
  );
  const heroStyle = StyleSheet.flatten(
    screen.getByLabelText(
      "Your stop is next. Opp Science Drive. Prepare to alight.",
    ).props.style,
  );
  expect(alertStyle?.fontSize).toBeGreaterThanOrEqual(29);
  expect(heroStyle).toMatchObject({
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
  });

  const destinationAnnouncement =
    "Your destination, Opp Science Drive, is the next stop. Prepare to alight.";
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    destinationAnnouncement,
  );
  expect(screen.getByLabelText(destinationAnnouncement)).toBeTruthy();
  const warningCallsAfterDestination = (
    Haptics.notificationAsync as jest.Mock
  ).mock.calls.filter(([feedback]) => feedback === "warning").length;
  expect(warningCallsAfterDestination).toBe(warningCallsBeforeDestination + 1);

  fireEvent.press(screen.getByLabelText(/Profile, tab, 3 of 3/));
  fireEvent.press(
    screen.getByLabelText(/Journey, tab, active journey, 1 of 3/),
  );
  const matchingAnnouncements = (
    AccessibilityInfo.announceForAccessibility as jest.Mock
  ).mock.calls.filter(([message]) => message === destinationAnnouncement);
  expect(matchingAnnouncements).toHaveLength(1);
});

it("only exposes Repeat announcement after meaningful journey guidance exists", async () => {
  render(<App />);
  expect(screen.queryByLabelText("Repeat announcement")).toBeNull();

  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
  expect(source).toContain("{hasMeaningfulAnnouncement ? (");
});

it("switches Assist to disembarking context while onboard", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));
  await screen.findByText("ONBOARD JOURNEY");

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, assistance request active, 2 of 3/),
  );
  expect(screen.getByText("ON SERVICE 95")).toBeTruthy();
  expect(screen.getByText("Destination: Opp Science Drive")).toBeTruthy();
  expect(screen.getByText("REQUEST HELP TO DISEMBARK")).toBeTruthy();
  expect(screen.queryByText("Assistance for this bus")).toBeNull();
});

it("preserves journey state across focused Assist and Profile navigation", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  await openJourneyMap();
  await openNearbySheet();
  fireEvent.press(
    screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");
  expect(screen.getByLabelText("Request ramp for Service 95")).toBeTruthy();

  fireEvent.press(screen.getByLabelText(/Profile, tab, 3 of 3/));
  expect(screen.getByText("My profile")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Journey, tab, active journey, 1 of 3/),
  );
  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.getByText("Review journey")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 2 of 3/),
  );
  await screen.findByText("BUS AT YOUR STOP");
  expect(screen.getByLabelText("Service 95")).toBeTruthy();
  expect(screen.getByLabelText("Request ramp for Service 95")).toBeTruthy();
});

it("keeps appearance mode in profile and toggles between light and dark", () => {
  render(<App />);

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  expect(screen.getByText("Appearance")).toBeTruthy();
  expect(screen.queryByText("Continue journey")).toBeNull();
  expect(
    screen.getByLabelText("Passenger defaults: Bus identification assistance."),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Light mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });
  expect(
    screen.getByLabelText("Dark mode").props.accessibilityState,
  ).toMatchObject({
    selected: false,
  });
  expect(screen.queryByText("Light")).toBeNull();
  expect(screen.queryByText("Dark")).toBeNull();
  expect(screen.queryByText("Light mode")).toBeNull();
  expect(screen.queryByText("Dark mode")).toBeNull();

  fireEvent.press(screen.getByLabelText("Dark mode"));

  expect(
    screen.getByLabelText("Dark mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });
  expect(
    screen.getByLabelText("Light mode").props.accessibilityState,
  ).toMatchObject({
    selected: false,
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("keeps the appearance selector as a compact sun and moon icon toggle", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "appearanceTogglePanel",
    "appearanceIconToggle",
    "appearanceIconButton",
    "selectedAppearanceIconButton",
    "ProfileHeaderWithAppearance",
    "profileHeaderWithAppearance",
    "stackedProfileHeaderAppearance",
    "appearanceCompactLabel",
    "compactLayout={isCompactWidth}",
    "AppearanceToggleOption",
    "Icon={SunGlyph}",
    "Icon={MoonGlyph}",
    "appearanceIconContainer",
    "appearanceModeIconSize = 34",
  ].forEach((token) => expect(source).toContain(token));

  [
    "themeSwitchCard",
    "appearanceSwitchRow",
    "appearanceHeader",
    "appearanceModeStatus",
    "modeLabel",
    "selectedModeLabel",
    "modeSwitchTrack",
  ].forEach((token) => expect(source).not.toContain(token));
});

it("places the Profile appearance toggle in the compact header", async () => {
  const view = render(<App />);

  await signInDemoProfile();

  const profileText = visibleTextOrder(view.toJSON());
  expect(profileText.indexOf("Appearance")).toBeGreaterThan(
    profileText.indexOf("My profile"),
  );
  expect(profileText.indexOf("Appearance")).toBeLessThan(
    profileText.indexOf("Account"),
  );
  expect(screen.queryByText("Light mode")).toBeNull();
  expect(screen.queryByText("Dark mode")).toBeNull();
  expect(screen.getByLabelText("Light mode").props.accessibilityState).toEqual({
    selected: true,
  });
});

it("keeps the moon appearance icon as one canonical glyph without layered cutouts", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).toContain("Moon as MoonGlyph");
  expect(source.match(/Icon=\{MoonGlyph\}/g) ?? []).toHaveLength(1);
  expect(source).toContain("<Icon");
  expect(source).toContain("size={appearanceModeIconSize}");

  [
    "function MoonIcon",
    "moonInner",
    "selectedMoonInner",
    "moonCutout",
    "selectedMoonCutout",
    "moonIconFrame",
    "selectedMoonIcon",
  ].forEach((token) => expect(source).not.toContain(token));
});

it("keeps appearance selection clear across light, dark, and high contrast modes", async () => {
  render(<App />);

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));

  expect(
    screen.getByLabelText("Light mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });
  expect(
    screen.getByLabelText("Dark mode").props.accessibilityState,
  ).toMatchObject({
    selected: false,
  });

  fireEvent.press(screen.getByLabelText(/Sign in as Visual Guidance Profile/i));
  await screen.findByText("My profile");

  expect(
    screen.getByLabelText("Light mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });

  fireEvent.press(screen.getByLabelText("Dark mode"));
  expect(
    screen.getByLabelText("Dark mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });

  fireEvent.press(screen.getByLabelText("Edit accessibility preferences"));
  fireEvent.press(screen.getByLabelText("Vision accessibility settings"));
  expect(
    screen.getByLabelText("High contrast").props.accessibilityState,
  ).toMatchObject({
    checked: true,
  });

  fireEvent.press(screen.getByLabelText("High contrast"));
  expect(
    screen.getByLabelText("Dark mode").props.accessibilityState,
  ).toMatchObject({
    selected: true,
  });
  expect(
    screen.getByLabelText("High contrast").props.accessibilityState,
  ).toMatchObject({
    checked: false,
  });
});

it("keeps journey navigation out of the signed-in Profile footer", async () => {
  render(<App />);
  await signInDemoProfile();

  expect(screen.queryByText("Continue journey")).toBeNull();
  expect(screen.getByText("Sign out")).toBeTruthy();
});

it("shows accessibility verification before account until the profile is verified", () => {
  const view = render(<App />);

  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.changeText(screen.getByLabelText("Name"), "New Passenger");
  fireEvent.changeText(
    screen.getByLabelText("Email"),
    "new.passenger@example.com",
  );
  fireEvent.press(screen.getByText("Create profile"));

  const unverifiedText = visibleTextOrder(view.toJSON());
  expect(unverifiedText.indexOf("Accessibility Verification")).toBeLessThan(
    unverifiedText.indexOf("Account"),
  );
  expect(screen.getByText("Verify accessibility profile")).toBeTruthy();

  fireEvent.press(screen.getByText("Verify accessibility profile"));

  expect(screen.queryByText("Accessibility Verification")).toBeNull();
  expect(screen.queryByText("Verified accessibility user")).toBeNull();
  expect(screen.getByText("Account")).toBeTruthy();
});

it("defines paired semantic colour tokens with accessible representative contrast", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "visualThemes",
    "backgroundPrimary",
    "surfacePrimary",
    "surfaceRaised",
    "textPrimary",
    "textSecondary",
    "borderDefault",
    "borderStrong",
    "actionPrimary",
    "actionPrimaryText",
    "surfaceInteractive",
    "surfaceSelected",
    "textOnSelected",
    "borderInteractive",
    "borderSelected",
    "profileBadgeSurface",
    "profileBadgeBorder",
    "profileBadgeIcon",
    "profileBadgeText",
    "profileBadgeSelectedSurface",
    "profileBadgeSelectedBorder",
    "profileBadgeSelectedIcon",
    "locationCurrent",
    "busStopDefault",
    "busStopSelected",
    "navigationSelected",
    "stopDefault",
    "stopRecommended",
    "stopSelected",
    "destination",
    "statusSuccess",
    "statusAttention",
    "statusError",
    "statusInformation",
    "routePrimary",
    "routeAccessible",
    "focusIndicator",
    "land",
    "building",
    "labelSecondary",
    "overlaySurface",
    "overlaySurfaceElevated",
    "overlayBorder",
    "controlSurface",
    "controlBorder",
    "controlIcon",
    "sheetSurface",
    "sheetBorder",
    "navigationSurface",
    "navigationDivider",
    "currentLocationHalo",
    "currentLocationOutline",
    "stopSurface",
    "stopOutline",
    "selectionAccent",
    "routeOutline",
    "handle",
    "highContrastLight",
    "highContrastDark",
    "location",
    "accessible",
    "warning",
    "assistance",
    "danger",
    "textOnPrimary",
    "textOnAccessible",
    "textOnWarning",
    "textOnAssistance",
    "textOnDestination",
    "textOnDanger",
  ].forEach((token) => {
    expect(source).toContain(token);
  });

  expect(contrastRatio("#FFFFFF", "#0B6670")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#0B6670", "#F2F8F9")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#203438", "#F2F8F9")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#203438", "#F7FAFA")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#102A30", "#F5B942")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#6B5CA5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#256E9E")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#051B22", "#72C7F5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#F7FAFA", "#0F2024")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#102A30", "#86C5DA")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#17202B", "#B9A9E8")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#074B6A")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#050505")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#001B22", "#7FE8FF")).toBeGreaterThanOrEqual(4.5);
});

it("keeps Journey colours semantic instead of using dark cards as default surfaces", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const journeyFieldSurface = lightMode",
    "? theme.colors.surfaceInteractive",
    ": theme.colors.surfaceRaised",
    "const journeyFieldBorder = highContrast",
    "? theme.colors.borderStrong",
    ": theme.colors.borderInteractive",
    "color={theme.colors.locationCurrent}",
    "color={theme.colors.destination}",
    "backgroundColor: theme.colors.destination",
    "visualTheme.colors.busStopDefault",
    "visualTheme.colors.busStopSelected",
    "theme.colors.navigationSelected",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain('destination: "#6B5CA5"');
  expect(source).not.toContain('destination: "#B9A9E8"');
});

it("uses shared visual language tokens instead of legacy one-off control colours", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const spacing",
    "const radius",
    "const borders",
    "const typography",
    "const touchTarget",
  ].forEach((tokenGroup) => {
    expect(source).toContain(tokenGroup);
  });

  ["#102529", "#69C8D8", "#7DD7E5", "#EDF4F5", "#A8E4EC"].forEach(
    (legacyColor) => {
      expect(source).not.toContain(legacyColor);
    },
  );
});
