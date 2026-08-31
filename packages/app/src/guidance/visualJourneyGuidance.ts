import type {
  AssistanceCaseState,
  AutonomousDriveState,
  JourneyPhase,
  VehicleStatus,
} from "@buspass/shared";
import type {
  RouteManeuverDirection,
  RouteStep,
  RoutingCoordinate,
} from "../routing/RoutingProvider";
import type { WalkingRouteProgress } from "../routing/routeProgress";

export type JourneyGuideStage = "WALK" | "WAIT" | "BOARD" | "RIDE" | "EXIT";

export type JourneyGuideScene =
  | "walkingToStop"
  | "waitingForBus"
  | "safeBoarding"
  | "onboardJourney"
  | "safeAlighting"
  | "journeyComplete";

export type JourneyGuideVisualKind =
  | "MANEUVER"
  | "SCENE"
  | "BOARDING_SEQUENCE"
  | "ROUTE_STRIP"
  | "ALIGHTING_SEQUENCE"
  | "COMPLETION";

export type JourneyInstructionStepState = "DONE" | "CURRENT" | "UPCOMING";

export type JourneyInstructionStep = {
  id: string;
  title: string;
  description: string;
  state: JourneyInstructionStepState;
  icon:
    | "WALK"
    | "WAIT"
    | "BUS"
    | "RAMP"
    | "SEAT"
    | "BELL"
    | "EXIT"
    | "CHECK"
    | "WARNING";
  target?: RoutingCoordinate;
};

export type JourneyGuideAction =
  | "SHOW_STEPS"
  | "REPEAT"
  | "CAMERA_GUIDE"
  | "RECALCULATE"
  | "CONTINUE_WITHOUT_REROUTING";

export type JourneyVisualInstruction = {
  id: string;
  phase: JourneyPhase;
  stage: JourneyGuideStage;
  scene: JourneyGuideScene;
  visualKind: JourneyGuideVisualKind;
  title: string;
  summary: string;
  statusLine?: string;
  environmentalCues: string[];
  safetyNote: string;
  steps: JourneyInstructionStep[];
  actions: JourneyGuideAction[];
  tone: "DEFAULT" | "ATTENTION" | "SUCCESS" | "BLOCKED";
  maneuver?: {
    direction: RouteManeuverDirection;
    distanceMeters: number;
    roadName?: string;
    target?: RoutingCoordinate;
    nextInstruction?: string;
  };
  routeStrip?: {
    currentStopName?: string;
    nextStopName?: string;
    destinationName?: string;
    stopsRemaining?: number;
  };
};

export type VisualJourneyInstructionContext = {
  journeyPhase: JourneyPhase;
  selectedStopName?: string;
  stopCode?: string;
  serviceNo?: string;
  destinationName?: string;
  currentStopName?: string;
  nextStopName?: string;
  stopsRemaining?: number;
  etaSeconds?: number | null;
  vehicleStatus?: VehicleStatus | null;
  assistanceCaseState?: AssistanceCaseState | null;
  wheelchairAssistance?: boolean;
  walkingStep?: RouteStep | null;
  nextWalkingStep?: RouteStep | null;
  walkingProgress?: WalkingRouteProgress | null;
  walkingOffRoute?: boolean;
  locationAccuracyLimited?: boolean;
  cameraGuideAvailable?: boolean;
  destinationReached?: boolean;
  autonomousVehicle?: boolean;
  autonomousDriveState?: AutonomousDriveState | null;
};

export type HeadingQuality = "GOOD" | "LOW" | "UNAVAILABLE";
export type LocationQuality = "GOOD" | "LOW" | "POOR";
export type DirectionAlignment =
  "ALIGNED" | "TURN_LEFT" | "TURN_RIGHT" | "BROAD_DIRECTION" | "UNAVAILABLE";

export type DirectionFrame = {
  targetBearing: number | null;
  relativeAngle: number | null;
  distanceMeters: number | null;
  headingQuality: HeadingQuality;
  locationQuality: LocationQuality;
  alignment: DirectionAlignment;
};

const blockedCaseStates = new Set<AssistanceCaseState>([
  "BLOCKED",
  "FAILED",
  "ESCALATED",
  "NEEDS_CONFIRMATION",
]);

function stageForPhase(phase: JourneyPhase): JourneyGuideStage {
  if (phase === "WALKING_TO_STOP") return "WALK";
  if (phase === "WAITING_FOR_BUS" || phase === "BUS_ARRIVING") return "WAIT";
  if (phase === "BOARDING") return "BOARD";
  if (
    phase === "ONBOARD" ||
    phase === "DESTINATION_APPROACHING" ||
    phase === "DESTINATION_NEXT"
  ) {
    return "RIDE";
  }
  return "EXIT";
}

function detail(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function roundedMinutes(etaSeconds?: number | null) {
  if (etaSeconds === null || etaSeconds === undefined) return null;
  return Math.max(1, Math.ceil(etaSeconds / 60));
}

function autonomyPassengerStatus(state?: AutonomousDriveState | null) {
  if (!state) return "Autonomous vehicle tracking and safety checks are active.";
  const labels: Partial<Record<AutonomousDriveState, string>> = {
    ROUTE_ASSIGNED: "The autonomous route is assigned and awaiting departure.",
    EN_ROUTE: "Autonomous travel and obstacle monitoring are active.",
    APPROACHING_STOP: "The autonomous bus is approaching the stop.",
    PRECISION_STOPPING: "The bus is aligning precisely with the boarding area.",
    STOPPED_SECURE: "The bus has stopped and secured its parking brake.",
    DOORS_OPEN: "The doors are open; equipment safety checks remain active.",
    READY_TO_DEPART: "The bus is completing its departure checks.",
    DEPARTING: "The autonomous bus is departing the stop.",
    MANUAL_OVERRIDE: "Autonomous movement is paused for operator control.",
    EMERGENCY_STOP: "The bus has made a safety stop. Wait for an update.",
    BLOCKED: "Autonomous movement is paused by a safety check.",
  };
  return labels[state] ?? "Autonomous vehicle monitoring is active.";
}

function assistanceBlockedInstruction(
  context: VisualJourneyInstructionContext,
): JourneyVisualInstruction | null {
  const state = context.assistanceCaseState;
  if (!state || !blockedCaseStates.has(state)) return null;
  if (
    context.journeyPhase !== "BOARDING" &&
    context.journeyPhase !== "DISEMBARKING" &&
    context.journeyPhase !== "ALIGHTING"
  ) {
    return null;
  }
  const operatorHelping = state === "ESCALATED";
  const confirmationNeeded = state === "NEEDS_CONFIRMATION";
  return {
    id: `${context.journeyPhase}-${state}`,
    phase: context.journeyPhase,
    stage: stageForPhase(context.journeyPhase),
    scene:
      context.journeyPhase === "BOARDING" ? "safeBoarding" : "safeAlighting",
    visualKind:
      context.journeyPhase === "BOARDING"
        ? "BOARDING_SEQUENCE"
        : "ALIGHTING_SEQUENCE",
    title: confirmationNeeded
      ? "Confirm the assistance you need"
      : operatorHelping
        ? "An operator is checking your assistance"
        : "Wait in a safe place",
    summary: confirmationNeeded
      ? "Do not board or exit until the request is confirmed."
      : "The equipment is not ready. Do not use the ramp or doorway yet.",
    statusLine: operatorHelping
      ? "Remote support has been alerted."
      : "Safety checks are still in progress.",
    environmentalCues: [
      "Stay clear of the doorway",
      "Listen or look for the next update",
    ],
    safetyNote:
      "Only move when the bus is stopped and the displayed assistance is ready.",
    steps: [
      {
        id: "wait-safe",
        title: "Stay clear",
        description: "Wait beside the boarding or exit area.",
        state: "CURRENT",
        icon: "WARNING",
      },
      {
        id: "operator-check",
        title: "Safety check",
        description: "The bus or operator is checking the equipment.",
        state: "UPCOMING",
        icon: "RAMP",
      },
      {
        id: "follow-ready",
        title: "Follow the ready message",
        description: "Move only after the app says assistance is ready.",
        state: "UPCOMING",
        icon: "CHECK",
      },
    ],
    actions: ["SHOW_STEPS", "REPEAT"],
    tone: "BLOCKED",
  };
}

export function deriveJourneyVisualInstruction(
  context: VisualJourneyInstructionContext,
): JourneyVisualInstruction {
  const blocked = assistanceBlockedInstruction(context);
  if (blocked) return blocked;

  const phase = context.journeyPhase;
  const stage = stageForPhase(phase);
  const stopName = detail(context.selectedStopName, "your bus stop");
  const destinationName = detail(context.destinationName, "your destination");
  const serviceNo = detail(context.serviceNo, "your service");

  if (phase === "WALKING_TO_STOP") {
    const rawDistance =
      context.walkingProgress?.distanceToNextManeuverMeters ??
      context.walkingStep?.distanceMeters;
    const distance = Math.max(0, rawDistance ?? 0);
    const hasManeuver =
      context.walkingStep !== undefined ||
      context.walkingProgress !== undefined;
    const remaining = context.walkingProgress?.remainingDistanceMeters;
    const currentTitle = detail(
      context.walkingStep?.instruction,
      `Continue toward ${stopName}`,
    );
    const summary = context.walkingOffRoute
      ? "You are away from the suggested route. Recalculate or continue with care."
      : remaining !== undefined
        ? `${Math.round(remaining)} m remaining to ${stopName}.`
        : `Follow the accessible route to ${stopName}.`;
    return {
      id: `walking-${context.walkingProgress?.activeStepIndex ?? 0}-${context.walkingOffRoute ? "off-route" : "route"}`,
      phase,
      stage,
      scene: "walkingToStop",
      visualKind: hasManeuver ? "MANEUVER" : "SCENE",
      title: context.walkingOffRoute ? "Recheck your route" : currentTitle,
      summary,
      statusLine: context.locationAccuracyLimited
        ? "Location accuracy is limited. Match the diagram with signs around you."
        : context.stopCode
          ? `Bus Stop ${context.stopCode}`
          : undefined,
      environmentalCues: [
        context.walkingStep?.roadName
          ? `Look for ${context.walkingStep.roadName}`
          : "Check the road and building names around you",
        "Use kerb ramps and marked crossings where available",
      ],
      safetyNote:
        "Stop and use the diagram if the camera or compass direction does not match your surroundings.",
      steps: [
        {
          id: "current-maneuver",
          title: currentTitle,
          description:
            rawDistance === undefined
              ? "Start diagram directions to see the next maneuver distance."
              : `${Math.round(distance)} m to the next maneuver.`,
          state: "CURRENT",
          icon: "WALK",
          target: context.walkingStep?.coordinate,
        },
        {
          id: "next-maneuver",
          title: detail(
            context.nextWalkingStep?.instruction,
            `Continue to ${stopName}`,
          ),
          description: "This is the following instruction.",
          state: "UPCOMING",
          icon: "WALK",
          target: context.nextWalkingStep?.coordinate,
        },
        {
          id: "find-stop",
          title: `Find ${stopName}`,
          description: context.stopCode
            ? `Confirm the shelter shows Bus Stop ${context.stopCode}.`
            : "Confirm the stop name before waiting.",
          state: "UPCOMING",
          icon: "BUS",
        },
      ],
      actions: context.walkingOffRoute
        ? ["SHOW_STEPS", "RECALCULATE", "CONTINUE_WITHOUT_REROUTING", "REPEAT"]
        : [
            "SHOW_STEPS",
            ...(context.cameraGuideAvailable
              ? (["CAMERA_GUIDE"] as const)
              : []),
            "REPEAT",
      ],
      tone: context.walkingOffRoute ? "ATTENTION" : "DEFAULT",
      maneuver: hasManeuver
        ? {
            direction: context.walkingStep?.maneuverDirection ?? "STRAIGHT",
            distanceMeters: Math.round(distance),
            roadName: context.walkingStep?.roadName,
            target:
              context.nextWalkingStep?.coordinate ??
              context.walkingStep?.coordinate,
            nextInstruction: context.nextWalkingStep?.instruction,
          }
        : undefined,
    };
  }

  if (phase === "WAITING_FOR_BUS" || phase === "BUS_ARRIVING") {
    const approaching =
      phase === "BUS_ARRIVING" || context.vehicleStatus === "APPROACHING";
    const minutes = roundedMinutes(context.etaSeconds);
    return {
      id: `waiting-${approaching ? "approaching" : "steady"}`,
      phase,
      stage,
      scene: "waitingForBus",
      visualKind: "SCENE",
      title: approaching
        ? `Service ${serviceNo} is approaching`
        : `Wait for Service ${serviceNo}`,
      summary: minutes
        ? `Arrival estimate: ${minutes} min at ${stopName}.`
        : `Stay near the marked boarding area at ${stopName}.`,
      statusLine:
        context.assistanceCaseState === "READY"
          ? "Your requested assistance is ready."
          : context.wheelchairAssistance
            ? "Ramp preparation will be shown before boarding."
            : context.autonomousVehicle
              ? autonomyPassengerStatus(context.autonomousDriveState)
              : undefined,
      environmentalCues: [
        `Check the front display for Service ${serviceNo}`,
        "Stand where the driver can see the boarding area",
      ],
      safetyNote:
        "Remain behind the kerb until the bus has stopped and opened its doors.",
      steps: [
        {
          id: "wait-zone",
          title: "Wait near the boarding point",
          description: "Keep the doorway area clear.",
          state: "CURRENT",
          icon: "WAIT",
        },
        {
          id: "identify-bus",
          title: `Identify Service ${serviceNo}`,
          description:
            "Use the front display, audio identification, or app alert.",
          state: "UPCOMING",
          icon: "BUS",
        },
        {
          id: "wait-stopped",
          title: "Wait until the bus stops",
          description:
            "Approach only after the door and assistance status are ready.",
          state: "UPCOMING",
          icon: "CHECK",
        },
      ],
      actions: ["SHOW_STEPS", "REPEAT"],
      tone: approaching ? "ATTENTION" : "DEFAULT",
    };
  }

  if (phase === "BOARDING") {
    const assistanceReady = context.assistanceCaseState === "READY";
    const busArrived = context.vehicleStatus === "ARRIVED";
    const ready = context.wheelchairAssistance ? assistanceReady : busArrived;
    return {
      id: `boarding-${ready ? "ready" : "wait"}`,
      phase,
      stage,
      scene: "safeBoarding",
      visualKind: "BOARDING_SEQUENCE",
      title: ready
        ? context.wheelchairAssistance
          ? "Ramp ready"
          : "Door ready"
        : "Wait beside the boarding area",
      summary: ready
        ? `Service ${serviceNo} is ready. Board when the path is clear.`
        : context.wheelchairAssistance
          ? "Wait for the ramp-ready message before moving."
          : "Wait until the bus has stopped and the door is open.",
      statusLine: context.assistanceCaseState
        ? `Assistance status: ${context.assistanceCaseState.toLowerCase().replaceAll("_", " ")}.`
        : context.autonomousVehicle
          ? autonomyPassengerStatus(context.autonomousDriveState)
          : undefined,
      environmentalCues: [
        "Match the bus service before boarding",
        "Check that the doorway and ramp are clear",
      ],
      safetyNote:
        "The app confirms assistance readiness; always check the physical path before moving.",
      steps: [
        {
          id: "bus-stopped",
          title: "Bus stopped",
          description: `Confirm this is Service ${serviceNo}.`,
          state: busArrived ? "DONE" : "CURRENT",
          icon: "BUS",
        },
        {
          id: "equipment-ready",
          title: context.wheelchairAssistance ? "Ramp ready" : "Door ready",
          description: "Wait for the displayed ready message.",
          state: ready ? "DONE" : "CURRENT",
          icon: context.wheelchairAssistance ? "RAMP" : "CHECK",
        },
        {
          id: "board-clear",
          title: "Board carefully",
          description: "Move only when the path is clear.",
          state: ready ? "CURRENT" : "UPCOMING",
          icon: "WALK",
        },
      ],
      actions: ["SHOW_STEPS", "REPEAT"],
      tone: ready ? "SUCCESS" : "ATTENTION",
    };
  }

  if (
    phase === "ONBOARD" ||
    phase === "DESTINATION_APPROACHING" ||
    phase === "DESTINATION_NEXT"
  ) {
    const destinationNext = phase === "DESTINATION_NEXT";
    const approaching = phase === "DESTINATION_APPROACHING";
    return {
      id: `onboard-${phase}-${context.stopsRemaining ?? "unknown"}`,
      phase,
      stage,
      scene: "onboardJourney",
      visualKind: "ROUTE_STRIP",
      title: destinationNext
        ? "Prepare to alight"
        : approaching
          ? `${destinationName} is approaching`
          : `Next: ${detail(context.nextStopName, "next stop")}`,
      summary: destinationNext
        ? `${destinationName} is next.`
        : context.stopsRemaining !== undefined
          ? `${context.stopsRemaining} ${context.stopsRemaining === 1 ? "stop" : "stops"} remaining.`
          : `Stay onboard for ${destinationName}.`,
      statusLine: context.autonomousVehicle
        ? autonomyPassengerStatus(context.autonomousDriveState)
        : undefined,
      environmentalCues: [
        "Follow the visual stop display and spoken announcements",
        context.wheelchairAssistance
          ? "Remain in the accessible space until the bus stops"
          : "Keep clear of the doors while the bus is moving",
      ],
      safetyNote:
        "Remain seated or securely positioned while the bus is moving.",
      steps: [
        {
          id: "follow-next-stop",
          title: detail(context.nextStopName, "Follow the next-stop display"),
          description: "Check the screen after each stop.",
          state: destinationNext ? "DONE" : "CURRENT",
          icon: "SEAT",
        },
        {
          id: "prepare-exit",
          title: "Prepare before your stop",
          description: `Your destination is ${destinationName}.`,
          state: destinationNext ? "CURRENT" : "UPCOMING",
          icon: "BELL",
        },
        {
          id: "wait-stopped-exit",
          title: "Wait until the bus stops",
          description: "Leave only when the doorway or assistance is ready.",
          state: "UPCOMING",
          icon: "EXIT",
        },
      ],
      actions: ["SHOW_STEPS", "REPEAT"],
      tone: destinationNext ? "ATTENTION" : "DEFAULT",
      routeStrip: {
        currentStopName: context.currentStopName,
        nextStopName: context.nextStopName,
        destinationName,
        stopsRemaining: context.stopsRemaining,
      },
    };
  }

  if (phase === "COMPLETED") {
    return {
      id: "journey-completed",
      phase,
      stage,
      scene: "journeyComplete",
      visualKind: "COMPLETION",
      title: "Journey complete",
      summary: `You have arrived at ${destinationName}.`,
      environmentalCues: [
        "Check that you have your belongings",
        "Move away from the bus doorway",
      ],
      safetyNote: "Continue from the stop using a safe, accessible path.",
      steps: [
        {
          id: "arrived",
          title: "Arrived safely",
          description: destinationName,
          state: "DONE",
          icon: "CHECK",
        },
      ],
      actions: ["SHOW_STEPS", "REPEAT"],
      tone: "SUCCESS",
    };
  }

  const assistanceReady = context.assistanceCaseState === "READY";
  return {
    id: `alighting-${context.destinationReached ? "reached" : "prepare"}-${assistanceReady ? "ready" : "wait"}`,
    phase,
    stage,
    scene: "safeAlighting",
    visualKind: "ALIGHTING_SEQUENCE",
    title:
      assistanceReady && context.wheelchairAssistance
        ? "Ramp ready"
        : context.destinationReached
          ? assistanceReady || !context.wheelchairAssistance
            ? "Exit when the path is clear"
            : "Wait for assistance"
          : "Prepare to alight",
    summary: context.destinationReached
      ? `The bus has reached ${destinationName}.`
      : `${destinationName} is your destination.`,
    statusLine: context.wheelchairAssistance
      ? assistanceReady
        ? "Ramp assistance is ready."
        : "Wait for the ramp-ready message."
      : context.autonomousVehicle
        ? autonomyPassengerStatus(context.autonomousDriveState)
        : undefined,
    environmentalCues: [
      "Check that the bus has fully stopped",
      "Look for a clear pavement beyond the door",
    ],
    safetyNote:
      "Leave only after the bus has stopped and the door, ramp, or assistance path is ready.",
    steps: [
      {
        id: "bus-stopped-exit",
        title: "Bus stopped",
        description: "Remain onboard while the bus is moving.",
        state: context.destinationReached ? "DONE" : "CURRENT",
        icon: "BUS",
      },
      {
        id: "exit-ready",
        title: context.wheelchairAssistance ? "Ramp ready" : "Door ready",
        description: "Check the displayed equipment status.",
        state:
          assistanceReady || !context.wheelchairAssistance ? "DONE" : "CURRENT",
        icon: context.wheelchairAssistance ? "RAMP" : "CHECK",
      },
      {
        id: "exit-clear",
        title: "Exit carefully",
        description: "Move onto the clear pavement and away from the doorway.",
        state:
          context.destinationReached &&
          (assistanceReady || !context.wheelchairAssistance)
            ? "CURRENT"
            : "UPCOMING",
        icon: "EXIT",
      },
    ],
    actions: ["SHOW_STEPS", "REPEAT"],
    tone:
      context.destinationReached &&
      (assistanceReady || !context.wheelchairAssistance)
        ? "SUCCESS"
        : "ATTENTION",
  };
}

export function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

export function shortestSignedAngle(fromDegrees: number, toDegrees: number) {
  return (
    ((normalizeDegrees(toDegrees) - normalizeDegrees(fromDegrees) + 540) %
      360) -
    180
  );
}

export function smoothHeading(
  previousHeading: number | null | undefined,
  nextHeading: number,
  alpha = 0.22,
) {
  if (previousHeading === null || previousHeading === undefined) {
    return normalizeDegrees(nextHeading);
  }
  const boundedAlpha = Math.max(0, Math.min(1, alpha));
  return normalizeDegrees(
    previousHeading +
      shortestSignedAngle(previousHeading, nextHeading) * boundedAlpha,
  );
}

export function bearingBetweenCoordinates(
  from: RoutingCoordinate,
  to: RoutingCoordinate,
) {
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

export function directionFrame(options: {
  currentLocation?: RoutingCoordinate | null;
  target?: RoutingCoordinate | null;
  headingDegrees?: number | null;
  headingAccuracy?: number | null;
  locationAccuracyMeters?: number | null;
  distanceMeters?: number | null;
}): DirectionFrame {
  const locationAccuracy = options.locationAccuracyMeters;
  const locationQuality: LocationQuality =
    locationAccuracy === null ||
    locationAccuracy === undefined ||
    locationAccuracy <= 35
      ? "GOOD"
      : locationAccuracy <= 50
        ? "LOW"
        : "POOR";
  const headingAccuracy = options.headingAccuracy;
  const headingAvailable =
    options.headingDegrees !== null &&
    options.headingDegrees !== undefined &&
    Number.isFinite(options.headingDegrees);
  const headingQuality: HeadingQuality =
    !headingAvailable || headingAccuracy === 0
      ? "UNAVAILABLE"
      : headingAccuracy === null ||
          headingAccuracy === undefined ||
          headingAccuracy >= 2
        ? "GOOD"
        : "LOW";
  if (!options.currentLocation || !options.target) {
    return {
      targetBearing: null,
      relativeAngle: null,
      distanceMeters: options.distanceMeters ?? null,
      headingQuality,
      locationQuality,
      alignment: "UNAVAILABLE",
    };
  }
  const targetBearing = bearingBetweenCoordinates(
    options.currentLocation,
    options.target,
  );
  if (headingQuality === "UNAVAILABLE") {
    return {
      targetBearing,
      relativeAngle: null,
      distanceMeters: options.distanceMeters ?? null,
      headingQuality,
      locationQuality,
      alignment: "UNAVAILABLE",
    };
  }
  const relativeAngle = shortestSignedAngle(
    options.headingDegrees as number,
    targetBearing,
  );
  const alignment: DirectionAlignment =
    locationQuality === "POOR" ||
    headingQuality === "LOW" ||
    locationQuality === "LOW"
      ? "BROAD_DIRECTION"
      : Math.abs(relativeAngle) <= 15
        ? "ALIGNED"
        : relativeAngle < 0
          ? "TURN_LEFT"
          : "TURN_RIGHT";
  return {
    targetBearing,
    relativeAngle,
    distanceMeters: options.distanceMeters ?? null,
    headingQuality,
    locationQuality,
    alignment,
  };
}
