import {
  AutonomousMotionUpdate,
  AutonomousRouteAssignment,
  AutonomousVehicleState,
  SafetyTelemetry,
  VehicleStatus,
} from "@buspass/shared";
import {
  OperationsNotFoundError,
  OperationsValidationError,
  getLatestSafetyTelemetry,
  ingestSafetyTelemetry,
  listVehicleCapabilities,
  publishOperationsEvent,
} from "./assistanceCaseService";
import { processVehicleCommand } from "./aviator";
import { getOperationsData } from "./operationsData";
import { getPrecisionDockingAssessment } from "./precisionDockingService";

const APPROACH_DISTANCE_METERS = 80;
/** The fleet list is bounded; a fleet larger than this needs paging. */
const LIST_LIMIT = 5_000;
const PRECISION_STOP_DISTANCE_METERS = 8;
const SECURE_STOP_DISTANCE_METERS = 3;
const SECURE_STOP_SPEED_KPH = 2;
const MAX_LOCALIZATION_ERROR_METERS = 25;
const DOOR_LOCALIZATION_ERROR_METERS = 10;

export async function assignAutonomousRoute(
  busId: string,
  assignment: AutonomousRouteAssignment,
): Promise<AutonomousVehicleState> {
  const capability = (await listVehicleCapabilities()).find(
    (item) => item.busId === busId,
  );
  if (!capability?.autonomous) {
    throw new OperationsValidationError(
      "Vehicle must advertise autonomous mock-route capability",
    );
  }
  if (
    !assignment.busService?.trim() ||
    !assignment.routeId?.trim() ||
    !Array.isArray(assignment.routeStopCodes) ||
    assignment.routeStopCodes.length === 0 ||
    assignment.routeStopCodes.some(
      (stopCode) => typeof stopCode !== "string" || !stopCode.trim(),
    ) ||
    !Number.isFinite(assignment.initialDistanceMeters) ||
    assignment.initialDistanceMeters <= 0
  ) {
    throw new OperationsValidationError("Invalid autonomous route assignment");
  }

  return await saveAndPublish({
    busId,
    busService: assignment.busService.trim(),
    routeId: assignment.routeId.trim(),
    routeStopCodes: assignment.routeStopCodes.map((stopCode) =>
      stopCode.trim(),
    ),
    targetStopIndex: 0,
    targetStopCode: assignment.routeStopCodes[0].trim(),
    mode: "AUTONOMOUS",
    state: "ROUTE_ASSIGNED",
    distanceToTargetMeters: assignment.initialDistanceMeters,
    speedKph: 0,
    localizationAccuracyMeters: 0,
    obstacleDetected: false,
    remoteOverride: false,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAutonomousVehicleState(
  busId: string,
): Promise<AutonomousVehicleState> {
  const state = await (await getOperationsData()).vehicles.get(busId);
  if (!state)
    throw new OperationsNotFoundError("Autonomous vehicle state not found");
  return state;
}

export async function listAutonomousVehicles(): Promise<
  AutonomousVehicleState[]
> {
  return await (await getOperationsData()).vehicles.list(LIST_LIMIT);
}

export async function startAutonomousRoute(
  busId: string,
): Promise<AutonomousVehicleState> {
  const state = await getAutonomousVehicleState(busId);
  if (state.state !== "ROUTE_ASSIGNED") {
    throw new OperationsValidationError(
      "Only an assigned route can be started",
    );
  }
  return await saveAndPublish({
    ...state,
    state: "EN_ROUTE",
    speedKph: 0,
    remoteOverride: false,
    blockReason: undefined,
  });
}

export async function updateAutonomousMotion(
  busId: string,
  motion: AutonomousMotionUpdate,
): Promise<AutonomousVehicleState> {
  const state = await getAutonomousVehicleState(busId);
  if (!isMotionState(state.state) || state.mode !== "AUTONOMOUS") {
    throw new OperationsValidationError(
      "Vehicle is not in an autonomous motion state",
    );
  }
  validateMotion(motion);

  const updated: AutonomousVehicleState = {
    ...state,
    distanceToTargetMeters: Math.max(0, motion.distanceToTargetMeters),
    speedKph: Math.max(0, motion.speedKph),
    localizationAccuracyMeters: motion.localizationAccuracyMeters,
    obstacleDetected: motion.obstacleDetected === true,
    blockReason: undefined,
  };

  if (updated.obstacleDetected) {
    return await enterSafeStop(
      updated,
      "EMERGENCY_STOP",
      "Obstacle detected in travel path",
    );
  }
  if (updated.localizationAccuracyMeters > MAX_LOCALIZATION_ERROR_METERS) {
    return await enterSafeStop(
      updated,
      "BLOCKED",
      "Localization accuracy is insufficient for autonomous movement",
    );
  }

  if (
    updated.distanceToTargetMeters <= SECURE_STOP_DISTANCE_METERS &&
    updated.speedKph <= SECURE_STOP_SPEED_KPH
  ) {
    const docking = await getDockingAssessment(busId);
    updated.docking = docking;
    if (!docking?.aligned || docking.stopCode !== updated.targetStopCode) {
      updated.state = "PRECISION_STOPPING";
      updated.blockReason =
        docking && docking.stopCode !== updated.targetStopCode
          ? "Docking marker belongs to a different stop"
          : (docking?.reason ?? "Waiting for precision docking sensors");
      return await saveAndPublish(updated);
    }
    updated.state = "STOPPED_SECURE";
    updated.speedKph = 0;
    await publishSafety(updated, {
      vehicleStopped: true,
      parkingBrakeActive: true,
      doorOpen: false,
      deploymentPathClear: true,
    });
    if (updated.targetStopIndex === 0) {
      processVehicleCommand({ busId, status: VehicleStatus.ARRIVED });
    }
    return await saveAndPublish(updated);
  }

  if (updated.distanceToTargetMeters <= PRECISION_STOP_DISTANCE_METERS) {
    updated.state = "PRECISION_STOPPING";
  } else if (updated.distanceToTargetMeters <= APPROACH_DISTANCE_METERS) {
    updated.state = "APPROACHING_STOP";
    if (state.state === "EN_ROUTE" && updated.targetStopIndex === 0) {
      processVehicleCommand({ busId, status: VehicleStatus.APPROACHING });
    }
  } else {
    updated.state = "EN_ROUTE";
  }
  return await saveAndPublish(updated);
}

export async function openAutonomousDoors(
  busId: string,
): Promise<AutonomousVehicleState> {
  const state = await getAutonomousVehicleState(busId);
  if (state.state !== "STOPPED_SECURE") {
    throw new OperationsValidationError(
      "Doors can open only after a verified secure stop",
    );
  }
  if (
    state.obstacleDetected ||
    state.localizationAccuracyMeters > DOOR_LOCALIZATION_ERROR_METERS
  ) {
    throw new OperationsValidationError(
      "Door alignment or obstruction check is not safe",
    );
  }
  const docking = await getDockingAssessment(busId);
  if (!docking?.aligned || docking.stopCode !== state.targetStopCode) {
    throw new OperationsValidationError(
      docking?.reason ?? "Fresh precision docking confirmation is required",
    );
  }
  const telemetry = await getLatestSafetyTelemetry(busId);
  if (
    !telemetry?.vehicleStopped ||
    !telemetry.parkingBrakeActive ||
    telemetry.rampPosition !== "STOWED" ||
    telemetry.rampObstacle?.blocksDeployment === true
  ) {
    throw new OperationsValidationError(
      "Stopped, brake, and stowed-ramp interlocks are required",
    );
  }
  await publishSafety(state, { doorOpen: true });
  return await saveAndPublish({
    ...state,
    state: "DOORS_OPEN",
    speedKph: 0,
    docking,
  });
}

export async function departAutonomousStop(
  busId: string,
  nextStopDistanceMeters?: number,
): Promise<AutonomousVehicleState> {
  const state = await getAutonomousVehicleState(busId);
  if (state.state !== "DOORS_OPEN" && state.state !== "READY_TO_DEPART") {
    throw new OperationsValidationError("Vehicle is not ready to depart");
  }
  const telemetry = await getLatestSafetyTelemetry(busId);
  if (
    !telemetry?.vehicleStopped ||
    !telemetry.parkingBrakeActive ||
    !telemetry.doorOpen ||
    telemetry.rampPosition !== "STOWED" ||
    !telemetry.deploymentPathClear ||
    telemetry.rampObstacle?.blocksDeployment === true
  ) {
    throw new OperationsValidationError(
      "Departure requires a stopped bus, active brake, clear path, and stowed ramp",
    );
  }

  const nextIndex = state.targetStopIndex + 1;
  const routeComplete = nextIndex >= state.routeStopCodes.length;
  if (
    !routeComplete &&
    (!Number.isFinite(nextStopDistanceMeters) || nextStopDistanceMeters! <= 0)
  ) {
    throw new OperationsValidationError(
      "Distance to the next stop is required",
    );
  }
  await publishSafety(state, {
    vehicleStopped: false,
    parkingBrakeActive: false,
    doorOpen: false,
    deploymentPathClear: true,
  });
  if (state.targetStopIndex === 0) {
    processVehicleCommand({ busId, status: VehicleStatus.DEPARTED });
  }

  return await saveAndPublish({
    ...state,
    targetStopIndex: routeComplete ? state.targetStopIndex : nextIndex,
    targetStopCode: routeComplete
      ? state.targetStopCode
      : state.routeStopCodes[nextIndex],
    state: routeComplete ? "IDLE" : "EN_ROUTE",
    distanceToTargetMeters: routeComplete ? 0 : nextStopDistanceMeters!,
    speedKph: 0,
    obstacleDetected: false,
    blockReason: undefined,
  });
}

export async function applyAutonomyOverride(
  busId: string,
  action: "STOP" | "RESUME" | "MANUAL",
  clearance?: {
    obstacleCleared?: boolean;
    localizationAccuracyMeters?: number;
  },
): Promise<AutonomousVehicleState> {
  const state = await getAutonomousVehicleState(busId);
  if (action === "STOP" || action === "MANUAL") {
    await publishSafety(state, {
      vehicleStopped: true,
      parkingBrakeActive: true,
      doorOpen: false,
      deploymentPathClear: false,
    });
    return await saveAndPublish({
      ...state,
      mode: action === "MANUAL" ? "MANUAL" : "REMOTE_ASSIST",
      state: "MANUAL_OVERRIDE",
      speedKph: 0,
      remoteOverride: true,
      blockReason:
        action === "MANUAL"
          ? "Manual driving selected"
          : "Remote operator stop requested",
    });
  }

  if (!["MANUAL_OVERRIDE", "EMERGENCY_STOP", "BLOCKED"].includes(state.state)) {
    throw new OperationsValidationError(
      "Vehicle is not waiting for an override reset",
    );
  }
  const localizationAccuracyMeters =
    clearance?.localizationAccuracyMeters ?? state.localizationAccuracyMeters;
  const safety = await getLatestSafetyTelemetry(busId);
  const obstacleDetected = state.obstacleDetected
    ? clearance?.obstacleCleared !== true ||
      safety?.deploymentPathClear !== true
    : false;
  if (
    obstacleDetected ||
    !safety?.vehicleStopped ||
    !safety.parkingBrakeActive ||
    safety.doorOpen ||
    safety.rampPosition !== "STOWED" ||
    !safety.deploymentPathClear ||
    !Number.isFinite(localizationAccuracyMeters) ||
    localizationAccuracyMeters < 0 ||
    localizationAccuracyMeters > MAX_LOCALIZATION_ERROR_METERS
  ) {
    throw new OperationsValidationError(
      "Unsafe condition must clear before autonomous resume",
    );
  }
  await publishSafety(state, {
    vehicleStopped: false,
    parkingBrakeActive: false,
    doorOpen: false,
    deploymentPathClear: true,
  });
  return await saveAndPublish({
    ...state,
    mode: "AUTONOMOUS",
    state: "EN_ROUTE",
    obstacleDetected: false,
    localizationAccuracyMeters,
    remoteOverride: false,
    blockReason: undefined,
  });
}

async function enterSafeStop(
  state: AutonomousVehicleState,
  nextState: "EMERGENCY_STOP" | "BLOCKED",
  reason: string,
): Promise<AutonomousVehicleState> {
  await publishSafety(state, {
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: false,
    deploymentPathClear: !state.obstacleDetected,
  });
  return await saveAndPublish({
    ...state,
    state: nextState,
    speedKph: 0,
    blockReason: reason,
  });
}

async function publishSafety(
  state: AutonomousVehicleState,
  overrides: Partial<SafetyTelemetry>,
): Promise<void> {
  const current = await getLatestSafetyTelemetry(state.busId);
  await ingestSafetyTelemetry({
    busId: state.busId,
    stopCode: state.targetStopCode,
    vehicleStopped: current?.vehicleStopped ?? false,
    parkingBrakeActive: current?.parkingBrakeActive ?? false,
    doorOpen: current?.doorOpen ?? false,
    deploymentPathClear: current?.deploymentPathClear ?? true,
    rampPosition: current?.rampPosition ?? "STOWED",
    wheelchairSpaceOccupied: current?.wheelchairSpaceOccupied ?? false,
    networkOnline: true,
    ...overrides,
    observedAt: new Date().toISOString(),
  });
}

async function saveAndPublish(
  state: AutonomousVehicleState,
): Promise<AutonomousVehicleState> {
  const normalized = { ...state, updatedAt: new Date().toISOString() };
  await (await getOperationsData()).vehicles.put(normalized);
  publishOperationsEvent({
    type: "AUTONOMY_STATUS",
    busId: normalized.busId,
    busService: normalized.busService,
    autonomy: normalized,
    timestamp: normalized.updatedAt,
  });
  return normalized;
}

function validateMotion(motion: AutonomousMotionUpdate): void {
  if (
    !Number.isFinite(motion.distanceToTargetMeters) ||
    motion.distanceToTargetMeters < 0 ||
    !Number.isFinite(motion.speedKph) ||
    motion.speedKph < 0 ||
    !Number.isFinite(motion.localizationAccuracyMeters) ||
    motion.localizationAccuracyMeters < 0
  ) {
    throw new OperationsValidationError("Invalid autonomous motion update");
  }
}

function isMotionState(state: AutonomousVehicleState["state"]): boolean {
  return ["EN_ROUTE", "APPROACHING_STOP", "PRECISION_STOPPING"].includes(state);
}

async function getDockingAssessment(busId: string) {
  try {
    return await getPrecisionDockingAssessment(busId);
  } catch (error) {
    if (error instanceof OperationsNotFoundError) return undefined;
    throw error;
  }
}
