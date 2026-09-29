import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import App from "../App";

const preferencesKey = "sg-goassist.preferences.v1";
const activeJourneyKey = "sg-goassist.active-journey.v1";

it("hydrates saved text, contrast, and appearance preferences before persisting", async () => {
  await AsyncStorage.setItem(
    preferencesKey,
    JSON.stringify({
      assistanceDefaults: {
        wheelchairRamp: true,
        busAudioIdentification: false,
        extendedDwellTime: true,
      },
      appPreferences: {
        screenReaderOptimised: true,
        spokenGuidance: true,
        hapticAlerts: false,
        largeText: true,
        highContrast: true,
        repeatAudio: true,
        themeMode: "dark",
      },
    }),
  );

  render(<App />);

  await waitFor(async () => {
    const saved = JSON.parse(
      (await AsyncStorage.getItem(preferencesKey)) ?? "{}",
    );
    expect(saved).toMatchObject({
      version: 2,
      accessibilityPreferences: {
        wheelchairAssistance: true,
        extraBoardingTime: true,
        spokenGuidance: true,
        textSize: "LARGE",
        highContrast: true,
        themeMode: "dark",
      },
    });
  });

  await waitFor(() => {
    const copy = screen.getByText(
      "Choose a nearby stop and the bus you want to board.",
    );
    expect(StyleSheet.flatten(copy.props.style)?.fontSize).toBe(20);
  });
});

it("persists guest appearance changes across app launches", async () => {
  render(<App />);
  fireEvent.press(screen.getByLabelText("Profile, tab, 3 of 3"));
  fireEvent.press(screen.getByLabelText("Dark mode"));

  await waitFor(async () => {
    const saved = JSON.parse(
      (await AsyncStorage.getItem(preferencesKey)) ?? "{}",
    );
    expect(saved.accessibilityPreferences?.themeMode).toBe("dark");
  });
});

it("restores a persisted active Journey and refreshes its live arrival", async () => {
  const boardingStop = {
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
    services: ["95"],
    distanceMeters: 45,
  };
  const destinationStop = {
    sequence: 2,
    busStopCode: "18321",
    roadName: "Kent Ridge Cres",
    description: "Opp Heng Mui Keng Terrace",
    latitude: 1.29295,
    longitude: 103.77508,
  };
  const savedArrival = {
    busId: "SGA-95-SAVED",
    serviceNo: "95",
    arrivalSlot: "NEXT_BUS",
    etaSeconds: 240,
    wheelchairAccessible: true,
    vehicleType: "SD",
    destination: destinationStop.description,
  };
  const refreshedArrival = {
    ...savedArrival,
    busId: "SGA-95-LIVE",
    etaSeconds: 60,
  };

  await AsyncStorage.setItem(
    activeJourneyKey,
    JSON.stringify({
      version: 1,
      savedAt: "2026-08-28T12:00:00.000Z",
      selectedStop: boardingStop,
      selectedServiceOption: {
        serviceNo: "95",
        destination: destinationStop.description,
        buses: [savedArrival],
        arrivalUnavailable: false,
      },
      selectedBus: {
        busId: savedArrival.busId,
        busService: "95",
        routeNumber: "95",
        currentStop: boardingStop.description,
        nextStop: destinationStop.description,
        isAccessible: true,
        wheelchairSpaces: 1,
        latitude: boardingStop.latitude,
        longitude: boardingStop.longitude,
        estimatedArrivalSeconds: savedArrival.etaSeconds,
      },
      selectedArrival: savedArrival,
      selectedAlightingStop: destinationStop,
      routeStops: [{ ...boardingStop, sequence: 0 }, destinationStop],
      currentStopIndex: 0,
      journeyPhase: "WAITING_FOR_BUS",
      journeySetupState: "WAITING_FOR_BUS",
      journeyRequirements: {
        wheelchairRamp: false,
        busAudioIdentification: false,
        extendedDwellTime: false,
      },
      requestId: null,
      requestStatus: null,
      vehicleStatus: null,
    }),
  );
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        busStop: boardingStop,
        services: [{ serviceNo: "95", buses: [refreshedArrival] }],
      }),
  });

  render(<App />);

  expect(
    (await screen.findAllByText("Waiting for bus")).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getByLabelText("Journey, tab, selected, active journey, 1 of 3"),
  ).toBeTruthy();
  expect(screen.getByText("Destination:")).toBeTruthy();
  expect(screen.getByText("Opp Heng Mui Keng Terrace")).toBeTruthy();
  expect(screen.queryByText("Find your bus")).toBeNull();
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/location/bus-stops/18301/arrivals"),
      expect.anything(),
    ),
  );
  await waitFor(() => expect(screen.getByText(/about 1 min/i)).toBeTruthy());
});
