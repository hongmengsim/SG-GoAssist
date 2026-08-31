import {
  RampObstacleAssessment,
  RampObstacleClass,
  RampObstacleClassification,
  RampObstacleRanging,
} from "@buspass/shared";
import { getOperationsStore } from "./operationsStore";

const RANGE_FRESHNESS_MS = 1_500;
const CLASSIFICATION_FRESHNESS_MS = 2_500;
const LIGHT_DEBRIS_CONFIDENCE = 0.92;
const LIGHT_DEBRIS_MAX_ZONES = 2;
const LIGHT_DEBRIS_MIN_DISTANCE_MM = 350;
const CLASSES = new Set<RampObstacleClass>([
  "NONE",
  "LIGHT_DEBRIS",
  "PERSON",
  "MOBILITY_DEVICE",
  "LUGGAGE",
  "ANIMAL",
  "UNKNOWN",
]);

export class RampObstacleValidationError extends Error {}
export class RampObstacleNotFoundError extends Error {}

export function recordRampObstacleClassification(
  input: RampObstacleClassification,
): RampObstacleAssessment {
  validateClassification(input);
  getOperationsStore().update((state) => {
    const index = state.rampObstacleClassifications.findIndex(
      (item) => item.busId === input.busId,
    );
    if (index >= 0) state.rampObstacleClassifications[index] = input;
    else state.rampObstacleClassifications.push(input);
  });
  return getRampObstacleAssessment(input.busId);
}

export function getRampObstacleAssessment(
  busId: string,
): RampObstacleAssessment {
  const state = getOperationsStore().snapshot();
  const ranging = state.safetyTelemetry.find(
    (item) => item.busId === busId,
  )?.rampObstacle;
  if (!ranging) {
    throw new RampObstacleNotFoundError("Ramp laser ranging is unavailable");
  }
  const classification = state.rampObstacleClassifications.find(
    (item) => item.busId === busId,
  );
  return fuseRampObstacleAssessment(ranging, classification);
}

export function fuseRampObstacleAssessment(
  ranging: RampObstacleRanging,
  classification?: RampObstacleClassification,
  nowMs = Date.now(),
): RampObstacleAssessment {
  validateRanging(ranging);
  const rangeAgeMs = nowMs - Date.parse(ranging.observedAt);
  if (rangeAgeMs < 0 || rangeAgeMs > RANGE_FRESHNESS_MS) {
    return assessment(ranging, undefined, true, "Laser ranging is stale");
  }
  if (!ranging.laserHealthy) {
    return assessment(ranging, undefined, true, "Laser sensor health check failed");
  }
  if (!ranging.objectDetected && ranging.occupiedZoneCount === 0) {
    return {
      ...ranging,
      classification: "NONE",
      classificationConfidence: 1,
      blocksDeployment: false,
      reason: "Ramp deployment envelope is clear",
    };
  }
  if (ranging.criticalZoneOccupied) {
    return assessment(
      ranging,
      classification,
      true,
      "Object is inside the ramp hinge or landing zone",
    );
  }

  const classificationFresh =
    classification &&
    classification.busId &&
    nowMs - Date.parse(classification.observedAt) >= 0 &&
    nowMs - Date.parse(classification.observedAt) <= CLASSIFICATION_FRESHNESS_MS;
  if (!classificationFresh) {
    return assessment(
      ranging,
      classification,
      true,
      "Object detected but its classification is missing or stale",
    );
  }

  const lightDebrisCanBeIgnored =
    classification.classification === "LIGHT_DEBRIS" &&
    classification.confidence >= LIGHT_DEBRIS_CONFIDENCE &&
    ranging.occupiedZoneCount <= LIGHT_DEBRIS_MAX_ZONES &&
    (ranging.nearestDistanceMm ?? 0) >= LIGHT_DEBRIS_MIN_DISTANCE_MM;
  return assessment(
    ranging,
    classification,
    !lightDebrisCanBeIgnored,
    lightDebrisCanBeIgnored
      ? "Small light debris identified outside critical ramp zones"
      : `${classification.classification.toLowerCase().replace(/_/g, " ")} blocks ramp deployment`,
  );
}

function assessment(
  ranging: RampObstacleRanging,
  classification: RampObstacleClassification | undefined,
  blocksDeployment: boolean,
  reason: string,
): RampObstacleAssessment {
  return {
    ...ranging,
    classification: classification?.classification ?? "UNKNOWN",
    classificationConfidence: classification?.confidence ?? 0,
    classificationObservedAt: classification?.observedAt,
    blocksDeployment,
    reason,
  };
}

function validateClassification(input: RampObstacleClassification): void {
  if (
    !input.busId?.trim() ||
    !CLASSES.has(input.classification) ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    !validDate(input.observedAt)
  ) {
    throw new RampObstacleValidationError(
      "Invalid ramp obstacle classification",
    );
  }
}

function validateRanging(input: RampObstacleRanging): void {
  if (
    typeof input.laserHealthy !== "boolean" ||
    typeof input.objectDetected !== "boolean" ||
    !Number.isInteger(input.occupiedZoneCount) ||
    input.occupiedZoneCount < 0 ||
    typeof input.criticalZoneOccupied !== "boolean" ||
    (input.nearestDistanceMm !== undefined &&
      (!Number.isFinite(input.nearestDistanceMm) ||
        input.nearestDistanceMm < 0)) ||
    !validDate(input.observedAt)
  ) {
    throw new RampObstacleValidationError("Invalid ramp laser ranging");
  }
}

function validDate(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
