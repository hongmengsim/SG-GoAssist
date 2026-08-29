import type { AssistanceRequestStatus, JourneyPhase } from "@buspass/shared";
import type {
  BusPresenceConfidence,
  FocusedAssistState,
} from "../focusedAssist/types";

export type AssistantIntent =
  | { type: "GET_CURRENT_STOP" }
  | { type: "GET_BUS_AT_STOP" }
  | { type: "GET_ACTIVE_BUS" }
  | { type: "GET_ARRIVAL" }
  | { type: "GET_NEXT_STOP" }
  | { type: "GET_STOPS_REMAINING" }
  | { type: "GET_DESTINATION" }
  | { type: "REQUEST_RAMP"; serviceNo?: string }
  | { type: "REQUEST_EXTRA_TIME"; serviceNo?: string }
  | { type: "REQUEST_ALIGHTING_HELP" }
  | { type: "START_DIRECTIONS" }
  | { type: "STOP_GUIDANCE" }
  | { type: "REPEAT_GUIDANCE" }
  | { type: "END_JOURNEY" }
  | { type: "CONFIRM" }
  | { type: "CANCEL" }
  | { type: "HELP" }
  | { type: "UNKNOWN" };

export type AssistantIntentResolution = {
  intent: AssistantIntent;
  confidence: number;
  provider: "RULE_BASED" | "AI" | "FALLBACK";
};

export type AssistantStopContext = {
  busStopCode: string;
  description: string;
};

export type AssistantBusContext = {
  id: string;
  serviceNo: string;
  destination?: string;
  wheelchairAccessible?: boolean;
  confidence: BusPresenceConfidence;
};

export type AssistantContext = {
  journeyStage: JourneyPhase;
  hasActiveJourney: boolean;
  onboard: boolean;
  currentStop: AssistantStopContext | null;
  selectedService: string | null;
  destination: string | null;
  nextStop: string | null;
  stopsRemaining: number | null;
  busesAtStop: AssistantBusContext[];
  selectedBusAtStop: AssistantBusContext | null;
  busArrivalSeconds: number | null;
  rampStatus: FocusedAssistState;
  alightingAssistanceStatus: AssistanceRequestStatus | null;
  walkingGuidanceActive: boolean;
  walkingRouteAvailable: boolean;
  preferences: {
    wheelchairAssistance: boolean;
    spokenGuidance: boolean;
    simplifiedJourney: boolean;
    vibrationAlerts: boolean;
  };
};

export type AssistantActionResult = {
  ok: boolean;
  reason?: string;
};

export type AssistantTurnResult = {
  transcript: string;
  intent: AssistantIntent;
  response: string;
  provider: AssistantIntentResolution["provider"];
  spoken: boolean;
  actionExecuted: boolean;
  pendingConfirmation: boolean;
};

export type PendingAssistantAction = {
  intent:
    | { type: "REQUEST_RAMP"; busId: string; serviceNo: string }
    | { type: "REQUEST_EXTRA_TIME"; busId: string; serviceNo: string }
    | { type: "REQUEST_ALIGHTING_HELP"; destination: string }
    | { type: "END_JOURNEY"; serviceNo: string }
    | {
        type: "SELECT_BUS_FOR_RAMP" | "SELECT_BUS_FOR_EXTRA_TIME";
        candidates: AssistantBusContext[];
      };
  confirmationText: string;
  expiresAt: number;
};

export type AssistantInteractionState =
  "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";
