import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render } from "@testing-library/react-native";
import type { PassengerContextSnapshot } from "@buspass/shared";
import { JourneyHub } from "../src/passengerJourney/JourneyHub";
import { JourneyCompletionSummary } from "../src/passengerJourney/JourneyCompletionSummary";
import {
  emptyPassengerJourneyLocalState,
  parsePassengerJourneyLocalState,
  readPassengerJourneyLocalState,
  savePassengerJourneyLocalState,
  withPassengerContext,
  withRecentJourney,
  toggleFavouriteDestination,
} from "../src/passengerJourney/passengerJourneyPersistence";

const snapshot: PassengerContextSnapshot = {
  generatedAt: new Date().toISOString(),
  radiusMeters: 200,
  nearbyStops: [
    {
      stop: {
        busStopCode: "18301",
        roadName: "Lower Kent Ridge Road",
        description: "Lim Seng Tjoe Building",
        latitude: 1.297385,
        longitude: 103.780927,
        services: ["95"],
        distanceMeters: 45,
      },
      distanceMeters: 45,
      walkingMinutes: 1,
      arrivals: [
        {
          serviceNo: "95",
          buses: [
            {
              busId: "AV-095-01",
              serviceNo: "95",
              arrivalSlot: "NEXT_BUS",
              etaSeconds: 240,
              wheelchairAccessible: true,
              vehicleType: "SD",
              destination: "Central Library",
            },
          ],
        },
      ],
      amenities: {
        stopCode: "18301",
        shelter: "YES",
        seating: "YES",
        lighting: "YES",
        tactilePaving: "YES",
        stepFreeKerb: "YES",
        audioBeacon: "YES",
        physicalAssistButton: "YES",
        provenance: {
          kind: "VERIFIED_FIXTURE",
          sourceLabel: "Prototype verified data",
        },
      },
      vehicles: [],
    },
  ],
  advisories: [],
  provenance: {
    kind: "VERIFIED_FIXTURE",
    sourceLabel: "Prototype verified data",
  },
};

describe("passenger journey hub", () => {
  it("keeps one prominent stop action and exposes compact context", () => {
    const choose = jest.fn();
    const screen = render(
      <JourneyHub
        snapshot={snapshot}
        simplified={false}
        highContrast={false}
        lightMode
        onChooseStop={choose}
        onCompareNearby={jest.fn()}
        onFocusedAssist={jest.fn()}
        onRefresh={jest.fn()}
        favourite={false}
        savedStopNames={[]}
        onToggleFavourite={jest.fn()}
      />,
    );

    expect(screen.getByText("Lim Seng Tjoe Building")).toBeTruthy();
    expect(screen.getByText("Sheltered")).toBeTruthy();
    expect(screen.getByText("Step-free")).toBeTruthy();
    expect(screen.getByText("4 min")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Choose this stop"));
    expect(choose).toHaveBeenCalledWith(snapshot.nearbyStops[0].stop);
  });

  it("hides secondary density in simplified mode", () => {
    const screen = render(
      <JourneyHub
        snapshot={snapshot}
        simplified
        highContrast={false}
        lightMode
        onChooseStop={jest.fn()}
        onCompareNearby={jest.fn()}
        onFocusedAssist={jest.fn()}
        onRefresh={jest.fn()}
        favourite={false}
        savedStopNames={[]}
        onToggleFavourite={jest.fn()}
      />,
    );
    expect(screen.queryByText("Next services")).toBeNull();
    expect(screen.queryByLabelText("Compare nearby")).toBeNull();
    expect(screen.getByLabelText("Choose this stop")).toBeTruthy();
  });
});

describe("passenger journey persistence", () => {
  it("keeps five recent journeys and the last verified context", async () => {
    let state = withPassengerContext(emptyPassengerJourneyLocalState, snapshot);
    for (let index = 0; index < 7; index += 1) {
      state = withRecentJourney(state, {
        id: `journey-${index}`,
        completedAt: new Date(2026, 8, index + 1).toISOString(),
        serviceNo: "95",
        boardingStop: snapshot.nearbyStops[0].stop,
        destination: snapshot.nearbyStops[0].stop,
      });
    }
    expect(state.recentJourneys).toHaveLength(5);
    expect(state.recentJourneys[0].id).toBe("journey-6");

    await savePassengerJourneyLocalState(state);
    expect((await readPassengerJourneyLocalState()).lastContext).toEqual(
      snapshot,
    );
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it("fails closed for malformed or future persistence", () => {
    expect(parsePassengerJourneyLocalState("not-json")).toEqual(
      emptyPassengerJourneyLocalState,
    );
    expect(parsePassengerJourneyLocalState('{"version":99}')).toEqual(
      emptyPassengerJourneyLocalState,
    );
  });

  it("saves and removes a favourite destination without duplication", () => {
    const destination = {
      id: "stop:16181",
      label: "Central Library",
      latitude: 1.2962,
      longitude: 103.7733,
    };
    const saved = toggleFavouriteDestination(
      emptyPassengerJourneyLocalState,
      destination,
    );
    expect(saved.favouriteDestinations).toEqual([destination]);
    expect(
      toggleFavouriteDestination(saved, destination).favouriteDestinations,
    ).toEqual([]);
  });
});

describe("journey completion summary", () => {
  it("keeps repeat as the primary action and records feedback locally", () => {
    const repeat = jest.fn();
    const screen = render(
      <JourneyCompletionSummary
        serviceNo="95"
        destinationName="Central Library"
        elapsedMinutes={14}
        stopsTravelled={3}
        assistanceOutcome="Assistance completed"
        destinationSaved={false}
        simplified={false}
        lightMode
        highContrast={false}
        onRepeat={repeat}
        onToggleSaveDestination={jest.fn()}
        onPlanAnother={jest.fn()}
      />,
    );
    expect(screen.getByText("About 14 min")).toBeTruthy();
    expect(screen.getByText("3 stops")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Helpful"));
    expect(screen.getByLabelText("Helpful").props.accessibilityState).toEqual({
      selected: true,
    });
    fireEvent.press(screen.getByLabelText("Repeat this journey"));
    expect(repeat).toHaveBeenCalledTimes(1);
  });
});
