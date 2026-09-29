import { parsePersistedActiveJourney } from "../App";

const legacyJourney = {
  version: 1,
  savedAt: "2026-08-31T00:00:00.000Z",
  selectedStop: { busStopCode: "18331", description: "Science Drive" },
  selectedServiceOption: { serviceNo: "95", buses: [] },
  selectedBus: { busId: "AV-095-01", busService: "95" },
  selectedArrival: null,
  selectedAlightingStop: null,
  routeStops: [],
  currentStopIndex: 0,
  journeyPhase: "WALKING_TO_STOP",
  journeySetupState: "WALKING_TO_STOP",
  journeyRequirements: {
    wheelchairRamp: false,
    busAudioIdentification: false,
    extendedDwellTime: false,
  },
  requestId: null,
  requestStatus: null,
  vehicleStatus: null,
};

it("migrates legacy journey continuity without inventing camera state", () => {
  const migrated = parsePersistedActiveJourney(JSON.stringify(legacyJourney));

  expect(migrated).toMatchObject({
    version: 2,
    visualGuidePhase: "WALKING_TO_STOP",
    walkingRoute: null,
    guidanceMode: "INACTIVE",
  });
});

it("preserves cached walking diagrams but downgrades no state implicitly", () => {
  const route = {
    mobilityMode: "WALKING",
    distanceMeters: 120,
    durationSeconds: 90,
    geometry: [],
    steps: [],
    accessibility: {
      confidence: "LIMITED_DATA",
      knownSteps: 0,
      surfaces: [],
      kerbDataAvailable: false,
      inclineDataAvailable: false,
      surfaceDataAvailable: false,
      widthDataAvailable: false,
      warnings: [],
    },
    attribution: { label: "Cached", url: "https://example.test" },
  };
  const restored = parsePersistedActiveJourney(
    JSON.stringify({
      ...legacyJourney,
      version: 2,
      visualGuidePhase: "WALKING_TO_STOP",
      walkingRoute: route,
      guidanceMode: "PREVIEW",
    }),
  );

  expect(restored?.walkingRoute).toEqual(route);
  expect(restored?.guidanceMode).toBe("PREVIEW");
});

it("rejects completed and malformed saved journeys", () => {
  expect(
    parsePersistedActiveJourney(
      JSON.stringify({ ...legacyJourney, journeyPhase: "COMPLETED" }),
    ),
  ).toBeNull();
  expect(parsePersistedActiveJourney("not-json")).toBeNull();
});
