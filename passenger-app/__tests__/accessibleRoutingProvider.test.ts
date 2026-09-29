import {
  OpenRouteServiceWheelchairProvider,
  ValhallaWheelchairRoutingProvider,
  assessWheelchairAccessibility,
} from "../src/routing/AccessibleRoutingProvider";
import {
  OsrmWalkingRoutingProvider,
  type RouteAccessibilityPreferences,
} from "../src/routing/RoutingProvider";

const preferences: RouteAccessibilityPreferences = {
  avoidSteps: true,
  avoidSteepSlopes: true,
  preferSmoothSurfaces: true,
};
const request = {
  origin: { latitude: 1.2965, longitude: 103.7715 },
  destination: { latitude: 1.29398, longitude: 103.77104 },
  destinationLabel: "Kent Ridge Crescent",
  mobilityMode: "WHEELCHAIR" as const,
  accessibilityPreferences: preferences,
};

function encodePolyline6(points: Array<[number, number]>) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = "";
  const encodeValue = (value: number) => {
    let shifted = value < 0 ? ~(value << 1) : value << 1;
    let result = "";
    while (shifted >= 0x20) {
      result += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
      shifted >>= 5;
    }
    return result + String.fromCharCode(shifted + 63);
  };
  points.forEach(([latitude, longitude]) => {
    const nextLatitude = Math.round(latitude * 1e6);
    const nextLongitude = Math.round(longitude * 1e6);
    encoded += encodeValue(nextLatitude - previousLatitude);
    encoded += encodeValue(nextLongitude - previousLongitude);
    previousLatitude = nextLatitude;
    previousLongitude = nextLongitude;
  });
  return encoded;
}

beforeEach(() => jest.clearAllMocks());

it("classifies a fully mapped step-free route with lowered kerbs as high confidence", () => {
  const result = assessWheelchairAccessibility(
    {
      knownSteps: 0,
      maximumInclinePercent: 3,
      surfaces: ["asphalt", "paving stones"],
      maximumKerbMillimetres: 20,
      minimumWidthMetres: 1.4,
    },
    preferences,
  );

  expect(result.hasKnownBarrier).toBe(false);
  expect(result.accessibility).toMatchObject({
    confidence: "HIGH",
    knownSteps: 0,
    kerbDataAvailable: true,
    inclineDataAvailable: true,
    surfaceDataAvailable: true,
    widthDataAvailable: true,
  });
});

it("rejects known steps and steep slopes while treating missing tags as limited data", () => {
  expect(
    assessWheelchairAccessibility({ knownSteps: 1 }, preferences),
  ).toMatchObject({ hasKnownBarrier: true });
  expect(
    assessWheelchairAccessibility(
      { knownSteps: 0, maximumInclinePercent: 9 },
      preferences,
    ),
  ).toMatchObject({ hasKnownBarrier: true });

  const missing = assessWheelchairAccessibility({ knownSteps: 0 }, preferences);
  expect(missing.hasKnownBarrier).toBe(false);
  expect(missing.accessibility.confidence).toBe("LIMITED_DATA");
  expect(missing.accessibility.warnings.map((warning) => warning.code)).toEqual(
    expect.arrayContaining([
      "UNKNOWN_KERB",
      "UNKNOWN_INCLINE",
      "UNKNOWN_SURFACE",
      "INCOMPLETE_ACCESSIBILITY_DATA",
    ]),
  );
});

it("sends a real Valhalla wheelchair transport mode and preserves preference-sensitive cache keys", async () => {
  const shape = encodePolyline6([
    [1.2965, 103.7715],
    [1.29398, 103.77104],
  ]);
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        trip: {
          status: 0,
          summary: { length: 0.34, time: 310 },
          legs: [
            {
              shape,
              maneuvers: [
                {
                  instruction: "Walk south on the path",
                  length: 0.34,
                  time: 310,
                  type: 1,
                  begin_shape_index: 0,
                },
              ],
            },
          ],
        },
      }),
  });
  const provider = new ValhallaWheelchairRoutingProvider(
    "https://routing.example.test/route",
  );

  const route = await provider.getRoute(request);
  await provider.getRoute({
    ...request,
    accessibilityPreferences: { ...preferences, avoidSteepSlopes: false },
  });

  const firstUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  const payload = JSON.parse(new URL(firstUrl).searchParams.get("json")!);
  expect(payload.costing).toBe("pedestrian");
  expect(payload.costing_options.pedestrian).toMatchObject({
    transport_type: "wheelchair",
    step_penalty: 3600,
    max_grade: 6,
  });
  expect(route).toMatchObject({
    mobilityMode: "WHEELCHAIR",
    distanceMeters: 340,
    accessibility: { confidence: "LIMITED_DATA", knownSteps: 0 },
  });
  expect(route.steps[0].instruction).toBe("Continue south on the path");
  expect(route.steps[0].maneuverDirection).toBe("DEPART");
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it("uses the openrouteservice wheelchair profile restrictions and rejects mapped steps", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        features: [
          {
            geometry: {
              coordinates: [
                [103.7715, 1.2965],
                [103.77104, 1.29398],
              ],
            },
            properties: {
              summary: { distance: 330, duration: 300 },
              segments: { steps: [] },
              extras: {
                waytype: { values: [[0, 1, 8]] },
                surface: { values: [[0, 1, 3]] },
                steepness: { values: [[0, 1, 1]] },
              },
            },
          },
        ],
      }),
  });
  const provider = new OpenRouteServiceWheelchairProvider(
    "test-key",
    "https://api.example.test/v2/directions/wheelchair/geojson",
  );

  await expect(provider.getRoute(request)).rejects.toMatchObject({
    code: "KNOWN_BARRIER",
  });
  const init = (global.fetch as jest.Mock).mock.calls[0][1];
  const body = JSON.parse(init.body);
  expect(body.options).toEqual({
    avoid_features: ["steps"],
    profile_params: {
      restrictions: {
        maximum_sloped_kerb: 0.06,
        minimum_width: 0.9,
        maximum_incline: 6,
        surface_type: "cobblestone:flattened",
        track_type: "grade1",
        smoothness_type: "good",
      },
    },
  });
});

it("never relabels an OSRM walking route as wheelchair accessible", async () => {
  const provider = new OsrmWalkingRoutingProvider(
    "https://routing.example.test",
  );
  await expect(provider.getRoute(request)).rejects.toMatchObject({
    code: "WHEELCHAIR_ROUTING_UNAVAILABLE",
  });
  expect(global.fetch).not.toHaveBeenCalled();
});
