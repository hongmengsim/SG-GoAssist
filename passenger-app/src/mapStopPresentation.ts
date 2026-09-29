import type { NearbyBusStop } from "@buspass/shared";

export type MapStopDensity = "PRIORITIZED" | "ALL";

export type AccessibleStopRouteStatus =
  "CHECKING" | "AVAILABLE" | "LIMITED_DATA" | "UNAVAILABLE";

export type MapStopRecommendation = {
  stopCode: string;
  reason: string;
  accessibilityStatus: AccessibleStopRouteStatus | "UNKNOWN";
  provisional: boolean;
};

export type MapStopPresentation = {
  rankedStops: NearbyBusStop[];
  prioritizedStops: NearbyBusStop[];
  recommendation: MapStopRecommendation | null;
};

export type DeriveMapStopPresentationOptions = {
  stops: NearbyBusStop[];
  selectedStopCode?: string;
  retainedStopCodes?: string[];
  preferAccessibleStops?: boolean;
  accessibleOnly?: boolean;
  routeStatuses?: Record<string, AccessibleStopRouteStatus>;
  serviceFilter?: string;
  shortlistSize?: number;
};

const accessibilityRank: Record<AccessibleStopRouteStatus | "UNKNOWN", number> =
  {
    AVAILABLE: 0,
    LIMITED_DATA: 1,
    CHECKING: 2,
    UNKNOWN: 3,
    UNAVAILABLE: 4,
  };

function accessibilityStatusFor(
  stopCode: string,
  routeStatuses: Record<string, AccessibleStopRouteStatus>,
) {
  return routeStatuses[stopCode] ?? "UNKNOWN";
}

function recommendationReason({
  stop,
  status,
  preferAccessibleStops,
  serviceFilter,
}: {
  stop: NearbyBusStop;
  status: AccessibleStopRouteStatus | "UNKNOWN";
  preferAccessibleStops: boolean;
  serviceFilter?: string;
}) {
  if (preferAccessibleStops && status === "AVAILABLE") {
    return "Closest wheelchair-accessible stop";
  }
  if (serviceFilter && stop.services.includes(serviceFilter)) {
    return `Closest stop for Service ${serviceFilter}`;
  }
  return "Closest stop to this area";
}

/**
 * Produces the small, stable set of stops used by the passenger-first map.
 * This function deliberately contains no UI state so ranking can be verified
 * independently of either map provider.
 */
export function deriveMapStopPresentation({
  stops,
  selectedStopCode,
  retainedStopCodes = [],
  preferAccessibleStops = false,
  accessibleOnly = false,
  routeStatuses = {},
  serviceFilter,
  shortlistSize = 3,
}: DeriveMapStopPresentationOptions): MapStopPresentation {
  const uniqueStops = [
    ...new Map(stops.map((stop) => [stop.busStopCode, stop])).values(),
  ];
  const candidates = accessibleOnly
    ? uniqueStops.filter((stop) => {
        const status = accessibilityStatusFor(stop.busStopCode, routeStatuses);
        return status !== "UNAVAILABLE";
      })
    : uniqueStops;

  const rankedStops = [...candidates].sort((first, second) => {
    const selectedDifference =
      Number(second.busStopCode === selectedStopCode) -
      Number(first.busStopCode === selectedStopCode);
    if (selectedDifference) return selectedDifference;

    if (preferAccessibleStops) {
      const accessibilityDifference =
        accessibilityRank[
          accessibilityStatusFor(first.busStopCode, routeStatuses)
        ] -
        accessibilityRank[
          accessibilityStatusFor(second.busStopCode, routeStatuses)
        ];
      if (accessibilityDifference) return accessibilityDifference;
    }

    const distanceDifference = first.distanceMeters - second.distanceMeters;
    if (distanceDifference) return distanceDifference;

    if (serviceFilter) {
      const serviceDifference =
        Number(second.services.includes(serviceFilter)) -
        Number(first.services.includes(serviceFilter));
      if (serviceDifference) return serviceDifference;
    }

    return first.busStopCode.localeCompare(second.busStopCode);
  });

  const prioritizedByCode = new Map<string, NearbyBusStop>();
  for (const stopCode of [selectedStopCode, ...retainedStopCodes]) {
    if (!stopCode) continue;
    const stop = uniqueStops.find(
      (candidate) => candidate.busStopCode === stopCode,
    );
    if (stop) prioritizedByCode.set(stop.busStopCode, stop);
  }
  for (const stop of rankedStops) {
    if (prioritizedByCode.size >= Math.max(1, shortlistSize)) break;
    prioritizedByCode.set(stop.busStopCode, stop);
  }

  const recommendedStop = rankedStops[0];
  const accessibilityStatus = recommendedStop
    ? accessibilityStatusFor(recommendedStop.busStopCode, routeStatuses)
    : "UNKNOWN";

  return {
    rankedStops,
    prioritizedStops: [...prioritizedByCode.values()],
    recommendation: recommendedStop
      ? {
          stopCode: recommendedStop.busStopCode,
          reason: recommendationReason({
            stop: recommendedStop,
            status: accessibilityStatus,
            preferAccessibleStops,
            serviceFilter,
          }),
          accessibilityStatus,
          provisional:
            preferAccessibleStops &&
            (accessibilityStatus === "CHECKING" ||
              accessibilityStatus === "UNKNOWN"),
        }
      : null,
  };
}
