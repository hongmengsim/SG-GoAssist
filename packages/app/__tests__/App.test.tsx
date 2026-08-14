import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
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

  await screen.findByText("Choose Your Bus Stop");
  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301, approximately 45 metres away/i
    )
  );
  fireEvent.press(screen.getByText("This is my stop"));

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

  await screen.findByText("Choose Your Bus Stop");
  expect(screen.getByText("Select the bus stop where you are waiting.")).toBeTruthy();
  expect(screen.getByLabelText("Search bus stop or location")).toBeTruthy();
  expect(screen.getByLabelText("Map view")).toBeTruthy();
  expect(screen.getByLabelText("List view")).toBeTruthy();
  expect(screen.getByLabelText("Nearby bus stop map. 2 stops shown.")).toBeTruthy();
  expect(screen.getByLabelText("This is my stop").props.accessibilityState).toMatchObject({
    disabled: true,
  });

  fireEvent.press(
    screen.getByLabelText(
      /Kent Ridge Crescent, Kent Ridge Cres, bus stop 18301, approximately 45 metres away/i
    )
  );
  fireEvent.press(screen.getByText("This is my stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("Bus Stop 18301 · Kent Ridge Crescent")).toBeTruthy();
  expect(screen.getByText("95")).toBeTruthy();
  expect(screen.getByText("Kent Ridge Terminal")).toBeTruthy();
});

it("selects a nearby stop from the map and opens the selected stop card", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Choose Your Bus Stop");
  fireEvent.press(screen.getByLabelText(/Bus stop 18301, Kent Ridge Crescent, 45 metres away/i));

  expect(screen.getByText("Kent Ridge Crescent - Bus Stop 18301")).toBeTruthy();
  expect(screen.getByText(/Approx\. 45 m away/i)).toBeTruthy();
  expect(screen.getByText("Accessible boarding available")).toBeTruthy();

  fireEvent.press(screen.getByText("Select This Stop"));

  await screen.findByText("Choose your bus");
  expect(screen.getByText("95")).toBeTruthy();
});

it("filters nearby stops by search and supports list view selection", async () => {
  mockSuccessfulJourneyApis();
  render(<App />);

  fireEvent.press(screen.getByText("Select bus stop manually"));

  await screen.findByText("Choose Your Bus Stop");
  fireEvent.changeText(screen.getByLabelText("Search bus stop or location"), "18321");
  expect(screen.queryByText("Kent Ridge Crescent")).toBeNull();
  expect(screen.getByText("Opp Heng Mui Keng Terrace")).toBeTruthy();

  fireEvent.press(screen.getByLabelText("List view"));
  expect(screen.getByLabelText("List view").props.accessibilityState).toMatchObject({
    selected: true,
  });
  fireEvent.press(
    screen.getByLabelText(
      /Opp Heng Mui Keng Terrace, Kent Ridge Cres, bus stop 18321, approximately 210 metres away/i
    )
  );
  expect(screen.getByText("Opp Heng Mui Keng Terrace - Bus Stop 18321")).toBeTruthy();
});

it("falls back to manual stop selection when location permission is denied", async () => {
  mockSuccessfulJourneyApis();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
  render(<App />);

  fireEvent.press(screen.getByText("Use my location"));

  await screen.findByText("Choose Your Bus Stop");
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
  expect(screen.getByLabelText("Dark mode").props.accessibilityState).toMatchObject({
    checked: false,
  });

  fireEvent.press(screen.getByLabelText("Dark mode"));

  expect(screen.getByLabelText("Dark mode").props.accessibilityState).toMatchObject({
    checked: true,
  });
});
