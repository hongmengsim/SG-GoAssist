import type {
  BusArrivalService,
  BusStop,
  DataProvenance,
  JourneyPlanLeg,
  JourneyPlanOption,
  JourneyPlanRequest,
  JourneyPlanResponse,
  PassengerContextSnapshot,
  ServiceAdvisory,
  StopAmenityProfile,
} from "@buspass/shared";
import { busStopRepository } from "../bus-stops/repository";
import { getArrivalsForStop } from "../data/bus-stops.mock";
import {
  prototypeRouteShelterCoverage,
  prototypeServiceAdvisories,
  prototypeStopAmenities,
  prototypeVerifiedProvenance,
} from "../data/passenger-context.demo";
import { listStopVehiclePresence } from "./stopVehiclePresenceService";

export interface PassengerArrivalProvider {
  arrivalsForStop(stopCode: string): BusArrivalService[];
  readonly provenance: DataProvenance;
}

export interface StopAmenityProvider {
  amenitiesForStop(stopCode: string): StopAmenityProfile;
}

export interface ServiceAdvisoryProvider {
  advisoriesFor(services: string[], stopCodes: string[]): ServiceAdvisory[];
  readonly provenance: DataProvenance;
}

export interface WalkingEnvironmentProvider {
  shelterCoverage(
    boardingStopCode: string,
    destinationStopCode: string,
  ): JourneyPlanOption["shelterCoverage"];
}

class PrototypeArrivalProvider implements PassengerArrivalProvider {
  readonly provenance = prototypeVerifiedProvenance;

  arrivalsForStop(stopCode: string) {
    return getArrivalsForStop(stopCode);
  }
}

class PrototypeAmenityProvider implements StopAmenityProvider {
  amenitiesForStop(stopCode: string) {
    return prototypeStopAmenities(stopCode);
  }
}

class PrototypeAdvisoryProvider implements ServiceAdvisoryProvider {
  readonly provenance = prototypeVerifiedProvenance;

  advisoriesFor(services: string[], stopCodes: string[]) {
    const serviceSet = new Set(services);
    const stopSet = new Set(stopCodes);
    return prototypeServiceAdvisories.filter(
      (item) =>
        item.affectedServices.some((service) => serviceSet.has(service)) ||
        item.affectedStops.some((stopCode) => stopSet.has(stopCode)),
    );
  }
}

class PrototypeWalkingEnvironmentProvider implements WalkingEnvironmentProvider {
  shelterCoverage(boardingStopCode: string, destinationStopCode: string) {
    return (
      prototypeRouteShelterCoverage[
        `${boardingStopCode}:${destinationStopCode}`
      ] ?? "UNVERIFIED"
    );
  }
}

export const passengerArrivalProvider: PassengerArrivalProvider =
  new PrototypeArrivalProvider();
export const stopAmenityProvider: StopAmenityProvider =
  new PrototypeAmenityProvider();
export const serviceAdvisoryProvider: ServiceAdvisoryProvider =
  new PrototypeAdvisoryProvider();
export const walkingEnvironmentProvider: WalkingEnvironmentProvider =
  new PrototypeWalkingEnvironmentProvider();

export async function getPassengerContext(
  latitude: number,
  longitude: number,
  radiusMeters = 200,
): Promise<PassengerContextSnapshot> {
  const nearbyStops = busStopRepository.nearby(
    latitude,
    longitude,
    radiusMeters,
    3,
  );
  const services = [...new Set(nearbyStops.flatMap((stop) => stop.services))];
  const stopCodes = nearbyStops.map((stop) => stop.busStopCode);

  return {
    generatedAt: new Date().toISOString(),
    radiusMeters,
    nearbyStops: await Promise.all(
      nearbyStops.map(async (stop) => ({
        stop,
        distanceMeters: stop.distanceMeters,
        walkingMinutes: walkingMinutes(stop.distanceMeters),
        arrivals: passengerArrivalProvider.arrivalsForStop(stop.busStopCode),
        amenities: stopAmenityProvider.amenitiesForStop(stop.busStopCode),
        vehicles: await listStopVehiclePresence(stop.busStopCode),
      })),
    ),
    advisories: serviceAdvisoryProvider.advisoriesFor(services, stopCodes),
    provenance: passengerArrivalProvider.provenance,
  };
}

export function planPassengerJourney(
  request: JourneyPlanRequest,
): JourneyPlanResponse {
  const boardingStops = busStopRepository.nearby(
    request.origin.latitude,
    request.origin.longitude,
    800,
    5,
  );
  const destinationStops = busStopRepository.nearby(
    request.destination.latitude,
    request.destination.longitude,
    800,
    5,
  );
  const destinationCodes = new Set(
    destinationStops.map((stop) => stop.busStopCode),
  );
  const options = new Map<string, JourneyPlanOption>();

  for (const boardingStop of boardingStops) {
    for (const serviceNo of boardingStop.services.slice(0, 16)) {
      for (const route of busStopRepository.routesForStopAndService(
        boardingStop.busStopCode,
        serviceNo,
      )) {
        const destinationIndex = route.stops.findIndex(
          (stop, index) => index > 0 && destinationCodes.has(stop.busStopCode),
        );
        if (destinationIndex > 0) {
          const destinationStop = destinationStops.find(
            (stop) =>
              stop.busStopCode === route.stops[destinationIndex].busStopCode,
          );
          if (destinationStop) {
            addOption(
              options,
              directOption(
                request,
                boardingStop,
                destinationStop,
                serviceNo,
                destinationIndex,
              ),
            );
          }
        }

        if (options.size >= 8) continue;
        for (
          let transferIndex = 1;
          transferIndex < Math.min(route.stops.length, 35);
          transferIndex += 1
        ) {
          const transferStop = route.stops[transferIndex];
          const normalizedTransferStop: BusStop = {
            ...transferStop,
            services: transferStop.services ?? [],
          };
          for (const secondService of (transferStop.services ?? []).slice(
            0,
            12,
          )) {
            if (secondService === serviceNo) continue;
            for (const secondRoute of busStopRepository.routesForStopAndService(
              transferStop.busStopCode,
              secondService,
            )) {
              const secondDestinationIndex = secondRoute.stops.findIndex(
                (stop, index) =>
                  index > 0 && destinationCodes.has(stop.busStopCode),
              );
              if (secondDestinationIndex <= 0) continue;
              const destinationStop = destinationStops.find(
                (stop) =>
                  stop.busStopCode ===
                  secondRoute.stops[secondDestinationIndex].busStopCode,
              );
              if (!destinationStop) continue;
              addOption(
                options,
                transferOption(
                  request,
                  boardingStop,
                  normalizedTransferStop,
                  destinationStop,
                  serviceNo,
                  secondService,
                  transferIndex,
                  secondDestinationIndex,
                ),
              );
            }
          }
        }
      }
    }
  }

  const ranked = [...options.values()]
    .sort(
      (left, right) =>
        left.transferCount - right.transferCount ||
        accessibilityRank(right.accessibilityFit) -
          accessibilityRank(left.accessibilityFit) ||
        left.totalMinutes - right.totalMinutes ||
        left.walkingMinutes - right.walkingMinutes ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 3);

  return {
    generatedAt: new Date().toISOString(),
    options: ranked,
    provenance: prototypeVerifiedProvenance,
  };
}

function directOption(
  request: JourneyPlanRequest,
  boardingStop: BusStop & { distanceMeters: number },
  destinationStop: BusStop & { distanceMeters: number },
  serviceNo: string,
  stopCount: number,
): JourneyPlanOption {
  const walkStart = walkingLeg(
    request.origin.label ?? "Your location",
    boardingStop.description,
    boardingStop.distanceMeters,
  );
  const busLeg = busLegFor(serviceNo, boardingStop, destinationStop, stopCount);
  const walkEnd = walkingLeg(
    destinationStop.description,
    request.destination.label ?? "Destination",
    destinationStop.distanceMeters,
  );
  return createOption(
    [walkStart, busLeg, walkEnd],
    boardingStop,
    destinationStop,
    [serviceNo],
  );
}

function transferOption(
  request: JourneyPlanRequest,
  boardingStop: BusStop & { distanceMeters: number },
  transferStop: BusStop,
  destinationStop: BusStop & { distanceMeters: number },
  firstService: string,
  secondService: string,
  firstStopCount: number,
  secondStopCount: number,
): JourneyPlanOption {
  return createOption(
    [
      walkingLeg(
        request.origin.label ?? "Your location",
        boardingStop.description,
        boardingStop.distanceMeters,
      ),
      busLegFor(firstService, boardingStop, transferStop, firstStopCount),
      {
        type: "TRANSFER",
        summary: `Change to Service ${secondService} at ${transferStop.description}`,
        fromStopCode: transferStop.busStopCode,
        toStopCode: transferStop.busStopCode,
        durationMinutes: 5,
      },
      busLegFor(secondService, transferStop, destinationStop, secondStopCount),
      walkingLeg(
        destinationStop.description,
        request.destination.label ?? "Destination",
        destinationStop.distanceMeters,
      ),
    ],
    boardingStop,
    destinationStop,
    [firstService, secondService],
  );
}

function createOption(
  legs: JourneyPlanLeg[],
  boardingStop: BusStop,
  destinationStop: BusStop,
  services: string[],
): JourneyPlanOption {
  const walkingMinutes = legs
    .filter((leg) => leg.type === "WALK")
    .reduce((total, leg) => total + leg.durationMinutes, 0);
  const transferCount = legs.filter((leg) => leg.type === "TRANSFER").length;
  const amenities = [
    stopAmenityProvider.amenitiesForStop(boardingStop.busStopCode),
    stopAmenityProvider.amenitiesForStop(destinationStop.busStopCode),
  ];
  const stepFreeCount = amenities.filter(
    (item) => item.stepFreeKerb === "YES",
  ).length;
  const accessibilityFit =
    stepFreeCount === amenities.length
      ? "VERIFIED"
      : stepFreeCount > 0
        ? "PARTIAL"
        : "UNKNOWN";
  const shelterCoverage = walkingEnvironmentProvider.shelterCoverage(
    boardingStop.busStopCode,
    destinationStop.busStopCode,
  );
  const serviceLabel = services.join(" → ");

  return {
    id: `${boardingStop.busStopCode}-${services.join("-")}-${destinationStop.busStopCode}`,
    title:
      transferCount === 0
        ? `Service ${serviceLabel}`
        : `Services ${serviceLabel}`,
    legs,
    totalMinutes: legs.reduce((total, leg) => total + leg.durationMinutes, 0),
    walkingMinutes,
    transferCount,
    accessibilityFit,
    shelterCoverage,
    advisories: serviceAdvisoryProvider.advisoriesFor(services, [
      boardingStop.busStopCode,
      destinationStop.busStopCode,
    ]),
    boardingStop: copyStop(boardingStop),
    destinationStop: copyStop(destinationStop),
  };
}

function walkingLeg(
  from: string,
  to: string,
  distanceMeters: number,
): JourneyPlanLeg {
  return {
    type: "WALK",
    summary: `Walk from ${from} to ${to}`,
    distanceMeters: Math.max(0, Math.round(distanceMeters)),
    durationMinutes: walkingMinutes(distanceMeters),
  };
}

function busLegFor(
  serviceNo: string,
  from: BusStop,
  to: BusStop,
  stopCount: number,
): JourneyPlanLeg {
  return {
    type: "BUS",
    summary: `Take Service ${serviceNo} from ${from.description} to ${to.description}`,
    serviceNo,
    fromStopCode: from.busStopCode,
    toStopCode: to.busStopCode,
    stopCount,
    durationMinutes: Math.max(4, stopCount * 3),
  };
}

function addOption(
  options: Map<string, JourneyPlanOption>,
  option: JourneyPlanOption,
) {
  const existing = options.get(option.id);
  if (!existing || option.totalMinutes < existing.totalMinutes) {
    options.set(option.id, option);
  }
}

function walkingMinutes(distanceMeters: number) {
  return Math.max(1, Math.ceil(Math.max(0, distanceMeters) / 70));
}

function accessibilityRank(value: JourneyPlanOption["accessibilityFit"]) {
  if (value === "VERIFIED") return 2;
  if (value === "PARTIAL") return 1;
  return 0;
}

function copyStop(stop: BusStop): BusStop {
  return { ...stop, services: [...stop.services] };
}
