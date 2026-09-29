import type { SafetyTelemetry, StopVehiclePresence } from "@buspass/shared";
import { getArrivalsForStop } from "../data/bus-stops.mock";
import { getBusById } from "../data/buses.mock";
import { getOperationsStore } from "./operationsStore";

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
  return getOperationsStore()
    .snapshot()
    .safetyTelemetry.filter((telemetry) => telemetry.stopCode === stopCode)
    .map((telemetry) => deriveStopVehiclePresence(telemetry, now))
    .filter((vehicle): vehicle is StopVehiclePresence => Boolean(vehicle));
}

export function deriveStopVehiclePresence(
  telemetry: SafetyTelemetry,
  now = Date.now(),
): StopVehiclePresence | null {
  if (!telemetry.stopCode) return null;

  const snapshot = getOperationsStore().snapshot();
  const capability = snapshot.capabilities.find(
    (candidate) => candidate.busId === telemetry.busId,
  );
  const autonomousVehicle = snapshot.autonomousVehicles.find(
    (candidate) => candidate.busId === telemetry.busId,
  );
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
