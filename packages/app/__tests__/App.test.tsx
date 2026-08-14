import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import fs from "fs";
import path from "path";
import App from "../App";
import type { BusStopArrivalsResponse, NearbyBusStopsResponse } from "@buspass/shared";

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
    const channels = [0, 2, 4].map((start) => parseInt(normalized.slice(start, start + 2), 16) / 255);
    const linear = channels.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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

    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
}

async function selectBusFromManualStopFlow() {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));
  fireEvent.press(screen.getByText("THIS IS MY STOP"));

  await screen.findByText("Choose your bus");
  fireEvent.press(screen.getByLabelText(/Bus 95 towards Kent Ridge Terminal/i));
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
  expect(screen.getByLabelText("Repeat guidance").props.accessibilityState).toMatchObject({
    disabled: true,
  });
});

it("lets a passenger manually choose a stop, confirm it, and see arriving buses", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  expect(screen.getByText("Select a bus stop from the map or list.")).toBeTruthy();
  expect(screen.getByLabelText("Search bus stop or location")).toBeTruthy();
  expect(screen.getByLabelText("Map view")).toBeTruthy();
  expect(screen.getByLabelText("List view")).toBeTruthy();
  expect(screen.getByLabelText("Nearby bus stop map. 2 stops shown.")).toBeTruthy();
  expect(screen.getByLabelText("Your current location.")).toBeTruthy();
  expect(screen.getByLabelText("Re-centre map on my current location.")).toBeTruthy();

  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));
  expect(screen.getByText("45 m")).toBeTruthy();
  fireEvent.press(screen.getByText("THIS IS MY STOP"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("Bus Stop 18301 - Kent Ridge Crescent")).toBeTruthy();
  expect(screen.getByText("95")).toBeTruthy();
  expect(screen.getByText("Kent Ridge Terminal")).toBeTruthy();
});

it("selects a nearby stop from the map and opens the selected stop card", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));

  expect(screen.getByText("Kent Ridge Crescent")).toBeTruthy();
  expect(screen.getByText(/45 m away/i)).toBeTruthy();
  expect(screen.getByText("Accessible boarding")).toBeTruthy();
  expect(screen.getByText("Near University Hall")).toBeTruthy();
  expect(screen.getByText("Walking to Stop 18301")).toBeTruthy();

  fireEvent.press(screen.getByText("THIS IS MY STOP"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("95")).toBeTruthy();
});

it("shows accessible walking directions, follow mode, and route fitting for a selected stop", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));
  fireEvent.press(screen.getByText("Directions"));

  expect(screen.getByText(/Head towards Kent Ridge Cres/i)).toBeTruthy();
  expect(screen.getByLabelText("Show whole route.")).toBeTruthy();
  expect(screen.getByLabelText("Follow Me").props.accessibilityState).toMatchObject({
    checked: false,
  });

  fireEvent.press(screen.getByLabelText("Follow Me"));
  expect(screen.getByLabelText("Follow Me").props.accessibilityState).toMatchObject({
    checked: true,
  });
  fireEvent.press(screen.getByLabelText("Move map manually"));
  expect(screen.getByLabelText("Follow Me").props.accessibilityState).toMatchObject({
    checked: false,
  });
  expect(screen.getByLabelText("Search this area.")).toBeTruthy();
});

it("supports landmark search without automatically selecting a bus stop", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  fireEvent.changeText(screen.getByLabelText("Search bus stop or location"), "University Hall");
  fireEvent.press(screen.getByLabelText("University Hall. Landmark. Show nearby bus stops."));

  expect(screen.getByLabelText("University Hall. building landmark.")).toBeTruthy();
  expect(screen.queryByText("THIS IS MY STOP")).toBeNull();
  expect(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301/i)).toBeTruthy();
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

  await screen.findByText("Select Bus Stop");
  expect(screen.getByLabelText("2 nearby bus stops. Activate to view individual stops.")).toBeTruthy();
  expect(screen.queryByLabelText(/Opp Kent Ridge Crescent, bus stop 18309/i)).toBeNull();

  fireEvent.press(screen.getByLabelText("2 nearby bus stops. Activate to view individual stops."));

  expect(screen.getByLabelText(/Opp Kent Ridge Crescent, bus stop 18309/i)).toBeTruthy();
  expect(screen.getByLabelText(/Prince George's Park, bus stop 18311/i)).toBeTruthy();
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

  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));
  fireEvent.press(screen.getByText("THIS IS MY STOP"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("Bus Stop 18301 - Kent Ridge Crescent")).toBeTruthy();
  expect(screen.getByText("Arrival info unavailable")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
});

it("reuses cached nearby stops when manual selection is opened again", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));
  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Home, tab, selected, 1 of 4/));
  fireEvent.press(screen.getByText("Select bus stop manually"));

  await waitFor(() => {
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/api/location/nearby-bus-stops")
    )).toHaveLength(1);
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
  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText(/Kent Ridge Crescent, bus stop 18301, 45 metres away/i));
  fireEvent.press(screen.getByText("THIS IS MY STOP"));
  await screen.findByText("Choose your bus");
  await screen.findByText("Bus arrival information is temporarily unavailable.");
  fireEvent.press(screen.getByLabelText("Try again"));

  expect((global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes("/api/location/bus-stops/18301/arrivals")
  )).toHaveLength(1);
});

it("filters nearby stops by search and supports list view selection", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Select Bus Stop");
  fireEvent.changeText(screen.getByLabelText("Search bus stop or location"), "18321");
  expect(screen.queryByText("Kent Ridge Crescent")).toBeNull();

  fireEvent.press(screen.getByLabelText("List view"));
  expect(screen.getAllByText("Opp Heng Mui Keng Terrace").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("List view").props.accessibilityState).toMatchObject({
    selected: true,
  });
  fireEvent.press(
    screen.getByLabelText(
      /Opp Heng Mui Keng Terrace, Kent Ridge Cres, bus stop 18321, approximately 210 metres away/i
    )
  );
  expect(screen.getAllByText("Opp Heng Mui Keng Terrace").length).toBeGreaterThan(0);
});

it("falls back to manual stop selection when location permission is denied", async () => {
  mockSuccessfulJourneyApis();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByText("Select Bus Stop");
  fireEvent.press(screen.getByLabelText("List view"));
  expect(screen.getByText("Kent Ridge Crescent")).toBeTruthy();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/location/nearby-bus-stops"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        latitude: 1.2942,
        longitude: 103.7711,
        accuracyMeters: 0,
      }),
    })
  );
});

it("moves a selected arrival into the assistance setup screen and keeps bus-side assistance profile gated", async () => {
  await selectBusFromManualStopFlow();

  await screen.findByText("How can we assist?");
  expect(screen.getByText("Profile required")).toBeTruthy();
  expect(screen.getByText("Go to profile")).toBeTruthy();
  expect(screen.getByLabelText("Review assistance request").props.accessibilityState).toMatchObject({
    disabled: true,
  });
});

it("shows phone accessibility controls on the assistance screen for guest journeys", async () => {
  await selectBusFromManualStopFlow();

  await waitFor(() => expect(screen.getByText("Phone Accessibility")).toBeTruthy());
  expect(screen.queryByText("Appearance")).toBeNull();
  expect(screen.getByText("Screen-reader optimised")).toBeTruthy();
  expect(screen.getByText("Haptic alerts")).toBeTruthy();
  expect(screen.getByText("Large text")).toBeTruthy();
  expect(screen.getByText("High contrast")).toBeTruthy();
});

it("keeps appearance mode in profile and toggles between light and dark", () => {
  render(<App />);

  fireEvent.press(screen.getByLabelText("Profile, tab, 4 of 4"));
  expect(screen.getByText("Appearance")).toBeTruthy();
  expect(
    screen.getByLabelText("Passenger defaults: Bus identification assistance.")
  ).toBeTruthy();
  expect(screen.getByLabelText("Dark mode").props.accessibilityState).toMatchObject({
    checked: false,
  });

  fireEvent.press(screen.getByLabelText("Dark mode"));

  expect(screen.getByLabelText("Dark mode").props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("defines paired semantic colour tokens with accessible representative contrast", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  [
    "location",
    "accessible",
    "warning",
    "assistance",
    "danger",
    "textOnPrimary",
    "textOnAccessible",
    "textOnWarning",
    "textOnAssistance",
    "textOnDanger",
  ].forEach((token) => {
    expect(source).toContain(token);
  });

  expect(contrastRatio("#FFFFFF", "#0B6670")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#203438", "#F7FAFA")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#102A30", "#F5B942")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#FFFFFF", "#6B5CA5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#F7FAFA", "#0F2024")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#102A30", "#86C5DA")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#17202B", "#B9A9E8")).toBeGreaterThanOrEqual(4.5);
});

it("uses shared visual language tokens instead of legacy one-off control colours", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");

  ["const spacing", "const radius", "const borders", "const typography", "const touchTarget"].forEach(
    (tokenGroup) => {
      expect(source).toContain(tokenGroup);
    }
  );

  ["#102529", "#69C8D8", "#7DD7E5", "#EDF4F5", "#A8E4EC"].forEach((legacyColor) => {
    expect(source).not.toContain(legacyColor);
  });
});
