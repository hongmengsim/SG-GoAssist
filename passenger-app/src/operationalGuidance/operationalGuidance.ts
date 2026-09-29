import type {
  AssistanceCaseState,
  JourneyPhase,
  SafetyTelemetry,
  StopVehiclePresenceState,
} from "@buspass/shared";

export type OperationalScenePhase =
  | "APPROACHING"
  | "PARKED"
  | "SECURING"
  | "CHECKING_PATH"
  | "DEPLOYING"
  | "READY"
  | "BOARDING"
  | "ALIGHTING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAULT"
  | "STALE";

export type OperationalCheckpointStatus =
  "PASSED" | "PENDING" | "BLOCKED" | "UNKNOWN";

export type OperationalCheckpointId =
  "STOP" | "BRAKE" | "DOOR" | "PATH" | "RAMP";

export type OperationalGuidanceCheckpoint = {
  id: OperationalCheckpointId;
  label: string;
  status: OperationalCheckpointStatus;
  explanation: string;
};

export type OperationalGuidanceViewModel = {
  phase: OperationalScenePhase;
  headline: string;
  currentAction: string;
  serviceNumber: string;
  checkpoints: OperationalGuidanceCheckpoint[];
  /** The passenger may physically cross the deployed central-door ramp. */
  canTraverseRamp: boolean;
  /** The passenger may advance or finish the journey phase. */
  canCompletePhase: boolean;
  warning?: string;
};

export type OperationalGuidanceContext = {
  serviceNumber: string;
  mode: "BOARDING" | "ALIGHTING";
  expectedStopCode?: string | null;
  presenceState?: StopVehiclePresenceState | null;
  journeyPhase?: JourneyPhase | null;
  requestActive?: boolean;
  caseState?: AssistanceCaseState | null;
  escalationReason?: string | null;
  telemetry?: SafetyTelemetry | null;
};

export const operationalTelemetryFreshnessMs = 5_000;

const activeCaseStates = new Set<AssistanceCaseState>([
  "REQUESTED",
  "VALIDATED",
  "VEHICLE_ASSIGNED",
  "SAFE_TO_ACTUATE",
  "ACTUATING",
  "READY",
  "NEEDS_CONFIRMATION",
  "ESCALATED",
  "BLOCKED",
]);

export function isOperationalTelemetryFresh(
  telemetry: SafetyTelemetry | null | undefined,
  nowMs = Date.now(),
) {
  if (!telemetry) return false;
  const observedAt = Date.parse(telemetry.observedAt);
  return (
    Number.isFinite(observedAt) &&
    observedAt <= nowMs + 1_000 &&
    nowMs - observedAt <= operationalTelemetryFreshnessMs
  );
}

export function deriveOperationalGuidance(
  context: OperationalGuidanceContext,
  nowMs = Date.now(),
): OperationalGuidanceViewModel {
  const telemetry = context.telemetry ?? null;
  const hasTelemetry = telemetry !== null;
  const telemetryFresh = isOperationalTelemetryFresh(telemetry, nowMs);
  const checkpoints = deriveCheckpoints(context, telemetryFresh);
  const checkpoint = (id: OperationalCheckpointId) =>
    checkpoints.find((item) => item.id === id)!;
  const caseActive = Boolean(
    context.requestActive ||
    (context.caseState && activeCaseStates.has(context.caseState)),
  );
  const allInterlocksPassed = checkpoints.every(
    (item) => item.status === "PASSED",
  );
  const pathBlocked = checkpoint("PATH").status === "BLOCKED";
  const stopBlocked = checkpoint("STOP").status === "BLOCKED";
  const rampFault = telemetry?.rampPosition === "FAULT";

  // A terminal case is authoritative proof that the passenger movement was
  // recorded and the ramp was verified stowed. Do this before freshness
  // handling so a later stale heartbeat cannot trap the passenger on the
  // completed journey screen.
  if (context.caseState === "COMPLETED") {
    return model(
      context,
      checkpoints,
      "COMPLETED",
      "Journey can finish",
      context.mode === "ALIGHTING"
        ? "You are safely off the bus and the ramp is stowed."
        : "Boarding is complete and the ramp is stowed.",
      false,
      true,
    );
  }

  if (hasTelemetry && !telemetryFresh) {
    return model(
      context,
      checkpoints,
      "STALE",
      "Live safety status unavailable",
      "Wait for a fresh bus status before boarding or alighting.",
      false,
      false,
      "The last equipment update is too old to confirm that the ramp is safe.",
    );
  }

  if (rampFault || context.caseState === "FAILED") {
    return model(
      context,
      checkpoints,
      "FAULT",
      "Ramp assistance unavailable",
      "Stay clear of the door and ask an operator for help.",
      false,
      false,
      context.escalationReason ?? "The ramp system reported a fault.",
    );
  }

  if (
    pathBlocked ||
    stopBlocked ||
    context.caseState === "BLOCKED" ||
    context.caseState === "ESCALATED"
  ) {
    return model(
      context,
      checkpoints,
      "BLOCKED",
      "Ramp cannot deploy yet",
      "Wait outside the marked ramp area while the obstruction is checked.",
      false,
      false,
      context.escalationReason ??
        telemetry?.rampObstacle?.reason ??
        "A safety check is preventing ramp movement.",
    );
  }

  if (
    telemetry?.rampPosition === "DEPLOYING" ||
    context.caseState === "ACTUATING"
  ) {
    return model(
      context,
      checkpoints,
      "DEPLOYING",
      "Deploying the central-door ramp",
      "Wait until the ramp is fully lowered and marked ready.",
      false,
      false,
    );
  }

  if (
    telemetryFresh &&
    telemetry?.rampPosition === "DEPLOYED" &&
    allInterlocksPassed
  ) {
    const alighting = context.mode === "ALIGHTING";
    return model(
      context,
      checkpoints,
      "READY",
      "Ramp ready",
      alighting
        ? "Exit through the central door when the path is clear."
        : "Board through the central door when the path is clear.",
      true,
      false,
    );
  }

  if (
    telemetryFresh &&
    telemetry?.vehicleStopped &&
    telemetry.parkingBrakeActive &&
    telemetry.doorOpen &&
    checkpoint("PATH").status !== "PASSED"
  ) {
    return model(
      context,
      checkpoints,
      "CHECKING_PATH",
      "Checking the ramp area",
      "Keep outside the marked sensor zone while the path is checked.",
      false,
      false,
    );
  }

  if (caseActive) {
    return model(
      context,
      checkpoints,
      "SECURING",
      "Preparing the bus",
      "Wait while the bus stops, secures its brake, and opens the central door.",
      false,
      false,
    );
  }

  if (
    context.journeyPhase === "ALIGHTING" ||
    context.journeyPhase === "DISEMBARKING"
  ) {
    return model(
      context,
      checkpoints,
      "ALIGHTING",
      "Prepare to leave the bus",
      "Remain onboard until the bus has stopped and the central door is ready.",
      false,
      false,
    );
  }

  if (context.journeyPhase === "BOARDING") {
    return model(
      context,
      checkpoints,
      "BOARDING",
      "Board from the central door",
      "Wait for the bus and any requested equipment to be ready.",
      !context.requestActive,
      !context.requestActive,
    );
  }

  if (context.presenceState === "PARKED") {
    return model(
      context,
      checkpoints,
      "PARKED",
      `Service ${context.serviceNumber} is parked`,
      "Confirm the service, then request the ramp if you need it.",
      true,
      false,
    );
  }

  return model(
    context,
    checkpoints,
    "APPROACHING",
    `Service ${context.serviceNumber} is approaching`,
    "Wait at the boarding point and confirm the service before requesting help.",
    false,
    false,
  );
}

function deriveCheckpoints(
  context: OperationalGuidanceContext,
  telemetryFresh: boolean,
): OperationalGuidanceCheckpoint[] {
  const telemetry = context.telemetry;
  if (!telemetry || !telemetryFresh) {
    const status: OperationalCheckpointStatus = telemetry
      ? "UNKNOWN"
      : "PENDING";
    return [
      checkpoint(
        "STOP",
        "Correct stop",
        status,
        "Waiting for the bus to confirm this stop.",
      ),
      checkpoint(
        "BRAKE",
        "Bus secured",
        status,
        "Waiting for the bus to stop and secure its parking brake.",
      ),
      checkpoint(
        "DOOR",
        "Central door",
        status,
        "Waiting for the central ramp door to open.",
      ),
      checkpoint(
        "PATH",
        "Ramp area",
        status,
        "Waiting for the laser safety check.",
      ),
      checkpoint(
        "RAMP",
        "Ramp position",
        status,
        "Waiting for the ramp position sensor.",
      ),
    ];
  }

  const stopMatches =
    !context.expectedStopCode ||
    !telemetry.stopCode ||
    telemetry.stopCode === context.expectedStopCode;
  const stopKnown = Boolean(telemetry.stopCode || !context.expectedStopCode);
  const busSecured = telemetry.vehicleStopped && telemetry.parkingBrakeActive;
  const obstacle = telemetry.rampObstacle;
  const pathBlocked =
    !telemetry.deploymentPathClear || obstacle?.blocksDeployment === true;
  const harmlessDebris =
    obstacle?.classification === "LIGHT_DEBRIS" &&
    obstacle.blocksDeployment === false;

  return [
    checkpoint(
      "STOP",
      "Correct stop",
      stopKnown ? (stopMatches ? "PASSED" : "BLOCKED") : "UNKNOWN",
      stopMatches
        ? "The bus is matched to this stop."
        : "The bus is reporting a different stop.",
    ),
    checkpoint(
      "BRAKE",
      "Bus secured",
      busSecured ? "PASSED" : "PENDING",
      busSecured
        ? "The bus is stopped with its parking brake active."
        : "The ramp remains locked until the bus stops and secures its brake.",
    ),
    checkpoint(
      "DOOR",
      "Central door",
      telemetry.doorOpen ? "PASSED" : "PENDING",
      telemetry.doorOpen
        ? "The central ramp door is open."
        : "Waiting for the central ramp door to open.",
    ),
    checkpoint(
      "PATH",
      "Ramp area",
      pathBlocked ? "BLOCKED" : "PASSED",
      pathBlocked
        ? (obstacle?.reason ?? "An obstruction is inside the ramp area.")
        : harmlessDebris
          ? "Small light debris is outside the critical ramp zones; deployment may continue."
          : "The laser safety check confirms that the ramp area is clear.",
    ),
    checkpoint(
      "RAMP",
      "Ramp position",
      telemetry.rampPosition === "DEPLOYED"
        ? "PASSED"
        : telemetry.rampPosition === "FAULT"
          ? "BLOCKED"
          : telemetry.rampPosition === "UNKNOWN"
            ? "UNKNOWN"
            : "PENDING",
      rampPositionExplanation(telemetry.rampPosition),
    ),
  ];
}

function checkpoint(
  id: OperationalCheckpointId,
  label: string,
  status: OperationalCheckpointStatus,
  explanation: string,
): OperationalGuidanceCheckpoint {
  return { id, label, status, explanation };
}

function rampPositionExplanation(position: SafetyTelemetry["rampPosition"]) {
  if (position === "DEPLOYED")
    return "The position sensor confirms that the ramp is fully deployed.";
  if (position === "DEPLOYING")
    return "The ramp is moving. Do not board or alight yet.";
  if (position === "RETRACTING")
    return "The ramp is retracting. Keep clear of the doorway.";
  if (position === "FAULT") return "The ramp position sensor reported a fault.";
  if (position === "UNKNOWN") return "The ramp position cannot be verified.";
  return "The ramp is stowed inside the central door.";
}

function model(
  context: OperationalGuidanceContext,
  checkpoints: OperationalGuidanceCheckpoint[],
  phase: OperationalScenePhase,
  headline: string,
  currentAction: string,
  canTraverseRamp: boolean,
  canCompletePhase: boolean,
  warning?: string,
): OperationalGuidanceViewModel {
  return {
    phase,
    headline,
    currentAction,
    serviceNumber: context.serviceNumber,
    checkpoints,
    canTraverseRamp,
    canCompletePhase,
    warning,
  };
}
