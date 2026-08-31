export type RoutingCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteManeuverDirection =
  | "DEPART"
  | "STRAIGHT"
  | "SLIGHT_LEFT"
  | "LEFT"
  | "SHARP_LEFT"
  | "SLIGHT_RIGHT"
  | "RIGHT"
  | "SHARP_RIGHT"
  | "U_TURN"
  | "ROUNDABOUT"
  | "ARRIVE"
  | "UNKNOWN";

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds?: number;
  maneuver?: string;
  maneuverDirection?: RouteManeuverDirection;
  roadName?: string;
  coordinate?: RoutingCoordinate;
  geometryIndex?: number;
};

export type MobilityMode = "WALKING" | "WHEELCHAIR";

export type AccessibilityConfidence = "HIGH" | "MEDIUM" | "LIMITED_DATA";

export type AccessibilityWarningCode =
  | "KNOWN_STEPS"
  | "STEEP_INCLINE"
  | "ROUGH_SURFACE"
  | "NARROW_WIDTH"
  | "HIGH_KERB"
  | "UNKNOWN_KERB"
  | "UNKNOWN_INCLINE"
  | "UNKNOWN_SURFACE"
  | "INCOMPLETE_ACCESSIBILITY_DATA";

export type AccessibilityWarning = {
  code: AccessibilityWarningCode;
  message: string;
  severity: "INFO" | "WARNING" | "BARRIER";
  coordinate?: RoutingCoordinate;
};

export type RouteAccessibility = {
  confidence: AccessibilityConfidence;
  knownSteps: number;
  maximumInclinePercent?: number;
  surfaces: string[];
  kerbDataAvailable: boolean;
  inclineDataAvailable: boolean;
  surfaceDataAvailable: boolean;
  widthDataAvailable: boolean;
  warnings: AccessibilityWarning[];
};

export type AccessibleRoute = {
  mobilityMode: MobilityMode;
  distanceMeters: number;
  durationSeconds: number;
  geometry: RoutingCoordinate[];
  steps: RouteStep[];
  accessibility: RouteAccessibility;
  attribution: {
    label: string;
    url: string;
  };
};

export type WalkingRoute = AccessibleRoute;

export type RouteAccessibilityPreferences = {
  avoidSteps: true;
  avoidSteepSlopes: boolean;
  preferSmoothSurfaces: boolean;
};

export type RouteRequest = {
  origin: RoutingCoordinate;
  destination: RoutingCoordinate;
  destinationLabel?: string;
  mobilityMode: MobilityMode;
  accessibilityPreferences: RouteAccessibilityPreferences;
  signal?: AbortSignal;
};

export type WalkingRouteRequest = Omit<
  RouteRequest,
  "mobilityMode" | "accessibilityPreferences"
>;

export type RoutingProviderCapabilities = {
  walking: boolean;
  wheelchair: boolean;
  accessibilityWarnings: boolean;
};

export interface RoutingProvider {
  readonly id: string;
  readonly name: string;
  readonly attributionLabel: string;
  readonly attributionUrl: string;
  readonly capabilities: RoutingProviderCapabilities;
  getRoute(request: RouteRequest): Promise<AccessibleRoute>;
  getWalkingRoute(request: WalkingRouteRequest): Promise<WalkingRoute>;
}

type OsrmManeuver = {
  type?: string;
  modifier?: string;
  location?: [number, number];
};

type OsrmStep = {
  distance?: number;
  duration?: number;
  name?: string;
  maneuver?: OsrmManeuver;
};

type OsrmRouteResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      type?: string;
      coordinates?: Array<[number, number]>;
    };
    legs?: Array<{ steps?: OsrmStep[] }>;
  }>;
};

type CachedRoute = {
  expiresAt: number;
  route: WalkingRoute;
};

const defaultRoutingBaseUrl =
  "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const routeCacheDurationMs = 2 * 60 * 1000;
const minimumRequestIntervalMs = process.env.NODE_ENV === "test" ? 0 : 1_050;

export class RoutingProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NETWORK"
      | "NO_ROUTE"
      | "INVALID_RESPONSE"
      | "RATE_LIMITED"
      | "WHEELCHAIR_ROUTING_UNAVAILABLE"
      | "KNOWN_BARRIER",
  ) {
    super(message);
    this.name = "RoutingProviderError";
  }
}

function normalizedHeadingWord(modifier?: string) {
  switch (modifier) {
    case "straight":
      return "straight";
    case "slight left":
      return "slightly left";
    case "slight right":
      return "slightly right";
    case "sharp left":
      return "sharply left";
    case "sharp right":
      return "sharply right";
    case "uturn":
      return "around";
    default:
      return modifier ?? "ahead";
  }
}

function structuredManeuverDirection(
  type?: string,
  modifier?: string,
): RouteManeuverDirection {
  if (type === "arrive") return "ARRIVE";
  if (type === "depart") return "DEPART";
  if (type === "roundabout" || type === "rotary") return "ROUNDABOUT";
  if (modifier === "uturn") return "U_TURN";
  if (modifier === "slight left") return "SLIGHT_LEFT";
  if (modifier === "left") return "LEFT";
  if (modifier === "sharp left") return "SHARP_LEFT";
  if (modifier === "slight right") return "SLIGHT_RIGHT";
  if (modifier === "right") return "RIGHT";
  if (modifier === "sharp right") return "SHARP_RIGHT";
  if (
    modifier === "straight" ||
    type === "continue" ||
    type === "new name" ||
    type === "fork" ||
    type === "end of road"
  ) {
    return "STRAIGHT";
  }
  return "UNKNOWN";
}

function stepInstruction(
  step: OsrmStep,
  index: number,
  stepCount: number,
  destinationLabel: string,
) {
  const maneuver = step.maneuver ?? {};
  const road = step.name?.trim();
  const roadSuffix = road ? ` onto ${road}` : "";
  const direction = normalizedHeadingWord(maneuver.modifier);

  if (maneuver.type === "arrive" || index === stepCount - 1) {
    return `Arrive at ${destinationLabel}`;
  }
  if (maneuver.type === "depart") {
    return road
      ? `Head ${direction} on ${road}`
      : `Head ${direction} toward the bus stop`;
  }
  if (maneuver.type === "turn") {
    return maneuver.modifier === "uturn"
      ? `Make a U-turn${roadSuffix}`
      : `Turn ${direction}${roadSuffix}`;
  }
  if (maneuver.type === "continue" || maneuver.type === "new name") {
    return road ? `Continue on ${road}` : `Continue ${direction}`;
  }
  if (maneuver.type === "fork") {
    return `Keep ${direction}${roadSuffix}`;
  }
  if (maneuver.type === "end of road") {
    return `At the end of the road, turn ${direction}${roadSuffix}`;
  }
  if (maneuver.type === "roundabout" || maneuver.type === "rotary") {
    return road ? `Use the roundabout toward ${road}` : "Use the roundabout";
  }
  return road ? `Continue on ${road}` : "Continue toward the bus stop";
}

function isFiniteCoordinate(coordinate: RoutingCoordinate) {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude)
  );
}

function coordinateCachePart(coordinate: RoutingCoordinate) {
  // Four decimal places is an approximately 11 m bucket in Singapore.
  return `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;
}

function closestGeometryIndex(
  geometry: RoutingCoordinate[],
  coordinate: RoutingCoordinate,
) {
  let closestIndex = 0;
  let closestSquaredDistance = Number.POSITIVE_INFINITY;
  geometry.forEach((point, index) => {
    const latitudeDelta = point.latitude - coordinate.latitude;
    const longitudeDelta = point.longitude - coordinate.longitude;
    const squaredDistance =
      latitudeDelta * latitudeDelta + longitudeDelta * longitudeDelta;
    if (squaredDistance < closestSquaredDistance) {
      closestSquaredDistance = squaredDistance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function normalizeRoute(
  response: OsrmRouteResponse,
  destinationLabel: string,
): WalkingRoute {
  if (response.code !== "Ok") {
    throw new RoutingProviderError(
      response.message || "No walking route was found.",
      "NO_ROUTE",
    );
  }
  const route = response.routes?.[0];
  const rawGeometry = route?.geometry?.coordinates;
  if (
    !route ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration) ||
    !rawGeometry ||
    rawGeometry.length < 2
  ) {
    throw new RoutingProviderError(
      "The routing service returned an incomplete route.",
      "INVALID_RESPONSE",
    );
  }

  const geometry = rawGeometry.map(([longitude, latitude]) => ({
    latitude,
    longitude,
  }));
  if (!geometry.every(isFiniteCoordinate)) {
    throw new RoutingProviderError(
      "The routing service returned invalid route coordinates.",
      "INVALID_RESPONSE",
    );
  }

  const rawSteps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
  const steps = rawSteps.map((step, index) => {
    const maneuverCoordinate = step.maneuver?.location
      ? {
          latitude: step.maneuver.location[1],
          longitude: step.maneuver.location[0],
        }
      : undefined;
    return {
      instruction: stepInstruction(
        step,
        index,
        rawSteps.length,
        destinationLabel,
      ),
      distanceMeters: Math.max(0, Math.round(step.distance ?? 0)),
      durationSeconds: Number.isFinite(step.duration)
        ? Math.max(0, Math.round(step.duration ?? 0))
        : undefined,
      maneuver: [step.maneuver?.type, step.maneuver?.modifier]
        .filter(Boolean)
        .join("-"),
      maneuverDirection: structuredManeuverDirection(
        step.maneuver?.type,
        step.maneuver?.modifier,
      ),
      roadName: step.name?.trim() || undefined,
      coordinate: maneuverCoordinate,
      geometryIndex: maneuverCoordinate
        ? closestGeometryIndex(geometry, maneuverCoordinate)
        : undefined,
    } satisfies RouteStep;
  });

  return {
    mobilityMode: "WALKING",
    distanceMeters: Math.round(route.distance!),
    durationSeconds: Math.round(route.duration!),
    geometry,
    steps:
      steps.length > 0
        ? steps
        : [
            {
              instruction: `Walk to ${destinationLabel}`,
              distanceMeters: Math.round(route.distance!),
              durationSeconds: Math.round(route.duration!),
              maneuver: "continue",
              maneuverDirection: "STRAIGHT",
              geometryIndex: 0,
            },
            {
              instruction: `Arrive at ${destinationLabel}`,
              distanceMeters: 0,
              maneuver: "arrive",
              maneuverDirection: "ARRIVE",
              geometryIndex: geometry.length - 1,
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
      warnings: [
        {
          code: "INCOMPLETE_ACCESSIBILITY_DATA",
          message:
            "This standard walking route was not checked for wheelchair access.",
          severity: "INFO",
        },
      ],
    },
    attribution: {
      label: "Routing © OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
    },
  };
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(
          new DOMException("The route request was cancelled.", "AbortError"),
        );
      },
      { once: true },
    );
  });
}

export class OsrmWalkingRoutingProvider implements RoutingProvider {
  readonly id = "FOSSGIS_OSRM_FOOT";
  readonly name = "FOSSGIS walking router";
  readonly attributionLabel = "Routing © OpenStreetMap contributors";
  readonly attributionUrl = "https://www.openstreetmap.org/copyright";
  readonly capabilities: RoutingProviderCapabilities = {
    walking: true,
    wheelchair: false,
    accessibilityWarnings: false,
  };

  private readonly cache = new Map<string, CachedRoute>();
  private lastRequestStartedAt = 0;

  constructor(
    private readonly baseUrl = process.env.EXPO_PUBLIC_WALKING_ROUTING_URL?.trim() ||
      defaultRoutingBaseUrl,
  ) {}

  async getRoute(request: RouteRequest): Promise<AccessibleRoute> {
    if (request.mobilityMode === "WHEELCHAIR") {
      throw new RoutingProviderError(
        "This provider does not support wheelchair-aware routing.",
        "WHEELCHAIR_ROUTING_UNAVAILABLE",
      );
    }
    return this.getWalkingRoute(request);
  }

  async getWalkingRoute({
    origin,
    destination,
    destinationLabel = "the bus stop",
    signal,
  }: WalkingRouteRequest): Promise<WalkingRoute> {
    if (!isFiniteCoordinate(origin) || !isFiniteCoordinate(destination)) {
      throw new RoutingProviderError(
        "Walking directions need valid origin and destination coordinates.",
        "INVALID_RESPONSE",
      );
    }

    const cacheKey = `WALKING:${coordinateCachePart(origin)}:${coordinateCachePart(destination)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.route;
    }
    if (cached) {
      this.cache.delete(cacheKey);
    }

    await abortableDelay(
      minimumRequestIntervalMs - (Date.now() - this.lastRequestStartedAt),
      signal,
    );
    this.lastRequestStartedAt = Date.now();

    const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const query = new URLSearchParams({
      alternatives: "false",
      steps: "true",
      geometries: "geojson",
      overview: "full",
    });

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/${coordinates}?${query.toString()}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new RoutingProviderError(
        "The walking routing service could not be reached.",
        "NETWORK",
      );
    }

    if (!response.ok) {
      throw new RoutingProviderError(
        `The walking routing service returned ${response.status}.`,
        response.status === 429
          ? "RATE_LIMITED"
          : response.status === 404
            ? "NO_ROUTE"
            : "NETWORK",
      );
    }

    let body: OsrmRouteResponse;
    try {
      body = (await response.json()) as OsrmRouteResponse;
    } catch {
      throw new RoutingProviderError(
        "The walking routing service returned unreadable data.",
        "INVALID_RESPONSE",
      );
    }
    const route = normalizeRoute(body, destinationLabel);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + routeCacheDurationMs,
      route,
    });
    return route;
  }
}

export class PublicRoutingProvider extends OsrmWalkingRoutingProvider {}

export function createWalkingRoutingProvider(): RoutingProvider {
  return new PublicRoutingProvider();
}
