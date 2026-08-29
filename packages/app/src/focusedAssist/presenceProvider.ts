import type { NearbyBusStop } from "@buspass/shared";
import type {
  BusAtStop,
  BusPresenceInput,
  BusPresenceSource,
  FocusedAssistLocation,
  FocusedAssistStopResolution,
} from "./types";

export const focusedAssistStopThresholdMeters = 80;
export const focusedAssistMaximumAccuracyMeters = 75;

export interface BusPresenceProvider {
  readonly kind: "REAL" | "DEMO";
  getBusesAtCurrentStop(input: BusPresenceInput): BusAtStop[];
}

export function resolveCurrentStop({
  location,
  nearbyStops,
  manuallySelectedStop,
}: {
  location: FocusedAssistLocation | null;
  nearbyStops: NearbyBusStop[];
  manuallySelectedStop: NearbyBusStop | null;
}): FocusedAssistStopResolution {
  if (manuallySelectedStop) {
    return { stop: manuallySelectedStop, reason: "RESOLVED" };
  }
  if (!location) {
    return { stop: null, reason: "LOCATION_REQUIRED" };
  }
  if (
    location.accuracyMeters !== undefined &&
    location.accuracyMeters > focusedAssistMaximumAccuracyMeters
  ) {
    return { stop: null, reason: "POOR_ACCURACY" };
  }

  const nearest = nearbyStops
    .map((stop) => ({
      stop,
      distanceMeters: distanceBetween(location, stop),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  if (!nearest || nearest.distanceMeters > focusedAssistStopThresholdMeters) {
    return { stop: null, reason: "NO_NEARBY_STOP" };
  }
  return {
    stop: { ...nearest.stop, distanceMeters: nearest.distanceMeters },
    reason: "RESOLVED",
  };
}

export class RealBusPresenceProvider implements BusPresenceProvider {
  readonly kind = "REAL" as const;

  getBusesAtCurrentStop(input: BusPresenceInput): BusAtStop[] {
    const activeJourneyAtStop =
      input.activeJourney?.boardingStopCode === input.currentStop.busStopCode;
    const candidates = input.arrivals
      .filter((arrival) => arrival.etaSeconds <= 360)
      .map<BusAtStop>((arrival) => {
        const activeJourneyMatch = Boolean(
          activeJourneyAtStop &&
          (arrival.busId === input.activeJourney?.bus.busId ||
            arrival.serviceNo === input.activeJourney?.bus.busService),
        );
        return {
          id: arrival.busId || `service-${arrival.serviceNo}`,
          serviceNo: arrival.serviceNo,
          vehicleId: arrival.busId,
          destination: arrival.destination,
          wheelchairAccessible: arrival.wheelchairAccessible,
          etaSeconds: arrival.etaSeconds,
          confidence: arrival.etaSeconds <= 90 ? "MEDIUM" : "LOW",
          source: activeJourneyMatch ? "ACTIVE_JOURNEY" : "LIVE_ARRIVAL",
          activeJourneyMatch,
        };
      });

    if (activeJourneyAtStop && input.activeJourney) {
      const { bus, arrival, vehicleStatus } = input.activeJourney;
      const existing = candidates.find(
        (candidate) =>
          candidate.vehicleId === bus.busId ||
          candidate.serviceNo === bus.busService,
      );
      const confidence =
        vehicleStatus === "ARRIVED"
          ? "HIGH"
          : vehicleStatus === "APPROACHING"
            ? "MEDIUM"
            : undefined;
      if (existing && confidence) {
        existing.confidence = confidence;
        existing.source =
          confidence === "HIGH" ? "VEHICLE_TELEMETRY" : "ACTIVE_JOURNEY";
        existing.activeJourneyMatch = true;
      } else if (confidence || !existing) {
        candidates.push({
          id: bus.busId,
          serviceNo: bus.busService,
          vehicleId: bus.busId,
          destination: arrival?.destination ?? bus.nextStop,
          wheelchairAccessible: bus.isAccessible,
          etaSeconds: arrival?.etaSeconds,
          confidence: confidence ?? "LOW",
          source:
            confidence === "HIGH" ? "VEHICLE_TELEMETRY" : "ACTIVE_JOURNEY",
          activeJourneyMatch: true,
        });
      }
    }

    return normalizeCandidates(candidates);
  }
}

export class DemoBusPresenceProvider implements BusPresenceProvider {
  readonly kind = "DEMO" as const;

  constructor(
    private readonly realProvider: BusPresenceProvider = new RealBusPresenceProvider(),
  ) {}

  getBusesAtCurrentStop(input: BusPresenceInput): BusAtStop[] {
    return this.realProvider.getBusesAtCurrentStop(input).map((candidate) =>
      candidate.etaSeconds !== undefined && candidate.etaSeconds <= 90
        ? {
            ...candidate,
            confidence: "HIGH",
            source: "DEMO" as BusPresenceSource,
          }
        : candidate,
    );
  }
}

export function createBusPresenceProvider({
  demoMode,
}: {
  demoMode: boolean;
}): BusPresenceProvider {
  return demoMode
    ? new DemoBusPresenceProvider()
    : new RealBusPresenceProvider();
}

export function getBusesAtCurrentStop(
  provider: BusPresenceProvider,
  input: BusPresenceInput,
) {
  return provider.getBusesAtCurrentStop(input);
}

function normalizeCandidates(candidates: BusAtStop[]) {
  const byId = new Map<string, BusAtStop>();
  candidates.forEach((candidate) => {
    const key = candidate.vehicleId ?? `service-${candidate.serviceNo}`;
    const existing = byId.get(key);
    if (!existing || confidenceRank(candidate) > confidenceRank(existing)) {
      byId.set(key, candidate);
    }
  });
  return [...byId.values()].sort((left, right) => {
    if (left.activeJourneyMatch !== right.activeJourneyMatch) {
      return left.activeJourneyMatch ? -1 : 1;
    }
    return confidenceRank(right) - confidenceRank(left);
  });
}

function confidenceRank(candidate: BusAtStop) {
  return candidate.confidence === "HIGH"
    ? 3
    : candidate.confidence === "MEDIUM"
      ? 2
      : 1;
}

function distanceBetween(
  from: FocusedAssistLocation,
  to: Pick<NearbyBusStop, "latitude" | "longitude">,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
