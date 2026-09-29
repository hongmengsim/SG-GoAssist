import fs from "node:fs";
import path from "node:path";
import type {
  BusRoutePattern,
  BusServiceRouteOption,
  BusStop,
  NearbyBusStop,
  RouteStop,
} from "@buspass/shared";
import type { BusStopDatasetMetadata, BusStopDatasetSnapshot } from "./types";

export const SINGAPORE_QUERY_BOUNDS = {
  north: 1.5,
  south: 1.1,
  east: 104.15,
  west: 103.5,
} as const;

export const DEFAULT_BUS_STOP_SNAPSHOT_PATH = path.resolve(
  __dirname,
  "../../data/bus-stops.sg.json",
);

export class BusStopDataUnavailableError extends Error {
  constructor(message = "Regional bus-stop data is unavailable") {
    super(message);
    this.name = "BusStopDataUnavailableError";
  }
}

export class BusStopRepository {
  private readonly stops: BusStop[];
  private readonly byCode = new Map<string, BusStop>();
  private readonly byService = new Map<string, BusStop[]>();
  private readonly searchDocuments = new Map<string, string>();
  private readonly routesByStopAndService = new Map<
    string,
    BusServiceRouteOption[]
  >();

  constructor(
    stops: BusStop[],
    readonly metadata?: BusStopDatasetMetadata,
    routePatterns: BusRoutePattern[] = [],
    private readonly initializationError: Error | null = null,
  ) {
    this.stops = stops.map((stop) => ({
      ...stop,
      services: [...stop.services],
    }));
    for (const stop of this.stops) {
      this.byCode.set(stop.busStopCode, stop);
      this.searchDocuments.set(
        stop.busStopCode,
        normalizeSearchText(
          [
            stop.busStopCode,
            stop.description,
            stop.roadName,
            ...stop.services,
          ].join(" "),
        ),
      );
      for (const service of stop.services) {
        const serviceStops =
          this.byService.get(normalizeSearchText(service)) ?? [];
        serviceStops.push(stop);
        this.byService.set(normalizeSearchText(service), serviceStops);
      }
    }

    for (const pattern of routePatterns) {
      pattern.stopCodes.forEach((busStopCode, patternIndex) => {
        const boardingStop = this.byCode.get(busStopCode);
        if (!boardingStop) return;

        const downstreamStops = pattern.stopCodes
          .slice(patternIndex)
          .map((stopCode) => this.byCode.get(stopCode))
          .filter((stop): stop is BusStop => Boolean(stop))
          .map<RouteStop>((stop, sequence) => ({
            ...stop,
            sequence,
          }));
        const destination = downstreamStops.at(-1);
        if (!destination) return;

        const key = stopServiceKey(busStopCode, pattern.serviceNo);
        const options = this.routesByStopAndService.get(key) ?? [];
        options.push({
          serviceNo: pattern.serviceNo,
          direction: pattern.direction,
          destination: {
            ...destination,
            services: [...(destination.services ?? [])],
          },
          stops: downstreamStops,
        });
        this.routesByStopAndService.set(key, options);
      });
    }
  }

  get size(): number {
    return this.stops.length;
  }

  get available(): boolean {
    return this.initializationError === null;
  }

  get(busStopCode: string): BusStop | undefined {
    this.assertAvailable();
    return this.byCode.get(busStopCode);
  }

  routesForStopAndService(
    busStopCode: string,
    serviceNo: string,
  ): BusServiceRouteOption[] {
    this.assertAvailable();
    return (
      this.routesByStopAndService.get(stopServiceKey(busStopCode, serviceNo)) ??
      []
    ).map((route) => ({
      ...route,
      destination: {
        ...route.destination,
        services: [...route.destination.services],
      },
      stops: route.stops.map((stop) => ({
        ...stop,
        services: stop.services ? [...stop.services] : undefined,
      })),
    }));
  }

  nearby(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    limit: number,
  ): NearbyBusStop[] {
    this.assertAvailable();
    return this.stops
      .map((stop) => ({
        ...stop,
        distanceMeters: Math.round(
          haversineDistanceMeters(
            latitude,
            longitude,
            stop.latitude,
            stop.longitude,
          ),
        ),
      }))
      .filter((stop) => stop.distanceMeters <= radiusMeters)
      .sort(
        (a, b) =>
          a.distanceMeters - b.distanceMeters ||
          a.busStopCode.localeCompare(b.busStopCode),
      )
      .slice(0, limit);
  }

  bounds(
    bounds: { north: number; south: number; east: number; west: number },
    limit: number,
  ): { stops: BusStop[]; total: number; truncated: boolean } {
    this.assertAvailable();
    const matches = this.stops.filter(
      (stop) =>
        stop.latitude <= bounds.north &&
        stop.latitude >= bounds.south &&
        stop.longitude <= bounds.east &&
        stop.longitude >= bounds.west,
    );
    return {
      stops: matches.slice(0, limit),
      total: matches.length,
      truncated: matches.length > limit,
    };
  }

  search(query: string, limit: number): BusStop[] {
    this.assertAvailable();
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const exactServiceStops = this.byService.get(normalizedQuery) ?? [];
    const candidates = new Map<string, { stop: BusStop; score: number }>();
    for (const stop of exactServiceStops) {
      candidates.set(stop.busStopCode, { stop, score: 2 });
    }
    for (const stop of this.stops) {
      const description = normalizeSearchText(stop.description);
      const roadName = normalizeSearchText(stop.roadName);
      const document = this.searchDocuments.get(stop.busStopCode) ?? "";
      let score = Number.POSITIVE_INFINITY;
      if (normalizeSearchText(stop.busStopCode) === normalizedQuery) score = 0;
      else if (description === normalizedQuery) score = 1;
      else if (description.startsWith(normalizedQuery)) score = 2;
      else if (description.includes(normalizedQuery)) score = 3;
      else if (roadName.startsWith(normalizedQuery)) score = 5;
      else if (roadName.includes(normalizedQuery)) score = 6;
      else if (document.includes(normalizedQuery)) score = 7;
      if (!Number.isFinite(score)) continue;
      const current = candidates.get(stop.busStopCode);
      if (!current || score < current.score)
        candidates.set(stop.busStopCode, { stop, score });
    }

    return [...candidates.values()]
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.stop.description.localeCompare(b.stop.description) ||
          a.stop.busStopCode.localeCompare(b.stop.busStopCode),
      )
      .slice(0, limit)
      .map(({ stop }) => stop);
  }

  private assertAvailable(): void {
    if (this.initializationError) {
      throw new BusStopDataUnavailableError();
    }
  }
}

export function haversineDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stopServiceKey(busStopCode: string, serviceNo: string): string {
  return `${busStopCode}\u0000${normalizeSearchText(serviceNo)}`;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function loadBusStopSnapshot(
  snapshotFilePath = DEFAULT_BUS_STOP_SNAPSHOT_PATH,
): BusStopDatasetSnapshot {
  const parsed = JSON.parse(fs.readFileSync(snapshotFilePath, "utf8")) as {
    metadata?: BusStopDatasetMetadata;
    stops?: unknown[];
    routes?: unknown[];
  };
  if (
    !parsed ||
    !parsed.metadata ||
    !Array.isArray(parsed.stops) ||
    parsed.stops.length === 0
  ) {
    throw new Error("Bus-stop snapshot is empty or invalid");
  }

  const stops = parsed.stops.map(normalizeSnapshotStop);
  const routes = Array.isArray(parsed.routes)
    ? parsed.routes
        .map(normalizeSnapshotRoute)
        .filter((route): route is BusRoutePattern => route !== null)
    : [];

  return { metadata: parsed.metadata, stops, routes };
}

function normalizeSnapshotStop(value: unknown): BusStop {
  const stop = value as Partial<BusStop> | null;
  if (
    !stop ||
    typeof stop.busStopCode !== "string" ||
    !stop.busStopCode.trim() ||
    typeof stop.description !== "string" ||
    typeof stop.roadName !== "string" ||
    typeof stop.latitude !== "number" ||
    !Number.isFinite(stop.latitude) ||
    typeof stop.longitude !== "number" ||
    !Number.isFinite(stop.longitude)
  ) {
    throw new Error("Bus-stop snapshot contains an invalid normalized stop");
  }

  return {
    busStopCode: stop.busStopCode,
    description: stop.description,
    roadName: stop.roadName,
    latitude: stop.latitude,
    longitude: stop.longitude,
    services: Array.isArray(stop.services)
      ? stop.services.filter(
          (service): service is string =>
            typeof service === "string" && Boolean(service.trim()),
        )
      : [],
  };
}

function normalizeSnapshotRoute(value: unknown): BusRoutePattern | null {
  const route = value as Partial<BusRoutePattern> | null;
  if (
    !route ||
    typeof route.serviceNo !== "string" ||
    !route.serviceNo.trim() ||
    typeof route.direction !== "number" ||
    !Number.isFinite(route.direction) ||
    !Array.isArray(route.stopCodes)
  ) {
    return null;
  }
  const stopCodes = route.stopCodes.filter(
    (stopCode): stopCode is string =>
      typeof stopCode === "string" && Boolean(stopCode.trim()),
  );
  return stopCodes.length > 0
    ? {
        serviceNo: route.serviceNo,
        direction: route.direction,
        stopCodes,
      }
    : null;
}

function initializeBusStopRepository(): BusStopRepository {
  try {
    const snapshot = loadBusStopSnapshot();
    return new BusStopRepository(
      snapshot.stops,
      snapshot.metadata,
      snapshot.routes,
    );
  } catch (error) {
    const initializationError =
      error instanceof Error ? error : new Error("Unknown dataset error");
    console.error("[BusStops] Regional dataset failed to load", {
      error: initializationError.message,
    });
    return new BusStopRepository([], undefined, [], initializationError);
  }
}

export const busStopRepository = initializeBusStopRepository();
