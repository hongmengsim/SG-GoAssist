import type { SafetyTelemetry, StopVehiclePresence } from "@buspass/shared";
import { getArrivalsForStop } from "../data/bus-stops.mock";
import { getBusById } from "../data/buses.mock";
import { getOperationsData } from "./operationsData";

/** More vehicles than this at one stop are not expected; the read is bounded. */
const STOP_PRESENCE_LIMIT = 200;

export const STOP_VEHICLE_PRESENCE_FRESHNESS_MS = Number(
  process.env.GOASSIST_TELEMETRY_FRESHNESS_MS ?? 5_000,
);

export function isStopVehiclePresenceFresh(
  observedAt: string,
  now = Date.now(),
): boolean {
  const observedTime = new Date(observedAt).getTime();
  return (
    Number.isFinite(observedTime) &&
    Math.abs(now - observedTime) <= STOP_VEHICLE_PRESENCE_FRESHNESS_MS
  );
}

export function listStopVehiclePresence(
  stopCode: string,
  now = Date.now(),
): StopVehiclePresence[] {
  return getOperationsData()
    .telemetry.find("stopCode", stopCode, STOP_PRESENCE_LIMIT)
    .map((telemetry) => deriveStopVehiclePresence(telemetry, now))
    .filter((vehicle): vehicle is StopVehiclePresence => Boolean(vehicle));
}

export function deriveStopVehiclePresence(
  telemetry: SafetyTelemetry,
  now = Date.now(),
): StopVehiclePresence | null {
  if (!telemetry.stopCode) return null;

  const data = getOperationsData();
  const capability = data.capabilities.get(telemetry.busId);
  const autonomousVehicle = data.vehicles.get(telemetry.busId);
  const knownBus = getBusById(telemetry.busId);
  const busService =
    capability?.busService ??
    autonomousVehicle?.busService ??
    knownBus?.busService;
  if (!busService) return null;

  const arrival = getArrivalsForStop(telemetry.stopCode)
    .flatMap((service) => service.buses)
    .find((candidate) => candidate.busId === telemetry.busId);

  return {
    busId: telemetry.busId,
    busService,
    stopCode: telemetry.stopCode,
    state:
      telemetry.vehicleStopped && telemetry.parkingBrakeActive
        ? "PARKED"
        : "DEPARTED",
    destination: arrival?.destination,
    wheelchairAccessible: capability?.ramp ?? knownBus?.isAccessible ?? false,
    observedAt: telemetry.observedAt,
    fresh: isStopVehiclePresenceFresh(telemetry.observedAt, now),
  };
}

export function createDepartedStopVehiclePresence(
  telemetry: SafetyTelemetry,
  observedAt = new Date().toISOString(),
): StopVehiclePresence | null {
  const vehicle = deriveStopVehiclePresence(telemetry);
  return vehicle
    ? {
        ...vehicle,
        state: "DEPARTED",
        observedAt,
        fresh: true,
      }
    : null;
}
