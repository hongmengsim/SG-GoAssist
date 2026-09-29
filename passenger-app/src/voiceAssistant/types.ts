import type {
  AssistanceRequestStatus,
  JourneyPhase,
  ServiceAdvisory,
  StopAmenityProfile,
} from "@buspass/shared";
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
  | { type: "GET_SHELTERED_ROUTE" }
  | { type: "GET_STOP_AMENITIES" }
  | { type: "GET_SERVICE_ADVISORIES" }
  | { type: "REQUEST_RAMP"; serviceNo?: string }
  | { type: "REQUEST_EXTRA_TIME"; serviceNo?: string }
  | { type: "REQUEST_ALIGHTING_HELP" }
  | { type: "START_DIRECTIONS" }
  | { type: "STOP_GUIDANCE" }
  | { type: "REPEAT_GUIDANCE" }
  | { type: "END_JOURNEY" }
  | { type: "REQUEST_OPERATOR_HELP" }
  | { type: "CONFIRM" }
  | { type: "CANCEL" }
  | { type: "HELP" }
  | { type: "UNKNOWN" };

export const assistantLocales = ["en-SG", "zh-SG", "ms-SG", "ta-SG"] as const;

export type AssistantLocale = (typeof assistantLocales)[number];

export type AssistantIntentResolution = {
  intent: AssistantIntent;
  confidence: number;
  provider: "RULE_BASED" | "AI" | "FALLBACK";
};

export type AssistantTurnResolution =
  | {
      kind: "COMMAND";
      intent: AssistantIntent;
      confidence: number;
      provider: AssistantIntentResolution["provider"];
    }
  | {
      kind: "ANSWER";
      message: string;
      evidenceIds: string[];
      sourceLabel: string;
      confidence: number;
      provider: "AI" | "FALLBACK";
    }
  | {
      kind: "CLARIFY";
      message: string;
      candidateIntents: AssistantIntent["type"][];
      confidence: number;
      provider: "AI" | "FALLBACK";
    }
  | {
      kind: "UNSUPPORTED";
      reason: string;
      provider: "AI" | "FALLBACK";
    };

export interface AssistantTurnProvider {
  readonly id: string;
  resolveTurn(
    request: AssistantTurnRequest,
  ): Promise<AssistantTurnResolution> | AssistantTurnResolution;
}

export type AssistantRuntimeReasonCode =
  | "NOT_PREPARED"
  | "UNSUPPORTED_PLATFORM"
  | "LOW_MEMORY"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_INTEGRITY_FAILED"
  | "INITIALIZATION_FAILED"
  | "INFERENCE_TIMEOUT"
  | "INFERENCE_FAILED"
  | "CIRCUIT_OPEN"
  | "RELEASED";

export type AssistantRuntimeStatus =
  | { mode: "LOADING"; attempt: number; consecutiveFailures: number }
  | {
      mode: "AI_READY";
      modelVersion: string;
      consecutiveFailures: number;
    }
  | {
      mode: "RULES_ONLY";
      reasonCode: AssistantRuntimeReasonCode;
      retryAllowed: boolean;
      consecutiveFailures: number;
      retryAt?: number;
    };

export type AssistantTurnRequest = {
  turnId: string;
  transcript: string;
  context: AssistantContext;
  deadlineAt: number;
  signal?: AbortSignal;
};

export type AssistantModelResolution =
  | {
      kind: "COMMAND";
      intent: AssistantIntent["type"];
      serviceNo?: string;
      confidence: number;
    }
  | {
      kind: "ARTICLE_SELECTION";
      evidenceId: string;
      confidence: number;
    }
  | {
      kind: "CLARIFY";
      candidateIntents: AssistantIntent["type"][];
      confidence: number;
    }
  | { kind: "UNSUPPORTED"; confidence: number };

export type AssistantKnowledgeArticle = {
  id: string;
  locale: AssistantLocale;
  title: string;
  body: string;
  keywords: string[];
  safetyClass: "GENERAL" | "REVIEWED_SAFETY";
  sourceLabel: string;
  validUntil?: string;
};

export type AssistantConversationMessage = {
  role: "user" | "assistant";
  text: string;
  at: number;
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

export type AssistantRouteOptionContext = {
  id: string;
  title: string;
  serviceNo: string;
  walkingMinutes: number;
  shelterCoverage: "FULL" | "PARTIAL" | "UNVERIFIED";
};

export type AssistantContext = {
  locale?: AssistantLocale;
  conversationHistory?: AssistantConversationMessage[];
  journeyId?: string | null;
  revision?: number;
  activeCaseId?: string | null;
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
  routeOptions?: AssistantRouteOptionContext[];
  currentStopAmenities?: StopAmenityProfile | null;
  serviceAdvisories?: ServiceAdvisory[];
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
  turnId?: string;
  transcript: string;
  intent: AssistantIntent;
  response: string;
  provider: AssistantIntentResolution["provider"];
  spoken: boolean;
  actionExecuted: boolean;
  pendingConfirmation: boolean;
  resolutionKind?: AssistantTurnResolution["kind"];
  sourceLabel?: string;
  evidenceIds?: string[];
  confidence?: number;
  latencyMs?: number;
  fallbackReason?: string;
};

export type PendingAssistantAction = {
  intent:
    | { type: "REQUEST_RAMP"; busId: string; serviceNo: string }
    | { type: "REQUEST_EXTRA_TIME"; busId: string; serviceNo: string }
    | { type: "REQUEST_ALIGHTING_HELP"; destination: string }
    | { type: "END_JOURNEY"; serviceNo: string }
    | { type: "START_DIRECTIONS" }
    | { type: "STOP_GUIDANCE" }
    | { type: "REQUEST_OPERATOR_HELP"; reason: string }
    | {
        type: "SELECT_BUS_FOR_RAMP" | "SELECT_BUS_FOR_EXTRA_TIME";
        candidates: AssistantBusContext[];
      };
  confirmationText: string;
  expiresAt: number;
  contextFingerprint: string;
};

export type AssistantInteractionState =
  | "IDLE"
  | "PREPARING"
  | "LISTENING"
  | "FINALISING"
  | "PROCESSING"
  | "SPEAKING"
  | "FAILED";

export type SpeechRecognitionSessionState =
  "PREPARING" | "LISTENING" | "FINALISING";

export type SpeechRecognitionSession = {
  onStateChange?: (state: SpeechRecognitionSessionState) => void;
};

export type AssistantHealthSnapshot = {
  turns: number;
  resolutionCounts: Record<string, number>;
  fallbackCounts: Record<string, number>;
  latencyBands: Record<"FAST" | "NORMAL" | "SLOW", number>;
  modelFailures: number;
  confirmationRejections: number;
  helpful: number;
  unhelpful: number;
};
