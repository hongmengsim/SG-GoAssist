import type { BusRoutePattern, BusStop } from "@buspass/shared";
import type {
  DataMallBusRouteRecord,
  DataMallBusStopRecord,
  NormalizedBusStopDataset,
} from "./types";

const singaporeBounds = {
  north: 1.49,
  south: 1.13,
  east: 104.12,
  west: 103.55,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function coordinate(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  return Number.NaN;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isValidSingaporeCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= singaporeBounds.south &&
    latitude <= singaporeBounds.north &&
    longitude >= singaporeBounds.west &&
    longitude <= singaporeBounds.east
  );
}

export function compareServiceNumbers(a: string, b: string): number {
  const aMatch = /^(\d+)(.*)$/i.exec(a);
  const bMatch = /^(\d+)(.*)$/i.exec(b);
  if (aMatch && bMatch) {
    return (
      Number(aMatch[1]) - Number(bMatch[1]) ||
      aMatch[2].localeCompare(bMatch[2], undefined, { sensitivity: "base" })
    );
  }
  if (aMatch) return -1;
  if (bMatch) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function normalizeDataMallBusData(
  stopRecords: DataMallBusStopRecord[],
  routeRecords: DataMallBusRouteRecord[],
): NormalizedBusStopDataset {
  const servicesByStop = new Map<string, Set<string>>();
  const allServices = new Set<string>();
  const routeStopsByPattern = new Map<
    string,
    Array<{ sequence: number; busStopCode: string }>
  >();
  for (const route of routeRecords) {
    const busStopCode = text(route.BusStopCode);
    const serviceNo = text(route.ServiceNo);
    if (!busStopCode || !serviceNo) continue;
    const services = servicesByStop.get(busStopCode) ?? new Set<string>();
    services.add(serviceNo);
    servicesByStop.set(busStopCode, services);
    allServices.add(serviceNo);

    const direction = positiveInteger(route.Direction);
    const sequence = positiveInteger(route.StopSequence);
    if (direction !== null && sequence !== null) {
      const key = `${serviceNo}\u0000${direction}`;
      const routeStops = routeStopsByPattern.get(key) ?? [];
      routeStops.push({ sequence, busStopCode });
      routeStopsByPattern.set(key, routeStops);
    }
  }

  const routes: BusRoutePattern[] = [...routeStopsByPattern.entries()]
    .map(([key, routeStops]) => {
      const [serviceNo, directionText] = key.split("\u0000");
      const sortedStops = [...routeStops].sort(
        (a, b) =>
          a.sequence - b.sequence || a.busStopCode.localeCompare(b.busStopCode),
      );
      return {
        serviceNo,
        direction: Number(directionText),
        stopCodes: sortedStops.map((routeStop) => routeStop.busStopCode),
      };
    })
    .sort(
      (a, b) =>
        compareServiceNumbers(a.serviceNo, b.serviceNo) ||
        a.direction - b.direction,
    );

  const stopsByCode = new Map<string, BusStop>();
  let duplicateStopCodesRemoved = 0;
  let invalidCoordinatesRemoved = 0;
  let invalidStopRecordsRemoved = 0;

  for (const record of stopRecords) {
    const busStopCode = text(record.BusStopCode);
    if (!busStopCode) {
      invalidStopRecordsRemoved += 1;
      continue;
    }
    const latitude = coordinate(record.Latitude);
    const longitude = coordinate(record.Longitude);
    if (!isValidSingaporeCoordinate(latitude, longitude)) {
      invalidCoordinatesRemoved += 1;
      continue;
    }
    if (stopsByCode.has(busStopCode)) {
      duplicateStopCodesRemoved += 1;
      continue;
    }

    stopsByCode.set(busStopCode, {
      busStopCode,
      roadName: text(record.RoadName),
      description: text(record.Description) || `Bus stop ${busStopCode}`,
      latitude,
      longitude,
      services: [...(servicesByStop.get(busStopCode) ?? [])].sort(
        compareServiceNumbers,
      ),
    });
  }

  const stops = [...stopsByCode.values()].sort((a, b) =>
    a.busStopCode.localeCompare(b.busStopCode),
  );
  return {
    stops,
    routes,
    summary: {
      busStopsReceived: stopRecords.length,
      busRouteRecordsReceived: routeRecords.length,
      duplicateStopCodesRemoved,
      invalidCoordinatesRemoved,
      invalidStopRecordsRemoved,
      stopsWithServices: stops.filter((stop) => stop.services.length > 0)
        .length,
      serviceCount: allServices.size,
      routePatternCount: routes.length,
    },
  };
}
