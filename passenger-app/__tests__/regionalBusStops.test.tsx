import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { BusStop, NearbyBusStopsResponse } from "@buspass/shared";

import App from "../App";

const nearbyStop: BusStop & { distanceMeters: number } = {
  busStopCode: "18301",
  roadName: "Kent Ridge Cres",
  description: "Kent Ridge Crescent",
  latitude: 1.29398,
  longitude: 103.77104,
  services: ["95"],
  distanceMeters: 45,
};

const doverStop: BusStop & { distanceMeters: number } = {
  busStopCode: "19069",
  roadName: "Dover Rd",
  description: "Opp Ayer Rajah Telecoms",
  latitude: 1.3078,
  longitude: 103.7767,
  services: ["33", "196"],
  distanceMeters: 120,
};

const clementiStop: BusStop & { distanceMeters: number } = {
  busStopCode: "17009",
  roadName: "Clementi Ave 3",
  description: "Clementi Int",
  latitude: 1.3149,
  longitude: 103.7641,
  services: ["196"],
  distanceMeters: 20,
};

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function nearbyResponse(stops: Array<BusStop & { distanceMeters: number }>) {
  return {
    stops,
    debug: {
      latitude: 1.2942,
      longitude: 103.7711,
      accuracyMeters: 12,
      maxDistanceMeters: 500,
    },
  } satisfies NearbyBusStopsResponse;
}

function mockLocation() {
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
}

function journeyMapMountCount() {
  return (
    require("../__mocks__/JourneyMap") as {
      getJourneyMapMountCount: () => number;
    }
  ).getJourneyMapMountCount();
}

beforeEach(() => {
  (globalThis as any).__GOASSIST_REGIONAL_MAP_TEST__ = true;
  (globalThis as any).document = {};
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "web",
  });
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
  mockLocation();
});

it("performs the initial regional request, renders returned stops, and keeps Nearby closed", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return jsonResponse(nearbyResponse([nearbyStop]));
    }
    if (url.includes("/api/bus-stops/nearby?")) {
      return jsonResponse({ stops: [doverStop], radiusMeters: 3_000 });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(<App />);
  fireEvent.press(screen.getByLabelText("Use my location"));

  expect(await screen.findByTestId("leaflet-map-mock")).toBeTruthy();
  expect(await screen.findByTestId("rendered-stop-19069")).toBeTruthy();
  expect(screen.queryByLabelText("Nearby bus stops")).toBeNull();
  expect(
    (global.fetch as jest.Mock).mock.calls.some(([url]) =>
      String(url).includes("/api/bus-stops/nearby?"),
    ),
  ).toBe(true);
});

it("keeps old markers during a transient failure and retries without remounting the map", async () => {
  let regionalRequestCount = 0;
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return jsonResponse(nearbyResponse([nearbyStop]));
    }
    if (url.includes("/api/bus-stops/nearby?")) {
      regionalRequestCount += 1;
      if (regionalRequestCount === 1) {
        return jsonResponse({ stops: [doverStop], radiusMeters: 3_000 });
      }
      if (regionalRequestCount === 2) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return jsonResponse({ stops: [clementiStop], radiusMeters: 3_000 });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const mountsBefore = journeyMapMountCount();
  render(<App />);
  fireEvent.press(screen.getByLabelText("Use my location"));
  await screen.findByTestId("rendered-stop-19069");
  const mountsAfterInitialLoad = journeyMapMountCount();
  expect(mountsAfterInitialLoad).toBe(mountsBefore + 1);

  fireEvent.press(screen.getByLabelText("Pan mock map to Clementi"));
  expect(await screen.findByText("Unable to update bus stops")).toBeTruthy();
  expect(screen.getByTestId("rendered-stop-19069")).toBeTruthy();
  expect(screen.getByTestId("leaflet-map-mock")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Retry loading bus stops"));
  expect(await screen.findByTestId("rendered-stop-17009")).toBeTruthy();
  expect(journeyMapMountCount()).toBe(mountsAfterInitialLoad);
});

it("shows a neutral empty state instead of an error for a successful zero-stop response", async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return jsonResponse(nearbyResponse([]));
    }
    if (url.includes("/api/bus-stops/nearby?")) {
      return jsonResponse({ stops: [], radiusMeters: 3_000 });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(<App />);
  fireEvent.press(screen.getByLabelText("Use my location"));

  expect(await screen.findByTestId("leaflet-map-mock")).toBeTruthy();
  expect(await screen.findByText("No bus stops in this area.")).toBeTruthy();
  expect(screen.queryByText("Unable to load bus stops")).toBeNull();
});

it("ignores an older regional response that finishes after a newer pan request", async () => {
  let regionalRequestCount = 0;
  let resolveOlder: ((value: unknown) => void) | undefined;
  let resolveNewer: ((value: unknown) => void) | undefined;
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/api/location/nearby-bus-stops")) {
      return jsonResponse(nearbyResponse([]));
    }
    if (url.includes("/api/bus-stops/nearby?")) {
      regionalRequestCount += 1;
      return new Promise((resolve) => {
        if (regionalRequestCount === 1) resolveOlder = resolve;
        else resolveNewer = resolve;
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  render(<App />);
  fireEvent.press(screen.getByLabelText("Use my location"));
  await screen.findByTestId("leaflet-map-mock");
  await waitFor(() => expect(regionalRequestCount).toBe(1));

  fireEvent.press(screen.getByLabelText("Pan mock map to Clementi"));
  await waitFor(() => expect(regionalRequestCount).toBe(2));
  await act(async () => {
    resolveNewer?.({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ stops: [clementiStop], radiusMeters: 3_000 }),
    });
  });
  expect(await screen.findByTestId("rendered-stop-17009")).toBeTruthy();

  await act(async () => {
    resolveOlder?.({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ stops: [doverStop], radiusMeters: 3_000 }),
    });
  });
  await waitFor(() => {
    expect(screen.getByTestId("rendered-stop-17009")).toBeTruthy();
    expect(screen.queryByTestId("rendered-stop-19069")).toBeNull();
  });
});
