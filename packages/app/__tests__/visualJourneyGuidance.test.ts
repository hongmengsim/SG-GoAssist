import {
  bearingBetweenCoordinates,
  deriveJourneyVisualInstruction,
  directionFrame,
  shortestSignedAngle,
  smoothHeading,
} from "../src/guidance/visualJourneyGuidance";

describe("visual journey instruction derivation", () => {
  it.each([
    ["WALKING_TO_STOP", "WALK", "walkingToStop"],
    ["WAITING_FOR_BUS", "WAIT", "waitingForBus"],
    ["BOARDING", "BOARD", "safeBoarding"],
    ["ONBOARD", "RIDE", "onboardJourney"],
    ["ALIGHTING", "EXIT", "safeAlighting"],
    ["COMPLETED", "EXIT", "journeyComplete"],
  ] as const)(
    "maps %s to its stable guide stage",
    (journeyPhase, stage, scene) => {
      const result = deriveJourneyVisualInstruction({
        journeyPhase,
        selectedStopName: "Science Drive",
        serviceNo: "95",
        destinationName: "Buona Vista",
      });

      expect(result.stage).toBe(stage);
      expect(result.scene).toBe(scene);
      expect(result.title).toBeTruthy();
      expect(result.steps.length).toBeGreaterThan(0);
    },
  );

  it("lets an unsafe assistance state override normal boarding guidance", () => {
    const result = deriveJourneyVisualInstruction({
      journeyPhase: "BOARDING",
      serviceNo: "95",
      vehicleStatus: "ARRIVED",
      assistanceCaseState: "BLOCKED",
      wheelchairAssistance: true,
    });

    expect(result.tone).toBe("BLOCKED");
    expect(result.title).toBe("Wait in a safe place");
    expect(result.summary).not.toMatch(/board now/i);
  });

  it("offers camera guidance only for a supported walking context", () => {
    const base = {
      journeyPhase: "WALKING_TO_STOP" as const,
      walkingStep: {
        instruction: "Turn right onto Dover Road",
        distanceMeters: 45,
        maneuverDirection: "RIGHT" as const,
        roadName: "Dover Road",
      },
    };

    expect(
      deriveJourneyVisualInstruction({ ...base, cameraGuideAvailable: true })
        .actions,
    ).toContain("CAMERA_GUIDE");
    expect(
      deriveJourneyVisualInstruction({ ...base, cameraGuideAvailable: false })
        .actions,
    ).not.toContain("CAMERA_GUIDE");
  });

  it("does not invent a maneuver distance before a walking route is ready", () => {
    const result = deriveJourneyVisualInstruction({
      journeyPhase: "WALKING_TO_STOP",
      selectedStopName: "Science Drive",
    });

    expect(result.visualKind).toBe("SCENE");
    expect(result.maneuver).toBeUndefined();
    expect(result.steps[0]?.description).not.toContain("0 m");
  });

  it("shows autonomous safety monitoring without changing the passenger action", () => {
    const result = deriveJourneyVisualInstruction({
      journeyPhase: "BOARDING",
      serviceNo: "95",
      autonomousVehicle: true,
      autonomousDriveState: "STOPPED_SECURE",
      vehicleStatus: "ARRIVED",
    });

    expect(result.statusLine).toMatch(/stopped.*parking brake/i);
    expect(result.steps.at(-1)?.title).toBe("Board carefully");
  });
});

describe("direction frames", () => {
  const origin = { latitude: 1.3, longitude: 103.78 };
  const north = { latitude: 1.301, longitude: 103.78 };

  it("normalizes bearing and wrap-around angles", () => {
    expect(bearingBetweenCoordinates(origin, north)).toBeCloseTo(0, 3);
    expect(shortestSignedAngle(350, 10)).toBe(20);
    expect(shortestSignedAngle(10, 350)).toBe(-20);
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 3);
  });

  it("treats plus or minus 15 degrees as aligned", () => {
    expect(
      directionFrame({
        currentLocation: origin,
        target: north,
        headingDegrees: 15,
        headingAccuracy: 3,
        locationAccuracyMeters: 10,
      }).alignment,
    ).toBe("ALIGNED");
  });

  it("never returns a precise arrow with weak location or heading data", () => {
    expect(
      directionFrame({
        currentLocation: origin,
        target: north,
        headingDegrees: 90,
        headingAccuracy: 3,
        locationAccuracyMeters: 80,
      }).alignment,
    ).toBe("BROAD_DIRECTION");
    expect(
      directionFrame({
        currentLocation: origin,
        target: north,
        headingDegrees: null,
        locationAccuracyMeters: 10,
      }).alignment,
    ).toBe("UNAVAILABLE");
  });
});
