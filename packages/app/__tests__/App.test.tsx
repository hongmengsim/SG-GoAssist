import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Location from "expo-location";
import fs from "fs";
import path from "path";
import { StyleSheet } from "react-native";
import App from "../App";
import type {
  BusStopArrivalsResponse,
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
      distanceMeters: 45,
    },
    {
      busStopCode: "18321",
      roadName: "Kent Ridge Cres",
      description: "Opp Heng Mui Keng Terrace",
      latitude: 1.29295,
      longitude: 103.77508,
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

const exploredAreaResponse: NearbyBusStopsResponse = {
  stops: [
    {
      busStopCode: "19011",
      roadName: "Lower Kent Ridge Rd",
      description: "Kent Ridge MRT Station",
      latitude: 1.29318,
      longitude: 103.78408,
      distanceMeters: 120,
    },
    {
      busStopCode: "19019",
      roadName: "South Buona Vista Rd",
      description: "Opp Kent Ridge Station",
      latitude: 1.29278,
      longitude: 103.78486,
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
      distanceMeters: 60,
    },
    {
      busStopCode: "18311",
      roadName: "Prince George's Park",
      description: "Prince George's Park",
      latitude: 1.29485,
      longitude: 103.77158,
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

function expectUserMarkerInsideComfortZone(testID: string) {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style);
  const left = Number.parseFloat(String(style?.left));
  const top = Number.parseFloat(String(style?.top));

  expect(left).toBeGreaterThan(18);
  expect(left).toBeLessThan(82);
  expect(top).toBeGreaterThan(16);
  expect(top).toBeLessThan(84);
}

function mockSuccessfulJourneyApis() {
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
        json: () => Promise.resolve(arrivalsResponse),
      });
    }

    if (url.includes("/api/assistance/request")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            requestId: "REQ-ONBOARD-1",
            status: "ACKNOWLEDGED",
            createdAt: "2026-08-15T13:00:00.000Z",
          }),
      });
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
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
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
  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
  fireEvent.press(screen.getByLabelText(/Sign in as Visual Guidance Profile/i));
  await screen.findByText("My profile");
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
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
}

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
});

it("renders the journey entry actions with repeat guidance unavailable until a journey exists", () => {
  render(<App />);

  expect(screen.getByText("SG GoAssist")).toBeTruthy();
  expect(screen.getByText("Find your bus")).toBeTruthy();
  expect(screen.getByText("Use my location")).toBeTruthy();
  expect(screen.getByText("Select bus stop manually")).toBeTruthy();
  expect(
    screen.getByLabelText("Repeat guidance").props.accessibilityState,
  ).toMatchObject({
    disabled: true,
  });
});

it("keeps Journey and Assist available before a bus is selected", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  expect(
    screen.getByLabelText(/Journey, tab, map ready, 2 of 4/).props
      .accessibilityState,
  ).toMatchObject({
    disabled: false,
  });
  expect(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/).props
      .accessibilityState,
  ).toMatchObject({
    disabled: false,
  });

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  expect(
    screen.getByLabelText(/Journey, tab, selected, map ready, 2 of 4/),
  ).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  expect(screen.getByText("Get assistance during your journey")).toBeTruthy();
  expect(screen.getByText("No bus selected yet")).toBeTruthy();
  expect(screen.getByText("Edit saved preferences")).toBeTruthy();
});

it("plans a searched origin-to-destination route and starts with the walking leg", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Where are you going?"));
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
  expect(screen.getByLabelText(/Journey preview. Take Bus/i)).toBeTruthy();

  fireEvent.press(screen.getByText("Start this journey"));

  expect(screen.getByText("Walking to your stop")).toBeTruthy();
  expect(screen.getByText(/Walk to .* Stop/i)).toBeTruthy();
  expect(
    screen.getByLabelText(/Journey, tab, active journey, 2 of 4/),
  ).toBeTruthy();
});

it("lets passengers choose a destination from the map before selecting a route", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Where are you going?"));
  fireEvent.press(screen.getByText("Choose destination on map"));

  expect(screen.getByText("Set as destination")).toBeTruthy();
  fireEvent.press(screen.getByText("Set as destination"));

  await screen.findByText("RECOMMENDED FOR YOU");
  expect(screen.getByText("YOUR JOURNEY")).toBeTruthy();
  expect(screen.getByText("Start this journey")).toBeTruthy();
});

it("opens the nearby stop list even when journey route options are available", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Where are you going?"));
  fireEvent.changeText(
    screen.getByLabelText("Search bus stop, service or place"),
    "NUH",
  );
  await screen.findByText("NUH");
  fireEvent.press(
    screen.getByLabelText(/NUH, Bus Stop 18121, Lower Kent Ridge Rd/i),
  );
  await screen.findByText("RECOMMENDED FOR YOU");

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));

  await waitFor(() => {
    expect(screen.queryByText("RECOMMENDED FOR YOU")).toBeNull();
    expect(screen.getAllByText(/bus stops/i).length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/Recommended stop. Kent Ridge Crescent/i),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Show nearby bus stops in this area").props
        .accessibilityState,
    ).toMatchObject({
      selected: true,
    });
  });
});

it("lets a passenger manually choose a stop, confirm it, and see arriving buses", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  expect(screen.queryByLabelText("SG GoAssist")).toBeNull();
  expect(screen.getByText("2 nearby")).toBeTruthy();
  expect(
    screen.getByLabelText("Search bus stop, service or place"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Show nearby bus stops in this area"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Nearby bus stop map. 2 stops shown."),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.getByText("MAP LAYERS")).toBeTruthy();
  expect(screen.getByLabelText("Stops, map layer, on")).toBeTruthy();
  expect(screen.getByLabelText("Route, map layer, disabled")).toBeTruthy();
  expect(screen.getByLabelText("North up")).toBeTruthy();
  expect(screen.queryByLabelText("Your current location.")).toBeNull();
  expect(
    screen.getByLabelText("Centre map on my current location"),
  ).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  expect(screen.getByText("45 m")).toBeTruthy();
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
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );

  expect(screen.getByText("Kent Ridge Crescent")).toBeTruthy();
  expect(screen.getByText(/Bus Stop 18301 · About 45 m away/i)).toBeTruthy();
  expect(screen.getByText("Services")).toBeTruthy();
  fireEvent.press(
    screen.getByLabelText("Preview Service 95 at Kent Ridge Crescent"),
  );
  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("Live arrival unavailable")).toBeTruthy();
  expect(screen.getByText("Choose stop and Service 95")).toBeTruthy();
  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(screen.queryByText("Search this area")).toBeNull();
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();

  fireEvent.press(screen.getByText("Choose stop and Service 95"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("95")).toBeTruthy();
});

it("uses map Back to undo map task state before leaving the map", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  expect(screen.getByLabelText("Back to previous view")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
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

it("keeps Locate focused on map positioning without opening Nearby results", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));
  expect(screen.getByText("Nearby stops")).toBeTruthy();

  (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear();
  (global.fetch as jest.Mock).mockClear();
  fireEvent.press(screen.getByLabelText("Centre map on my current location"));

  await waitFor(() =>
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled(),
  );
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByText("Nearby stops")).toBeTruthy();
});

it("uses Nearby to load and open nearby bus stops without sharing Locate behaviour", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));
  expect(screen.getByText("Nearby stops")).toBeTruthy();

  (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear();
  (global.fetch as jest.Mock).mockClear();
  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));

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

it("opens the Nearby sheet from the Journey planner and shows stop entries immediately", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Where are you going?");
  expect(screen.queryByText("Search this area")).toBeNull();
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));

  await waitFor(() => {
    expect(screen.queryByLabelText("Where are you going?")).toBeNull();
    expect(
      screen.getByLabelText(
        /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Show nearby bus stops in this area").props
        .accessibilityState,
    ).toMatchObject({
      selected: true,
    });
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

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Show nearby bus stops in this area");

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));

  expect(await screen.findByText("Finding stops near you...")).toBeTruthy();
  expect(
    screen.getByLabelText("Show nearby bus stops in this area").props
      .accessibilityState,
  ).toMatchObject({
    selected: true,
  });
});

it("toggles Nearby between useful list height and peek without losing list content", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));
  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));
  expect(screen.getByText("Nearby stops")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));
  expect(
    screen.getByLabelText(
      /Recommended stop. Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301/i,
    ),
  ).toBeTruthy();
});

it("shows Search this area after panning and loads stops for the moved viewport", async () => {
  mockExplorableMapApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");

  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );
  expect(screen.getByText("Search this area")).toBeTruthy();

  (global.fetch as jest.Mock).mockClear();
  fireEvent.press(
    screen.getByLabelText("Find bus stops in the currently visible map area"),
  );

  await waitFor(() =>
    expect(
      screen.getAllByText("Bus stops in this area").length,
    ).toBeGreaterThan(0),
  );
  const [, searchOptions] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(searchOptions.body)).toMatchObject({
    latitude: 1.298,
    longitude: expect.closeTo(103.7819, 5),
    accuracyMeters: 0,
  });
  expect(
    screen.queryByLabelText("Find bus stops in the currently visible map area"),
  ).toBeNull();
  expect(
    screen.getByLabelText(
      /Kent Ridge MRT Station, bus stop 19011, 120 metres away/i,
    ),
  ).toBeTruthy();
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

it("shows a compass after rotation and restores north-up without clearing the map", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("Rotate map, off"));

  expect(screen.getByLabelText("Reset map to north")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Reset map to north"));
  expect(screen.queryByLabelText("Reset map to north")).toBeNull();
  expect(screen.getByLabelText("Nearby bus stops")).toBeTruthy();
});

it("makes each visible More menu option contextual and functional", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("More"));

  expect(screen.getByText("Map options")).toBeTruthy();
  expect(screen.getByText("MAP LAYERS")).toBeTruthy();
  expect(screen.getByText("JOURNEY")).toBeTruthy();
  expect(screen.getByText("MAP VIEW")).toBeTruthy();
  expect(
    screen.getAllByText("Choose a bus service first").length,
  ).toBeGreaterThan(0);
  expect(screen.getByText("Select a stop or bus route first")).toBeTruthy();
  expect(
    screen.getByLabelText("Bus vehicles, map layer, disabled").props
      .accessibilityState,
  ).toMatchObject({
    disabled: true,
  });

  fireEvent.press(screen.getByLabelText("Places, map layer, on"));
  expect(
    screen.queryByLabelText("University Hall. building landmark."),
  ).toBeNull();

  fireEvent.press(
    screen.getByLabelText("Accessibility information, map layer, off"),
  );
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();
  fireEvent.press(screen.getByLabelText("Close map options"));
  expect(
    screen.queryByText("Accessibility information unavailable here"),
  ).toBeNull();

  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("Stops, map layer, on"));
  expect(
    screen.queryByLabelText(/Opp Heng Mui Keng Terrace, bus stop 18321/i),
  ).toBeNull();
  fireEvent.press(screen.getByLabelText("Stops, map layer, off"));

  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(
    screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301/i),
  );
  expect(
    screen.getByLabelText(/Selected bus stop. Kent Ridge Crescent/i),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("Route, map layer, on"));
  expect(screen.queryByText("45 m")).toBeNull();

  fireEvent.press(screen.getByLabelText("Rotate map, off"));
  expect(
    screen.getByLabelText("Rotate map, on").props.accessibilityState,
  ).toMatchObject({
    checked: true,
  });
  expect(screen.getByLabelText("Reset map to north")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("North up"));
  expect(screen.queryByText("Map options")).toBeNull();
  expect(screen.queryByLabelText("Reset map to north")).toBeNull();

  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("Reset map view"));
  expect(screen.queryByText("Map options")).toBeNull();
  expect(
    screen.getByLabelText(/Selected bus stop. Kent Ridge Crescent/i),
  ).toBeTruthy();
});

it("uses Nearby around the explored viewport without requesting GPS", async () => {
  mockExplorableMapApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));
  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );

  (Location.requestForegroundPermissionsAsync as jest.Mock).mockClear();
  (global.fetch as jest.Mock).mockClear();
  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));

  await waitFor(() =>
    expect(
      screen.getAllByText("Bus stops in this area").length,
    ).toBeGreaterThan(0),
  );
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  const [, nearbyOptions] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(nearbyOptions.body)).toMatchObject({
    latitude: 1.298,
    longitude: expect.closeTo(103.7819, 5),
    accuracyMeters: 0,
  });
  expect(
    screen.getByLabelText(
      "1 nearby bus stop. Opp Kent Ridge Station. Activate to select.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      /Opp Kent Ridge Station, South Buona Vista Rd, bus stop 19019/i,
    ),
  ).toBeTruthy();
});

it("returns to the passenger viewport with Locate after exploring elsewhere", async () => {
  mockExplorableMapApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );

  fireEvent.press(screen.getByLabelText("Centre map on my current location"));

  await waitFor(() =>
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled(),
  );
  expect(
    screen.queryByLabelText("Find bus stops in the currently visible map area"),
  ).toBeNull();
});

it("lets manual panning win over a stale Locate result", async () => {
  mockExplorableMapApis();
  (
    Location.requestForegroundPermissionsAsync as jest.Mock
  ).mockResolvedValueOnce({ status: "granted" });
  let resolvePosition: (position: unknown) => void = () => undefined;
  (Location.getCurrentPositionAsync as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePosition = resolve;
      }),
  );
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");

  fireEvent.press(screen.getByLabelText("Centre map on my current location"));
  await waitFor(() =>
    expect(Location.getCurrentPositionAsync).toHaveBeenCalled(),
  );
  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );

  resolvePosition({
    coords: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracy: 8,
    },
  });

  await waitFor(() =>
    expect(
      screen.getByLabelText("Find bus stops in the currently visible map area"),
    ).toBeTruthy(),
  );
  expect(
    screen.getByLabelText("Nearby bus stop map. 2 stops shown."),
  ).toBeTruthy();
});

it("keeps the You marker geographic coordinate stable through unrelated map UI clicks", async () => {
  const userLocationId = "current-user-location-1.30001-103.80002";
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.30001,
      longitude: 103.80002,
      accuracy: 12,
    },
  });
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByTestId(userLocationId);
  expect(screen.getByTestId(`${userLocationId}-accuracy`)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(screen.getByLabelText("Minimize stop panel"));
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));
  await screen.findByLabelText("Nearby bus stops");
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);
  fireEvent.press(screen.getByLabelText("Places, map layer, on"));
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);
  fireEvent.press(screen.getByLabelText("Close map options"));
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(
    screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301/i),
  );
  expect(screen.getByTestId(userLocationId)).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Back to nearby bus stops"));
  fireEvent.press(screen.getByLabelText("Search bus stop, service or place"));
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
});

it("keeps user location separate from manual pan and current-area Nearby searches", async () => {
  const userLocationId = "current-user-location-1.30001-103.80002";
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.30001,
      longitude: 103.80002,
      accuracy: 12,
    },
  });
  mockExplorableMapApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));
  await screen.findByTestId(userLocationId);

  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );
  expect(screen.getByTestId(userLocationId)).toBeTruthy();

  (global.fetch as jest.Mock).mockClear();
  fireEvent.press(
    screen.getByLabelText("Find bus stops in the currently visible map area"),
  );
  await waitFor(() =>
    expect(
      screen.getAllByText("Bus stops in this area").length,
    ).toBeGreaterThan(0),
  );

  const [, searchOptions] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(searchOptions.body)).toMatchObject({
    latitude: expect.closeTo(1.303749, 5),
    longitude: expect.closeTo(103.811127, 5),
    accuracyMeters: 0,
  });
  expect(screen.getByTestId(userLocationId)).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Centre map on my current location"));
  await waitFor(() =>
    expect(
      screen.queryByLabelText(
        "Find bus stops in the currently visible map area",
      ),
    ).toBeNull(),
  );
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);
});

it("keeps the You marker visible through dark mode, Nearby, and Search this area", async () => {
  const userLocationId = "current-user-location-1.30001-103.80002";
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: {
      latitude: 1.30001,
      longitude: 103.80002,
      accuracy: 12,
    },
  });
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));
  await screen.findByTestId(userLocationId);

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
  fireEvent.press(screen.getByLabelText("Dark mode"));
  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));

  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expect(screen.getByText("You")).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(screen.getByLabelText("Show nearby bus stops in this area"));
  await screen.findByLabelText("Nearby bus stops");
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expectUserMarkerInsideComfortZone(userLocationId);

  fireEvent.press(screen.getByLabelText("Move map manually"));
  await screen.findByLabelText(
    "Find bus stops in the currently visible map area",
  );
  expect(screen.getByTestId(userLocationId)).toBeTruthy();
  expect(screen.getByText("Search this area")).toBeTruthy();
});

it("keeps map camera, user location, and query origin separated", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

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
    "type GoAssistMapController",
    "type MapInteractionState",
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
    'mapCameraMode !== "FOLLOW_USER"',
    "updateCamera?: boolean",
    "keepViewport: true",
    "requestOrigin: payload",
    "setTransportDiscovery((current) => ({",
    "lastSuccessfulLocation: position.coords",
    "cameraIntentId !== cameraIntentIdRef.current",
    "createMapProjection(mapViewport.center, mapViewport.zoom)",
    "mapSpanMetersForZoom",
    "current-user-location",
    "function UserLocationMarker",
    "<UserLocationMarker",
    "coordinate={currentLocation}",
    "project={mapProjection.project}",
    "const userMarkerCoordinateId = currentLocation",
    "currentLocationLabelSurface",
    "currentLocationLabelText",
    "controlText",
    "enableLocationDebugLogs",
    "USER LOCATION CHANGED",
    "const viewportCenterProjected",
  ].forEach((token) => {
    expect(source).toContain(token);
  });

  expect(source).not.toContain(
    "bottomNavigationHeight + mapBottomSheetHeights[bottomSheetState]",
  );
  expect(source).not.toContain("function mapPaddingForCamera");
  expect(source).not.toContain('runCameraCommand("focusStop"');
  expect(source).not.toContain("center: stop,\n        zoom: 17");
  expect(source.indexOf("<UserLocationMarker")).toBeGreaterThan(
    source.indexOf("clusteredStopDisplay.markers.map"),
  );
  expect(source).not.toContain("lastSuccessfulLocation: queryCenter");
});

it("tucks the stop sheet into a hidden peek and restores the previous useful height", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );

  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Minimize stop panel"));

  expect(screen.getByText("Nearby stops")).toBeTruthy();
  expect(screen.queryByText(/Bus Stop 18301 · About 45 m away/i)).toBeNull();
  fireEvent.press(screen.getByLabelText("Expand stop panel to medium height"));

  expect(
    screen.getByLabelText("Selected stop Kent Ridge Crescent"),
  ).toBeTruthy();
  expect(screen.getByText(/Bus Stop 18301 · About 45 m away/i)).toBeTruthy();
});

it("shows accessible walking directions, follow mode, and route fitting for a selected stop", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);

  expect(screen.getByText(/Head towards Kent Ridge Cres/i)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Back to bus stop details"));
  expect(screen.queryByText(/Head towards Kent Ridge Cres/i)).toBeNull();
  fireEvent.press(screen.getAllByLabelText("Directions")[0]);
  expect(screen.getByLabelText("Directions")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("View current journey"));
  expect(screen.getByText("Map options")).toBeTruthy();
  expect(
    screen.getByText("Select a destination to view your journey"),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Close map options"));
  fireEvent.press(screen.getByLabelText("More"));
  fireEvent.press(screen.getByLabelText("Move map manually"));
  expect(screen.getByLabelText("View current journey")).toBeTruthy();
  expect(
    screen.getByLabelText("Nearby bus stop map. 2 stops shown."),
  ).toBeTruthy();
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

  await screen.findByText("Bus stops near University Hall");
  expect(
    screen.getByLabelText("University Hall. building landmark."),
  ).toBeTruthy();
  expect(screen.queryByLabelText(/Selected stop/i)).toBeNull();
  expect(
    screen.getAllByLabelText(/Kent Ridge Crescent, bus stop 18301/i).length,
  ).toBeGreaterThan(0);
});

it("clusters very close bus stop markers and expands them on activation", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(clusteredStopsResponse),
      });
    }

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByLabelText("Nearby bus stops");
  expect(
    screen.getByLabelText("2 bus stops in this area. Double tap to zoom in."),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText(/Opp Kent Ridge Crescent, bus stop 18309/i),
  ).toBeNull();

  fireEvent.press(
    screen.getByLabelText("2 bus stops in this area. Double tap to zoom in."),
  );

  expect(
    screen.getByLabelText(/Opp Kent Ridge Crescent, bus stop 18309/i),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(/Prince George's Park, bus stop 18311/i),
  ).toBeTruthy();
});

it("uses zoom-derived stop clustering while preserving priority map markers", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "const clusteredStopDisplay = useMemo",
    "const markerPriority",
    "type MarkerPriorityKey",
    "forceClusterOrdinaryStops",
    "clusterRadius",
    "ordinaryIndividualLimit",
    "const nearestStopCode",
    "boardingStopCode",
    "destinationStopCode",
    "routeStopCodes",
    "priorityMarkers",
    "ordinaryStops",
    "protectedRects",
    "clusterConflictsWithPriority",
    "ordinaryConflictsWithPriority",
    "rectAroundProjection",
    "rectsOverlap",
    "clusterVisualSize",
    "zIndexForMarkerPriority",
    "${cluster.count} bus stops in this area. Double tap to zoom in.",
    "onFocusCluster(cluster.center)",
    "focusStopCluster",
    "Zooming into clustered nearby bus stops.",
    "Nearest, selected",
    "stopClusterHitTarget",
    "compactStopClusterCount",
    "highContrastClusterMarker",
    "highContrastClusterCount",
    "Priority: clarity over completeness.",
  ].forEach((token) => expect(source).toContain(token));

  [
    "const [expandedCluster",
    "setExpandedCluster",
    "clusteredMapStopMarker",
    "separatedNearestMapStopMarker",
  ].forEach((token) => expect(source).not.toContain(token));
});

it("uses an environment-configured Google Maps provider with native clustering", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
    "function shouldUseGoogleMapsProvider",
    "function GoogleMapsProviderJourneyMap",
    "loadGoogleMapsSdk",
    "@googlemaps/js-api-loader",
    "@googlemaps/markerclusterer",
    "new google.maps.Map",
    'gestureHandling: "greedy"',
    "new MarkerClusterer",
    "onClusterClick",
    "programmaticCameraRef",
    "userGestureRef",
    "mapInteractionRef",
    "ordinaryStopMarkersRef",
    "priorityStopMarkersRef",
    'zIndexForMarkerPriority("CLUSTER")',
    'zIndexForMarkerPriority("USER_LOCATION")',
    "userMarkerRef",
    "userAccuracyRef",
    "routePolylineRef",
    "mapControllerRef",
    "mapProviderDisplayName",
    "ACCESSIBLE_FALLBACK",
    "Google Maps provider failed to load",
  ].forEach((token) => expect(source).toContain(token));

  expect(source).not.toContain("AIza");
  expect(source.indexOf("priorityStopMarkersRef")).toBeLessThan(
    source.indexOf("ordinaryStopMarkersRef.current.push"),
  );
  expect(source.indexOf("userMarkerRef")).toBeLessThan(
    source.indexOf('zIndex: zIndexForMarkerPriority("USER_LOCATION")'),
  );
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
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getByText("Choose this stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("BOARDING AT")).toBeTruthy();
  expect(screen.getByText("Which bus are you taking?")).toBeTruthy();
  expect(screen.getByText("Arrival info unavailable")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("reuses cached nearby stops when manual selection is opened again", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(screen.getByLabelText(/Home, tab, 1 of 4/));
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
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
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

  await screen.findByText("Location is off");
  expect(
    screen.getByText("You can still choose a bus stop manually."),
  ).toBeTruthy();
  expect(global.fetch).not.toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.anything(),
  );

  fireEvent.press(screen.getByLabelText("Choose stop manually"));
  await screen.findByLabelText("Nearby bus stops");
  expect(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  ).toBeTruthy();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        latitude: 1.2942,
        longitude: 103.7711,
        accuracyMeters: 0,
      }),
    }),
  );
});

it("keeps a found location visible when nearby stops fail across Home and Journey", async () => {
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

  await screen.findByText("Couldn't load nearby stops");
  expect(screen.getByLabelText("Your current location.")).toBeTruthy();
  expect(
    screen.getByText(
      "Your location is still available. Check your connection and try again.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Search for a stop")).toBeTruthy();
  expect(screen.queryByText("Couldn't find your location")).toBeNull();

  fireEvent.press(screen.getByLabelText(/Home, tab, 1 of 4/));
  expect(screen.getByText("Location found")).toBeTruthy();
  expect(screen.getByText("Nearby stops couldn't be loaded.")).toBeTruthy();
  expect(screen.queryByText("We couldn't determine your location.")).toBeNull();

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  expect(screen.getByText("Couldn't load nearby stops")).toBeTruthy();
  expect(screen.getByLabelText("Your current location.")).toBeTruthy();
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

  expect(screen.getByLabelText("Your current location.")).toBeTruthy();
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
  expect(source).toContain("const bottomNavigationHeight = 66");
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
    "searchThisAreaVisible && !showMoreControls && !searchActive",
    "ContextualMapControlIcon",
    "Invalid contextual map control",
    'state={showMoreControls ? "HIDDEN_PEEK" : bottomSheetState}',
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
    "home: Home",
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
});

it("keeps visible zoom controls removed and strengthens selected bottom tabs", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).not.toContain("function MapZoomControls");
  expect(source).not.toContain("Zoom map in");
  expect(source).not.toContain("Zoom map out");
  expect(source).not.toContain("mapZoomBottomOffset");
  expect(source).not.toContain("mapOverlayGap");
  expect(source).toContain("selectedTabIconBadge");
  expect(source).toContain("height: 36");
  expect(source).toContain("width: 44");
  expect(source).toContain('textTransform: "uppercase"');
});

it("keeps simulator-only journey controls behind a development gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  expect(source).toContain("__DEV__ ? (");
  expect(source).toContain("Simulate next stop");
  expect(source).toContain("I'm onboard");
  expect(source).not.toContain('label="Passenger is onboard"');
});

it("selects a service before assistance and keeps bus-side assistance profile gated", async () => {
  await selectBusFromManualStopFlow();

  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.queryByText("Set app accessibility")).toBeNull();
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  await screen.findByText("Profile required");
  expect(screen.getByText("Profile required")).toBeTruthy();
  expect(screen.getByText("Go to profile")).toBeTruthy();
  expect(screen.queryByText("Request assistance")).toBeNull();
});

it("keeps display accessibility controls out of Assist for guest journeys", async () => {
  await selectBusFromManualStopFlow();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  await waitFor(() =>
    expect(screen.getByText("Profile required")).toBeTruthy(),
  );
  expect(screen.queryByText("Phone Accessibility")).toBeNull();
  expect(screen.queryByText("Appearance")).toBeNull();
  expect(screen.queryByText("Screen-reader optimised")).toBeNull();
  expect(screen.queryByText("Haptic alerts")).toBeNull();
  expect(screen.queryByText("Large text")).toBeNull();
  expect(screen.queryByText("High contrast")).toBeNull();
});

it("loads Profile assistance defaults into Assist and keeps journey changes local", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));

  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  await screen.findByText("Assistance for this bus");
  expect(
    screen.getByLabelText("Bus Identification Assistance, selected").props
      .accessibilityState,
  ).toMatchObject({
    checked: true,
    selected: true,
  });

  fireEvent.press(
    screen.getByLabelText("Bus Identification Assistance, selected"),
  );
  expect(
    screen.getByLabelText("Bus Identification Assistance, not selected").props
      .accessibilityState,
  ).toMatchObject({
    checked: false,
    selected: false,
  });

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
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
  fireEvent.press(screen.getByLabelText("Haptic alerts"));
  fireEvent.press(screen.getByText("Save needs"));

  expect(screen.getByText("Preferences saved")).toBeTruthy();
  expect(screen.queryByText("PROFILE PREFERENCES SAVED.")).toBeNull();
  expect(screen.queryByText("Haptic alert sent.")).toBeNull();

  fireEvent.press(screen.getByLabelText("Preferences saved"));
  expect(screen.queryByText("Preferences saved")).toBeNull();
});

it("keeps preference save feedback as one overlay toast that auto-dismisses", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "function StatusToast",
    'setVisualAlert("Preferences saved")',
    'AccessibilityInfo.announceForAccessibility("Preferences saved.")',
    "requirements.extendedDwellTime ? 6000 : 3200",
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

it("restores usual assistance for the current journey without sending a request", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));

  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  await screen.findByText("Assistance for this bus");
  fireEvent.press(
    screen.getByLabelText("Bus Identification Assistance, selected"),
  );
  expect(
    screen.getByLabelText("Bus Identification Assistance, not selected").props
      .accessibilityState,
  ).toMatchObject({
    checked: false,
    selected: false,
  });

  fireEvent.press(screen.getByText("Use my usual assistance"));
  expect(
    screen.getByLabelText("Bus Identification Assistance, selected").props
      .accessibilityState,
  ).toMatchObject({
    checked: true,
    selected: true,
  });
  expect(global.fetch).toHaveBeenCalledTimes(2);
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

it("shows active journey continuity on Home without resetting journey state", async () => {
  await selectBusFromManualStopFlow();

  fireEvent.press(screen.getByLabelText("Home, tab, 1 of 4"));

  expect(screen.getByText("Active journey")).toBeTruthy();
  expect(screen.getByText("Service 95")).toBeTruthy();
  expect(screen.getByText("Return to journey")).toBeTruthy();

  fireEvent.press(screen.getByText("Return to journey"));
  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.getByText("Review journey")).toBeTruthy();
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

  await screen.findByText("Onboard journey");
  expect(
    screen.getByLabelText(/Onboard journey map.*Service 95/i),
  ).toBeTruthy();
  expect(screen.getByText("Journey map")).toBeTruthy();
  expect(screen.getByText("Bus 95")).toBeTruthy();
  expect(screen.getByText("NEXT STOP")).toBeTruthy();
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);
  expect(screen.getByText("3 stops remaining")).toBeTruthy();
  expect(screen.getByText(/YOUR STOP/)).toBeTruthy();
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
  expect(screen.getByText("3 stops remaining")).toBeTruthy();

  fireEvent.press(screen.getByText("Set as destination"));
  expect(screen.getByText("2 stops remaining")).toBeTruthy();
  expect(screen.getAllByText(/YOUR STOP/).length).toBeGreaterThan(0);
});

it("separates remaining stops from the geographic full-route action", async () => {
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
  expect(screen.queryByLabelText("Zoom map in")).toBeNull();
  expect(screen.queryByLabelText("Zoom map out")).toBeNull();

  fireEvent.press(screen.getByLabelText("More"));
  expect(screen.queryByLabelText("View journey")).toBeNull();
  expect(screen.getByText("Map options")).toBeTruthy();
  expect(screen.getByText("View full route")).toBeTruthy();
  fireEvent.press(screen.getByText("Rotate map"));
  expect(screen.getByLabelText("Reset map to north")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Reset map to north"));
  fireEvent.press(screen.getByText("Move journey map manually"));
  expect(screen.getAllByText("Return to journey").length).toBeGreaterThan(0);

  fireEvent.press(screen.getAllByText("Return to journey")[0]);
  expect(screen.getByText("Journey position")).toBeTruthy();
  expect(screen.getAllByText("Journey").length).toBeGreaterThan(0);

  fireEvent.press(screen.getByLabelText("View remaining stops"));
  const remainingStops = within(screen.getByTestId("remaining-stops-list"));
  expect(remainingStops.getByText("Opp Heng Mui Keng Terrace")).toBeTruthy();
  expect(remainingStops.getByText("Science Drive")).toBeTruthy();
  expect(remainingStops.getByText("Opp Science Drive")).toBeTruthy();
  expect(remainingStops.queryByText("Kent Ridge Crescent")).toBeNull();
  expect(remainingStops.queryByText("PASSED")).toBeNull();

  fireEvent.press(screen.getByLabelText("View full route"));
  expect(screen.queryByTestId("remaining-stops-list")).toBeNull();
  expect(screen.getAllByText("Return to journey").length).toBeGreaterThan(0);
});

it("hides remaining stops at arrival and prioritizes safe alighting", async () => {
  await startOnboardJourney();

  fireEvent.press(screen.getByLabelText(/Opp Science Drive.*alighting stop/i));
  fireEvent.press(screen.getByText("Review journey"));
  await screen.findByText("Your journey");
  fireEvent.press(screen.getByLabelText("Request assistance"));
  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByText("I'm onboard"));

  fireEvent.press(screen.getByLabelText("View remaining stops"));
  expect(screen.getByTestId("remaining-stops-list")).toBeTruthy();
  fireEvent.press(screen.getByText("Simulate next stop"));
  fireEvent.press(screen.getByText("Simulate next stop"));
  fireEvent.press(screen.getByText("Simulate next stop"));

  expect(screen.getByText("FINAL STOP")).toBeTruthy();
  expect(screen.getByText("You have arrived.")).toBeTruthy();
  expect(screen.getAllByText("Alighting assistance").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("I've safely alighted")).toBeTruthy();
  expect(screen.queryByLabelText("View remaining stops")).toBeNull();
  expect(screen.queryByLabelText("Hide remaining stops")).toBeNull();
  expect(screen.queryByTestId("remaining-stops-list")).toBeNull();
  expect(screen.queryByText(/0 .*remaining/i)).toBeNull();
  expect(screen.queryByLabelText("View journey")).toBeNull();
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

  await screen.findByText("3 stops remaining");
  fireEvent.press(screen.getByText("Simulate next stop"));
  expect(screen.getByText("2 stops remaining")).toBeTruthy();

  fireEvent.press(screen.getByText("Simulate next stop"));
  expect(screen.getAllByText("YOUR STOP IS NEXT").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Opp Science Drive").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Your stop is next").length).toBeGreaterThan(0);
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
  await screen.findByText("Onboard journey");

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, assistance request active, 3 of 4/),
  );
  expect(screen.getByText("On Service 95")).toBeTruthy();
  expect(screen.getByText("Destination: Opp Science Drive")).toBeTruthy();
  expect(screen.getByText("Request disembarking assistance")).toBeTruthy();
  expect(screen.queryByText("Assistance for this bus")).toBeNull();
});

it("preserves journey and assistance state across Journey Assist Profile Journey navigation", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);
  await signInDemoProfile();

  fireEvent.press(screen.getByLabelText(/Journey, tab, map ready, 2 of 4/));
  await screen.findByLabelText("Nearby bus stops");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, bus stop 18301, 45 metres away/i,
    ),
  );
  fireEvent.press(screen.getByText("Choose this stop"));
  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
  await screen.findByText("Where are you getting off?");
  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  await screen.findByText("Assistance for this bus");

  fireEvent.press(screen.getByLabelText("Mobility Assistance, not selected"));
  fireEvent.press(screen.getByLabelText(/Profile, tab, 4 of 4/));
  expect(screen.getByText("My profile")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Journey, tab, active journey, 2 of 4/),
  );
  expect(screen.getByText("Where are you getting off?")).toBeTruthy();
  expect(screen.getByText("Review journey")).toBeTruthy();

  fireEvent.press(
    screen.getByLabelText(/Assist, tab, preferences available, 3 of 4/),
  );
  expect(screen.getByText("Assistance for this bus")).toBeTruthy();
  expect(
    screen.getByLabelText("Mobility Assistance, selected").props
      .accessibilityState,
  ).toMatchObject({
    checked: true,
    selected: true,
  });
  expect(screen.getByText("Service 95")).toBeTruthy();
});

it("keeps appearance mode in profile and toggles between light and dark", () => {
  render(<App />);

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
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

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));

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

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
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
