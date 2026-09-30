import {
  PrecisionDockingAssessment,
  PrecisionDockingObservation,
} from "@buspass/shared";
import {
  OperationsNotFoundError,
  OperationsValidationError,
} from "./assistanceCaseService";
import { withLock } from "../concurrency/locks";
import { getOperationsData } from "./operationsData";

const FRESHNESS_MS = Number(process.env.GOASSIST_DOCK_FRESHNESS_MS ?? 2_000);
const MINIMUM_CONFIDENCE = Number(
  process.env.GOASSIST_DOCK_MIN_CONFIDENCE ?? 0.8,
);
const TARGET_RANGE_MM = Number(
  process.env.GOASSIST_DOCK_TARGET_RANGE_MM ?? 600,
);
const RANGE_TOLERANCE_MM = Number(
  process.env.GOASSIST_DOCK_RANGE_TOLERANCE_MM ?? 250,
);
const SENSOR_AGREEMENT_MM = Number(
  process.env.GOASSIST_DOCK_SENSOR_AGREEMENT_MM ?? 200,
);
const LATERAL_TOLERANCE_MM = Number(
  process.env.GOASSIST_DOCK_LATERAL_TOLERANCE_MM ?? 150,
);
const HEADING_TOLERANCE_DEGREES = Number(
  process.env.GOASSIST_DOCK_HEADING_TOLERANCE_DEGREES ?? 6,
);

export function recordPrecisionDockingObservation(
  input: PrecisionDockingObservation,
): Promise<PrecisionDockingAssessment> {
  return withLock(`docking:${input.busId}`, () =>
    recordPrecisionDockingObservationUnlocked(input),
  );
}

async function recordPrecisionDockingObservationUnlocked(
  input: PrecisionDockingObservation,
): Promise<PrecisionDockingAssessment> {
  validate(input);
  const current = await (await getOperationsData()).docking.get(input.busId);
  if (current && new Date(input.observedAt) < new Date(current.observedAt)) {
    throw new OperationsValidationError("Stale docking observation rejected");
  }
  await (await getOperationsData()).docking.put(input);
  return assessPrecisionDocking(input);
}

export async function getPrecisionDockingAssessment(
  busId: string,
): Promise<PrecisionDockingAssessment> {
  const observation = await (await getOperationsData()).docking.get(busId);
  if (!observation) {
    throw new OperationsNotFoundError(
      "Precision docking observation not found",
    );
  }
  return assessPrecisionDocking(observation);
}

export function assessPrecisionDocking(
  observation: PrecisionDockingObservation,
  nowMs = Date.now(),
): PrecisionDockingAssessment {
  const ageMs = nowMs - new Date(observation.observedAt).getTime();
  const fresh = ageMs >= -1_000 && ageMs <= FRESHNESS_MS;
  let reason = "Docking alignment verified";
  let aligned = true;

  if (!fresh) [aligned, reason] = [false, "Docking sensor data is stale"];
  else if (!observation.markerDetected)
    [aligned, reason] = [false, "Docking marker is not visible"];
  else if (!observation.tofHealthy)
    [aligned, reason] = [false, "Docking distance sensor is unavailable"];
  else if (observation.confidence < MINIMUM_CONFIDENCE)
    [aligned, reason] = [false, "Docking marker confidence is too low"];
  else if (observation.stopCode.trim().length === 0)
    [aligned, reason] = [false, "Docking stop is not identified"];
  else if (Math.abs(observation.lateralOffsetMm!) > LATERAL_TOLERANCE_MM)
    [aligned, reason] = [
      false,
      "Bus is laterally misaligned with the boarding point",
    ];
  else if (
    Math.abs(observation.headingErrorDegrees!) > HEADING_TOLERANCE_DEGREES
  )
    [aligned, reason] = [
      false,
      "Bus heading is not aligned with the boarding point",
    ];
  else if (
    Math.abs(observation.markerRangeMm! - observation.tofDistanceMm!) >
    SENSOR_AGREEMENT_MM
  )
    [aligned, reason] = [false, "Camera and distance sensor do not agree"];
  else if (
    Math.abs(observation.tofDistanceMm! - TARGET_RANGE_MM) > RANGE_TOLERANCE_MM
  )
    [aligned, reason] = [
      false,
      "Bus has not reached the calibrated docking distance",
    ];

  return { ...observation, fresh, aligned, reason };
}

function validate(input: PrecisionDockingObservation): void {
  if (
    !input.busId?.trim() ||
    !input.stopCode?.trim() ||
    !Number.isInteger(input.markerId) ||
    input.markerId < 0 ||
    typeof input.markerDetected !== "boolean" ||
    typeof input.tofHealthy !== "boolean" ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    Number.isNaN(new Date(input.observedAt).getTime())
  ) {
    throw new OperationsValidationError(
      "Invalid precision docking observation",
    );
  }
  if (
    input.markerDetected &&
    (!finiteNonNegative(input.markerRangeMm) ||
      !Number.isFinite(input.lateralOffsetMm) ||
      !Number.isFinite(input.headingErrorDegrees))
  ) {
    throw new OperationsValidationError(
      "Detected marker requires range, offset, and heading",
    );
  }
  if (input.tofHealthy && !finiteNonNegative(input.tofDistanceMm)) {
    throw new OperationsValidationError(
      "Healthy distance sensor requires a distance",
    );
  }
}

function finiteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}
