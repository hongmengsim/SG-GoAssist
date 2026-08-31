import {
  OsrmWalkingRoutingProvider,
  RoutingProviderError,
  type AccessibilityWarning,
  type AccessibleRoute,
  type RouteAccessibility,
  type RouteAccessibilityPreferences,
  type RouteManeuverDirection,
  type RouteRequest,
  type RouteStep,
  type RoutingCoordinate,
  type RoutingProvider,
  type WalkingRoute,
  type WalkingRouteRequest,
} from "./RoutingProvider";

const valhallaManeuverDirections: Record<number, RouteManeuverDirection> = {
  1: "DEPART",
  2: "DEPART",
  3: "DEPART",
  4: "ARRIVE",
  5: "ARRIVE",
  6: "ARRIVE",
  8: "STRAIGHT",
  9: "SLIGHT_RIGHT",
  10: "RIGHT",
  11: "SHARP_RIGHT",
  12: "U_TURN",
  13: "U_TURN",
  14: "SHARP_LEFT",
  15: "LEFT",
  16: "SLIGHT_LEFT",
  17: "STRAIGHT",
  18: "RIGHT",
  19: "LEFT",
  20: "RIGHT",
  21: "LEFT",
  22: "STRAIGHT",
  23: "SLIGHT_RIGHT",
  24: "SLIGHT_LEFT",
  26: "ROUNDABOUT",
  27: "ROUNDABOUT",
};

const orsManeuverDirections: Record<number, RouteManeuverDirection> = {
  0: "LEFT",
  1: "RIGHT",
  2: "SHARP_LEFT",
  3: "SHARP_RIGHT",
  4: "SLIGHT_LEFT",
  5: "SLIGHT_RIGHT",
  6: "STRAIGHT",
  7: "ROUNDABOUT",
  8: "ROUNDABOUT",
  9: "U_TURN",
  10: "ARRIVE",
  11: "DEPART",
  12: "SLIGHT_LEFT",
  13: "SLIGHT_RIGHT",
};

type AccessibilityFacts = {
  knownSteps?: number;
  maximumInclinePercent?: number;
  surfaces?: string[];
  maximumKerbMillimetres?: number;
  minimumWidthMetres?: number;
};

export function assessWheelchairAccessibility(
  facts: AccessibilityFacts,
  preferences: RouteAccessibilityPreferences,
): { accessibility: RouteAccessibility; hasKnownBarrier: boolean } {
  const warnings: AccessibilityWarning[] = [];
  const knownSteps = facts.knownSteps ?? 0;
  let hasKnownBarrier = false;

  if (knownSteps > 0) {
    hasKnownBarrier = true;
    warnings.push({
      code: "KNOWN_STEPS",
      message: `${knownSteps} mapped step${knownSteps === 1 ? "" : "s"} found on this route.`,
      severity: "BARRIER",
    });
  }
  if (
    preferences.avoidSteepSlopes &&
    facts.maximumInclinePercent !== undefined &&
    facts.maximumInclinePercent > 6
  ) {
    hasKnownBarrier = true;
    warnings.push({
      code: "STEEP_INCLINE",
      message: `A mapped incline reaches about ${Math.round(facts.maximumInclinePercent)}%.`,
      severity: "BARRIER",
    });
  }
  const roughSurfaces = (facts.surfaces ?? []).filter((surface) =>
    /gravel|ground|grass|sand|cobblestone|unpaved/i.test(surface),
  );
  if (preferences.preferSmoothSurfaces && roughSurfaces.length > 0) {
    warnings.push({
      code: "ROUGH_SURFACE",
      message: `Mapped surface may be difficult: ${roughSurfaces.join(", ")}.`,
      severity: "WARNING",
    });
  }
  if (
    facts.maximumKerbMillimetres !== undefined &&
    facts.maximumKerbMillimetres > 60
  ) {
    hasKnownBarrier = true;
    warnings.push({
      code: "HIGH_KERB",
      message: `A mapped kerb is about ${Math.round(facts.maximumKerbMillimetres)} mm high.`,
      severity: "BARRIER",
    });
  }
  if (
    facts.minimumWidthMetres !== undefined &&
    facts.minimumWidthMetres < 0.9
  ) {
    hasKnownBarrier = true;
    warnings.push({
      code: "NARROW_WIDTH",
      message: `A mapped section is about ${facts.minimumWidthMetres.toFixed(1)} m wide.`,
      severity: "BARRIER",
    });
  }

  const knownDataPoints = [
    facts.maximumInclinePercent,
    facts.surfaces,
    facts.maximumKerbMillimetres,
    facts.minimumWidthMetres,
  ].filter((value) => value !== undefined).length;
  const confidence =
    knownDataPoints === 4
      ? "HIGH"
      : knownDataPoints >= 2
        ? "MEDIUM"
        : "LIMITED_DATA";

  if (facts.maximumKerbMillimetres === undefined) {
    warnings.push({
      code: "UNKNOWN_KERB",
      message: "Kerb-height data is incomplete.",
      severity: "INFO",
    });
  }
  if (facts.maximumInclinePercent === undefined) {
    warnings.push({
      code: "UNKNOWN_INCLINE",
      message: "Incline data is incomplete.",
      severity: "INFO",
    });
  }
  if (facts.surfaces === undefined) {
    warnings.push({
      code: "UNKNOWN_SURFACE",
      message: "Surface data is incomplete.",
      severity: "INFO",
    });
  }
  if (confidence === "LIMITED_DATA") {
    warnings.push({
      code: "INCOMPLETE_ACCESSIBILITY_DATA",
      message:
        "Accessibility data is incomplete. Check conditions before travelling.",
      severity: "INFO",
    });
  }

  return {
    hasKnownBarrier,
    accessibility: {
      confidence,
      knownSteps,
      maximumInclinePercent: facts.maximumInclinePercent,
      surfaces: facts.surfaces ?? [],
      kerbDataAvailable: facts.maximumKerbMillimetres !== undefined,
      inclineDataAvailable: facts.maximumInclinePercent !== undefined,
      surfaceDataAvailable: facts.surfaces !== undefined,
      widthDataAvailable: facts.minimumWidthMetres !== undefined,
      warnings,
    },
  };
}

function validCoordinate(coordinate: RoutingCoordinate) {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude)
  );
}

function coordinateKey(coordinate: RoutingCoordinate) {
  return `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;
}

function requestKey(request: RouteRequest) {
  const preferences = request.accessibilityPreferences;
  return [
    request.mobilityMode,
    coordinateKey(request.origin),
    coordinateKey(request.destination),
    preferences.avoidSteps,
    preferences.avoidSteepSlopes,
    preferences.preferSmoothSurfaces,
  ].join(":");
}

function mapRequestError(error: unknown, serviceName: string): never {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw error;
  }
  if (error instanceof RoutingProviderError) {
    throw error;
  }
  throw new RoutingProviderError(
    `${serviceName} could not be reached.`,
    "NETWORK",
  );
}

type ValhallaResponse = {
  error?: string;
  trip?: {
    status?: number;
    status_message?: string;
    summary?: { length?: number; time?: number };
    legs?: Array<{
      shape?: string;
      maneuvers?: Array<{
        instruction?: string;
        length?: number;
        time?: number;
        type?: number;
        begin_shape_index?: number;
      }>;
    }>;
  };
};

function decodePolyline6(encoded: string): RoutingCoordinate[] {
  const coordinates: RoutingCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ latitude: latitude / 1e6, longitude: longitude / 1e6 });
  }
  return coordinates;
}

export class ValhallaWheelchairRoutingProvider implements RoutingProvider {
  readonly id = "FOSSGIS_VALHALLA_WHEELCHAIR";
  readonly name = "Valhalla wheelchair router";
  readonly attributionLabel = "Routing © OpenStreetMap contributors";
  readonly attributionUrl = "https://www.openstreetmap.org/copyright";
  readonly capabilities = {
    walking: false,
    wheelchair: true,
    accessibilityWarnings: false,
  } as const;

  private readonly cache = new Map<
    string,
    { expiresAt: number; route: AccessibleRoute }
  >();

  constructor(
    private readonly baseUrl = process.env.EXPO_PUBLIC_WHEELCHAIR_ROUTING_URL?.trim() ||
      "https://valhalla1.openstreetmap.de/route",
  ) {}

  async getWalkingRoute(_request: WalkingRouteRequest): Promise<WalkingRoute> {
    throw new RoutingProviderError(
      "This provider is reserved for wheelchair-aware routes.",
      "NO_ROUTE",
    );
  }

  async getRoute(request: RouteRequest): Promise<AccessibleRoute> {
    if (request.mobilityMode !== "WHEELCHAIR") {
      return this.getWalkingRoute(request);
    }
    if (
      !validCoordinate(request.origin) ||
      !validCoordinate(request.destination)
    ) {
      throw new RoutingProviderError(
        "Wheelchair directions need valid origin and destination coordinates.",
        "INVALID_RESPONSE",
      );
    }
    const cacheKey = requestKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.route;

    const payload = {
      locations: [
        { lat: request.origin.latitude, lon: request.origin.longitude },
        {
          lat: request.destination.latitude,
          lon: request.destination.longitude,
        },
      ],
      costing: "pedestrian",
      costing_options: {
        pedestrian: {
          transport_type: "wheelchair",
          step_penalty: 3600,
          max_grade: request.accessibilityPreferences.avoidSteepSlopes ? 6 : 12,
          use_hills: request.accessibilityPreferences.avoidSteepSlopes
            ? 1
            : 0.5,
        },
      },
      units: "kilometers",
      language: "en-US",
    };

    let response: Response;
    try {
      const query = new URLSearchParams({ json: JSON.stringify(payload) });
      response = await fetch(`${this.baseUrl}?${query.toString()}`, {
        signal: request.signal,
      });
    } catch (error) {
      return mapRequestError(error, "The wheelchair routing service");
    }
    if (!response.ok) {
      throw new RoutingProviderError(
        response.status === 429
          ? "The wheelchair routing service is busy."
          : "No wheelchair-aware route was found.",
        response.status === 429 ? "RATE_LIMITED" : "NO_ROUTE",
      );
    }
    let body: ValhallaResponse;
    try {
      body = (await response.json()) as ValhallaResponse;
    } catch {
      throw new RoutingProviderError(
        "The wheelchair routing service returned unreadable data.",
        "INVALID_RESPONSE",
      );
    }
    const legs = body.trip?.legs ?? [];
    const geometry: RoutingCoordinate[] = [];
    const steps: RouteStep[] = [];
    legs.forEach((leg) => {
      const legGeometry = leg.shape ? decodePolyline6(leg.shape) : [];
      const geometryOffset = Math.max(0, geometry.length - 1);
      geometry.push(
        ...(geometry.length > 0 ? legGeometry.slice(1) : legGeometry),
      );
      (leg.maneuvers ?? []).forEach((maneuver) => {
        const geometryIndex = Math.min(
          geometry.length - 1,
          geometryOffset + (maneuver.begin_shape_index ?? 0),
        );
        const instruction =
          maneuver.instruction?.trim() || "Continue along the route";
        steps.push({
          instruction: instruction.replace(/^Walk\b/i, "Continue"),
          distanceMeters: Math.max(
            0,
            Math.round((maneuver.length ?? 0) * 1000),
          ),
          durationSeconds: Math.max(0, Math.round(maneuver.time ?? 0)),
          maneuver: String(maneuver.type ?? "continue"),
          maneuverDirection:
            maneuver.type === undefined
              ? "UNKNOWN"
              : (valhallaManeuverDirections[maneuver.type] ?? "UNKNOWN"),
          coordinate: geometry[geometryIndex],
          geometryIndex,
        });
      });
    });
    const knownSteps = steps.filter((step) =>
      /\bstairs?|\bsteps?\b/i.test(step.instruction),
    ).length;
    const summary = body.trip?.summary;
    if (body.trip?.status !== 0 || geometry.length < 2 || !summary) {
      throw new RoutingProviderError(
        body.trip?.status_message ||
          body.error ||
          "No wheelchair-aware route was found.",
        body.trip?.status === 442 ? "NO_ROUTE" : "INVALID_RESPONSE",
      );
    }
    const assessment = assessWheelchairAccessibility(
      { knownSteps },
      request.accessibilityPreferences,
    );
    if (assessment.hasKnownBarrier) {
      throw new RoutingProviderError(
        "The route contains a known wheelchair barrier.",
        "KNOWN_BARRIER",
      );
    }
    const route: AccessibleRoute = {
      mobilityMode: "WHEELCHAIR",
      distanceMeters: Math.round((summary.length ?? 0) * 1000),
      durationSeconds: Math.round(summary.time ?? 0),
      geometry,
      steps,
      accessibility: assessment.accessibility,
      attribution: {
        label: this.attributionLabel,
        url: this.attributionUrl,
      },
    };
    this.cache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, route });
    return route;
  }
}

type OrsExtra = { values?: Array<[number, number, number]> };
type OrsResponse = {
  features?: Array<{
    geometry?: { coordinates?: Array<[number, number]> };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: Array<{
        steps?: Array<{
          instruction?: string;
          distance?: number;
          duration?: number;
          type?: number;
          way_points?: [number, number];
        }>;
      }>;
      extras?: Record<string, OrsExtra>;
    };
  }>;
};

const orsSurfaceNames: Record<number, string> = {
  0: "unknown",
  1: "paved",
  2: "unpaved",
  3: "asphalt",
  4: "concrete",
  5: "cobblestone",
  6: "metal",
  7: "wood",
  8: "compacted gravel",
  9: "fine gravel",
  10: "gravel",
  11: "dirt",
  12: "ground",
  13: "ice",
  14: "paving stones",
  15: "sand",
  16: "woodchips",
  17: "grass",
};

function maximumOrsIncline(
  values: Array<[number, number, number]> | undefined,
) {
  const representativePercent: Record<number, number> = {
    0: 0,
    1: 2,
    2: 5,
    3: 8,
    4: 13,
    5: 17,
    [-1]: 2,
    [-2]: 5,
    [-3]: 8,
    [-4]: 13,
    [-5]: 17,
  };
  if (!values) return undefined;
  return Math.max(
    0,
    ...values.map(([, , value]) => representativePercent[value] ?? 0),
  );
}

export class OpenRouteServiceWheelchairProvider implements RoutingProvider {
  readonly id = "OPENROUTESERVICE_WHEELCHAIR";
  readonly name = "openrouteservice wheelchair router";
  readonly attributionLabel =
    "Routing © openrouteservice / OpenStreetMap contributors";
  readonly attributionUrl = "https://openrouteservice.org/terms-of-service/";
  readonly capabilities = {
    walking: false,
    wheelchair: true,
    accessibilityWarnings: true,
  } as const;
  private readonly cache = new Map<
    string,
    { expiresAt: number; route: AccessibleRoute }
  >();

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openrouteservice.org/v2/directions/wheelchair/geojson",
  ) {}

  async getWalkingRoute(_request: WalkingRouteRequest): Promise<WalkingRoute> {
    throw new RoutingProviderError(
      "This provider is reserved for wheelchair-aware routes.",
      "NO_ROUTE",
    );
  }

  async getRoute(request: RouteRequest): Promise<AccessibleRoute> {
    if (request.mobilityMode !== "WHEELCHAIR")
      return this.getWalkingRoute(request);
    const cacheKey = requestKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.route;

    const restrictions: Record<string, number | string> = {
      maximum_sloped_kerb: 0.06,
      minimum_width: 0.9,
    };
    if (request.accessibilityPreferences.avoidSteepSlopes)
      restrictions.maximum_incline = 6;
    if (request.accessibilityPreferences.preferSmoothSurfaces) {
      restrictions.surface_type = "cobblestone:flattened";
      restrictions.track_type = "grade1";
      restrictions.smoothness_type = "good";
    }
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [request.origin.longitude, request.origin.latitude],
            [request.destination.longitude, request.destination.latitude],
          ],
          instructions: true,
          extra_info: ["surface", "steepness", "waytype"],
          options: {
            avoid_features: ["steps"],
            profile_params: { restrictions },
          },
        }),
        signal: request.signal,
      });
    } catch (error) {
      return mapRequestError(error, "The wheelchair routing service");
    }
    if (!response.ok) {
      throw new RoutingProviderError(
        response.status === 429
          ? "The wheelchair routing service is busy."
          : "No wheelchair-aware route was found.",
        response.status === 429 ? "RATE_LIMITED" : "NO_ROUTE",
      );
    }
    const body = (await response.json()) as OrsResponse;
    const feature = body.features?.[0];
    const coordinates = feature?.geometry?.coordinates ?? [];
    const geometry = coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));
    const summary = feature?.properties?.summary;
    if (!summary || geometry.length < 2 || !geometry.every(validCoordinate)) {
      throw new RoutingProviderError(
        "The wheelchair routing service returned an incomplete route.",
        "INVALID_RESPONSE",
      );
    }
    const extras = feature?.properties?.extras;
    const surfaces = extras?.surface?.values
      ? [
          ...new Set(
            extras.surface.values.map(
              ([, , value]) => orsSurfaceNames[value] ?? "unknown",
            ),
          ),
        ]
      : undefined;
    const knownSteps =
      extras?.waytype?.values?.filter(([, , value]) => value === 8).length ?? 0;
    const assessment = assessWheelchairAccessibility(
      {
        knownSteps,
        maximumInclinePercent: maximumOrsIncline(extras?.steepness?.values),
        surfaces,
      },
      request.accessibilityPreferences,
    );
    const roughSurfaceRange = extras?.surface?.values?.find(([, , value]) =>
      /gravel|ground|grass|sand|cobblestone|unpaved/i.test(
        orsSurfaceNames[value] ?? "",
      ),
    );
    if (roughSurfaceRange) {
      assessment.accessibility.warnings = assessment.accessibility.warnings.map(
        (warning) =>
          warning.code === "ROUGH_SURFACE"
            ? { ...warning, coordinate: geometry[roughSurfaceRange[0]] }
            : warning,
      );
    }
    if (assessment.hasKnownBarrier) {
      throw new RoutingProviderError(
        "The route contains a known wheelchair barrier.",
        "KNOWN_BARRIER",
      );
    }
    const rawSteps =
      feature?.properties?.segments?.flatMap(
        (segment) => segment.steps ?? [],
      ) ?? [];
    const steps: RouteStep[] = rawSteps.map((step) => {
      const geometryIndex = step.way_points?.[0] ?? 0;
      return {
        instruction:
          step.instruction?.replace(/^Walk\b/i, "Continue") ||
          "Continue along the route",
        distanceMeters: Math.max(0, Math.round(step.distance ?? 0)),
        durationSeconds: Math.max(0, Math.round(step.duration ?? 0)),
        maneuver: String(step.type ?? "continue"),
        maneuverDirection:
          step.type === undefined
            ? "UNKNOWN"
            : (orsManeuverDirections[step.type] ?? "UNKNOWN"),
        geometryIndex,
        coordinate: geometry[geometryIndex],
      };
    });
    const route: AccessibleRoute = {
      mobilityMode: "WHEELCHAIR",
      distanceMeters: Math.round(summary.distance ?? 0),
      durationSeconds: Math.round(summary.duration ?? 0),
      geometry,
      steps,
      accessibility: assessment.accessibility,
      attribution: {
        label: this.attributionLabel,
        url: this.attributionUrl,
      },
    };
    this.cache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, route });
    return route;
  }
}

export class AccessibleRoutingProvider implements RoutingProvider {
  readonly id = "ACCESSIBLE_ROUTING";
  readonly name = "OpenStreetMap walking and wheelchair routing";
  readonly attributionLabel = "Routing © OpenStreetMap contributors";
  readonly attributionUrl = "https://www.openstreetmap.org/copyright";
  readonly capabilities;

  constructor(
    private readonly walkingProvider: RoutingProvider = new OsrmWalkingRoutingProvider(),
    private readonly wheelchairProvider: RoutingProvider = process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY?.trim()
      ? new OpenRouteServiceWheelchairProvider(
          process.env.EXPO_PUBLIC_OPENROUTESERVICE_API_KEY.trim(),
        )
      : new ValhallaWheelchairRoutingProvider(),
  ) {
    this.capabilities = {
      walking: walkingProvider.capabilities.walking,
      wheelchair: wheelchairProvider.capabilities.wheelchair,
      accessibilityWarnings:
        wheelchairProvider.capabilities.accessibilityWarnings,
    };
  }

  getWalkingRoute(request: WalkingRouteRequest) {
    return this.walkingProvider.getWalkingRoute(request);
  }

  getRoute(request: RouteRequest) {
    return request.mobilityMode === "WHEELCHAIR"
      ? this.wheelchairProvider.getRoute(request)
      : this.walkingProvider.getRoute(request);
  }
}

export function createRoutingProvider(): RoutingProvider {
  return new AccessibleRoutingProvider();
}
