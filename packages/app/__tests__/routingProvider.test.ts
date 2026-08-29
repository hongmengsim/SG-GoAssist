import {
  OsrmWalkingRoutingProvider,
  RoutingProviderError,
  type WalkingRoute,
} from "../src/routing/RoutingProvider";
import { calculateWalkingRouteProgress } from "../src/routing/routeProgress";

const osrmResponse = {
  code: "Ok",
  routes: [
    {
      distance: 118.4,
      duration: 101.2,
      geometry: {
        type: "LineString",
        coordinates: [
          [103.7715, 1.2965],
          [103.7714, 1.2961],
          [103.7712, 1.2954],
          [103.77104, 1.29398],
        ],
      },
      legs: [
        {
          steps: [
            {
              distance: 45.2,
              duration: 38.5,
              name: "Kent Ridge Drive",
              maneuver: {
                type: "depart",
                modifier: "south",
                location: [103.7715, 1.2965],
              },
            },
            {
              distance: 73.2,
              duration: 62.7,
              name: "Kent Ridge Crescent",
              maneuver: {
                type: "turn",
                modifier: "slight left",
                location: [103.7712, 1.2954],
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
};

beforeEach(() => {
  jest.clearAllMocks();
});

it("sends longitude-latitude origin and destination and normalizes a real OSRM walking route", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(osrmResponse),
  });
  const provider = new OsrmWalkingRoutingProvider(
    "https://routing.example.test/routed-foot/route/v1/driving",
  );

  const route = await provider.getWalkingRoute({
    origin: { latitude: 1.2965, longitude: 103.7715 },
    destination: { latitude: 1.29398, longitude: 103.77104 },
    destinationLabel: "Kent Ridge Crescent",
  });

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining(
      "/103.7715,1.2965;103.77104,1.29398?alternatives=false&steps=true&geometries=geojson&overview=full",
    ),
    { signal: undefined },
  );
  expect(route.distanceMeters).toBe(118);
  expect(route.durationSeconds).toBe(101);
  expect(route.geometry).toEqual([
    { latitude: 1.2965, longitude: 103.7715 },
    { latitude: 1.2961, longitude: 103.7714 },
    { latitude: 1.2954, longitude: 103.7712 },
    { latitude: 1.29398, longitude: 103.77104 },
  ]);
  expect(route.steps.map((step) => step.instruction)).toEqual([
    "Head south on Kent Ridge Drive",
    "Turn slightly left onto Kent Ridge Crescent",
    "Arrive at Kent Ridge Crescent",
  ]);
});

it("briefly reuses a route for essentially the same origin and destination", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(osrmResponse),
  });
  const provider = new OsrmWalkingRoutingProvider("https://routing.test");
  const destination = { latitude: 1.29398, longitude: 103.77104 };

  const first = await provider.getWalkingRoute({
    origin: { latitude: 1.29651, longitude: 103.77151 },
    destination,
  });
  const second = await provider.getWalkingRoute({
    origin: { latitude: 1.29652, longitude: 103.77152 },
    destination,
  });

  expect(second).toBe(first);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("expires the short-lived in-memory route cache", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-08-29T00:00:00Z"));
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(osrmResponse),
  });
  const provider = new OsrmWalkingRoutingProvider("https://routing.test");
  const request = {
    origin: { latitude: 1.2965, longitude: 103.7715 },
    destination: { latitude: 1.29398, longitude: 103.77104 },
  };

  await provider.getWalkingRoute(request);
  jest.setSystemTime(new Date("2026-08-29T00:02:01Z"));
  await provider.getWalkingRoute(request);

  expect(global.fetch).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});

it("reports provider rate limiting separately", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 429,
  });
  const provider = new OsrmWalkingRoutingProvider("https://routing.test");

  await expect(
    provider.getWalkingRoute({
      origin: { latitude: 1.3, longitude: 103.77 },
      destination: { latitude: 1.31, longitude: 103.78 },
    }),
  ).rejects.toMatchObject<Partial<RoutingProviderError>>({
    code: "RATE_LIMITED",
  });
});

it("keeps provider failures independent with useful error categories", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ code: "NoRoute", message: "No route" }),
  });
  const noRouteProvider = new OsrmWalkingRoutingProvider("https://routing.test");

  await expect(
    noRouteProvider.getWalkingRoute({
      origin: { latitude: 1.3, longitude: 103.77 },
      destination: { latitude: 1.31, longitude: 103.78 },
    }),
  ).rejects.toMatchObject<Partial<RoutingProviderError>>({ code: "NO_ROUTE" });

  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  const offlineProvider = new OsrmWalkingRoutingProvider("https://routing.test");
  await expect(
    offlineProvider.getWalkingRoute({
      origin: { latitude: 1.3, longitude: 103.77 },
      destination: { latitude: 1.31, longitude: 103.78 },
    }),
  ).rejects.toMatchObject<Partial<RoutingProviderError>>({ code: "NETWORK" });
});

const progressRoute: WalkingRoute = {
  mobilityMode: "WALKING",
  distanceMeters: 120,
  durationSeconds: 120,
  geometry: [
    { latitude: 1.3, longitude: 103.77 },
    { latitude: 1.3004, longitude: 103.77 },
    { latitude: 1.3008, longitude: 103.77 },
    { latitude: 1.30108, longitude: 103.77 },
  ],
  steps: [
    {
      instruction: "Head north",
      distanceMeters: 80,
      maneuver: "depart-straight",
      geometryIndex: 0,
    },
    {
      instruction: "Turn left",
      distanceMeters: 40,
      maneuver: "turn-left",
      geometryIndex: 2,
    },
    {
      instruction: "Arrive",
      distanceMeters: 0,
      maneuver: "arrive",
      geometryIndex: 3,
    },
  ],
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
  attribution: {
    label: "Routing © OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
};

it("updates remaining distance and active step without requesting a new route", () => {
  const progress = calculateWalkingRouteProgress(progressRoute, {
    latitude: 1.30085,
    longitude: 103.77,
  });

  expect(progress.activeStepIndex).toBe(1);
  expect(progress.remainingDistanceMeters).toBeGreaterThan(20);
  expect(progress.remainingDistanceMeters).toBeLessThan(35);
  expect(progress.distanceToRouteMeters).toBeLessThanOrEqual(1);
  expect(global.fetch).not.toHaveBeenCalled();
});

it("does not regress progress when a noisy GPS sample snaps behind the user", () => {
  const forward = calculateWalkingRouteProgress(progressRoute, {
    latitude: 1.30085,
    longitude: 103.77,
  });
  const noisyBackward = calculateWalkingRouteProgress(
    progressRoute,
    { latitude: 1.3003, longitude: 103.77 },
    { accuracyMeters: 12, previousProgress: forward },
  );

  expect(noisyBackward.activeStepIndex).toBeGreaterThanOrEqual(
    forward.activeStepIndex,
  );
  expect(noisyBackward.completedDistanceMeters).toBeGreaterThanOrEqual(
    forward.completedDistanceMeters,
  );
});

it("poor accuracy suppresses an aggressive step transition", () => {
  const previous = calculateWalkingRouteProgress(progressRoute, {
    latitude: 1.3003,
    longitude: 103.77,
  });
  const poorAccuracy = calculateWalkingRouteProgress(
    progressRoute,
    { latitude: 1.3009, longitude: 103.77 },
    { accuracyMeters: 80, previousProgress: previous },
  );

  expect(poorAccuracy.activeStepIndex).toBe(previous.activeStepIndex);
});

it("reports off-route distance and reaches zero remaining distance at arrival", () => {
  const offRoute = calculateWalkingRouteProgress(progressRoute, {
    latitude: 1.3005,
    longitude: 103.771,
  });
  const arrived = calculateWalkingRouteProgress(progressRoute, {
    latitude: 1.30108,
    longitude: 103.77,
  });

  expect(offRoute.distanceToRouteMeters).toBeGreaterThan(45);
  expect(arrived.remainingDistanceMeters).toBe(0);
  expect(arrived.remainingDurationSeconds).toBe(0);
});
