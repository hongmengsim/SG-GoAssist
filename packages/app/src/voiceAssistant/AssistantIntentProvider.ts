import type {
  AssistantContext,
  AssistantIntent,
  AssistantIntentResolution,
} from "./types";

export interface AssistantIntentProvider {
  readonly id: string;
  resolveIntent(
    transcript: string,
    context: AssistantContext,
  ): Promise<AssistantIntentResolution> | AssistantIntentResolution;
}

export type AIIntentProvider = AssistantIntentProvider;

export class RuleBasedIntentProvider implements AssistantIntentProvider {
  readonly id = "rule-based";

  resolveIntent(
    transcript: string,
    _context?: AssistantContext,
  ): AssistantIntentResolution {
    return {
      intent: resolveRuleBasedIntent(transcript),
      confidence: 1,
      provider: "RULE_BASED",
    };
  }
}

export class FallbackAssistantIntentProvider implements AssistantIntentProvider {
  readonly id = "rule-based-with-optional-ai";

  constructor(
    private readonly rules = new RuleBasedIntentProvider(),
    private readonly aiProvider?: AssistantIntentProvider | null,
  ) {}

  async resolveIntent(transcript: string, context: AssistantContext) {
    const deterministic = await this.rules.resolveIntent(transcript, context);
    if (deterministic.intent.type !== "UNKNOWN" || !this.aiProvider) {
      return deterministic;
    }
    try {
      const aiResult = await this.aiProvider.resolveIntent(transcript, context);
      return validateStructuredIntentResult(aiResult);
    } catch {
      return unknownResolution("FALLBACK");
    }
  }
}

const intentTypes = new Set<AssistantIntent["type"]>([
  "GET_CURRENT_STOP",
  "GET_BUS_AT_STOP",
  "GET_ACTIVE_BUS",
  "GET_ARRIVAL",
  "GET_NEXT_STOP",
  "GET_STOPS_REMAINING",
  "GET_DESTINATION",
  "REQUEST_RAMP",
  "REQUEST_EXTRA_TIME",
  "REQUEST_ALIGHTING_HELP",
  "START_DIRECTIONS",
  "STOP_GUIDANCE",
  "REPEAT_GUIDANCE",
  "END_JOURNEY",
  "CONFIRM",
  "CANCEL",
  "HELP",
  "UNKNOWN",
]);

export function validateStructuredIntentResult(
  value: unknown,
): AssistantIntentResolution {
  if (!value || typeof value !== "object") return unknownResolution("FALLBACK");
  const record = value as Record<string, unknown>;
  const intentRecord =
    typeof record.intent === "string"
      ? { type: record.intent, serviceNo: record.serviceNo }
      : record.intent && typeof record.intent === "object"
        ? (record.intent as Record<string, unknown>)
        : null;
  if (!intentRecord) return unknownResolution("FALLBACK");
  if (
    typeof intentRecord.type !== "string" ||
    !intentTypes.has(intentRecord.type as AssistantIntent["type"]) ||
    typeof record.confidence !== "number" ||
    !Number.isFinite(record.confidence) ||
    record.confidence < 0 ||
    record.confidence > 1
  ) {
    return unknownResolution("FALLBACK");
  }
  const serviceNo = intentRecord.serviceNo;
  if (
    serviceNo !== undefined &&
    (typeof serviceNo !== "string" || !/^[A-Z0-9]+$/i.test(serviceNo))
  ) {
    return unknownResolution("FALLBACK");
  }
  return {
    intent: {
      type: intentRecord.type,
      ...(typeof serviceNo === "string"
        ? { serviceNo: serviceNo.toUpperCase() }
        : {}),
    } as AssistantIntent,
    confidence: record.confidence,
    provider: "AI",
  };
}

export function resolveRuleBasedIntent(transcript: string): AssistantIntent {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return { type: "UNKNOWN" };

  if (/^(yes|yeah|yep|confirm|please do|go ahead|do it)$/.test(normalized)) {
    return { type: "CONFIRM" };
  }
  if (/^(no|nope|cancel|do not|don't|never mind|stop)$/.test(normalized)) {
    return { type: "CANCEL" };
  }
  if (
    /\b(stop|end|cancel)\b.*\b(guidance|directions|navigation)\b/.test(
      normalized,
    )
  ) {
    return { type: "STOP_GUIDANCE" };
  }
  if (/\b(repeat|say that again|repeat that|again please)\b/.test(normalized)) {
    return { type: "REPEAT_GUIDANCE" };
  }
  if (
    /\b(help|assist)\b.*\b(get off|getting off|alight|disembark|leave the bus)\b/.test(
      normalized,
    )
  ) {
    return { type: "REQUEST_ALIGHTING_HELP" };
  }
  if (
    /\b(request|need|give me|more|extra)\b.*\b(boarding time|time to board|dwell time)\b/.test(
      normalized,
    )
  ) {
    return {
      type: "REQUEST_EXTRA_TIME",
      serviceNo: extractServiceNumber(normalized),
    };
  }
  if (
    /\b(deploy|request|need|send|use|provide)\b.*\b(ramp|wheelchair ramp|boarding assistance)\b/.test(
      normalized,
    ) ||
    /\b(ramp|wheelchair ramp)\b.*\b(please|assistance|request)\b/.test(
      normalized,
    )
  ) {
    return {
      type: "REQUEST_RAMP",
      serviceNo: extractServiceNumber(normalized),
    };
  }
  if (/\b(end|finish|stop)\b.*\b(my )?journey\b/.test(normalized)) {
    return { type: "END_JOURNEY" };
  }
  if (
    /\b(guide|directions|navigate|take me)\b.*\b(bus )?stop\b/.test(normalized)
  ) {
    return { type: "START_DIRECTIONS" };
  }
  if (/\bwhat bus\b.*\b(waiting|taking|my bus)\b/.test(normalized)) {
    return { type: "GET_ACTIVE_BUS" };
  }
  if (
    /\b(what|which) (bus|buses)\b.*\b(here|at (the|my|this) stop)\b/.test(
      normalized,
    )
  ) {
    return { type: "GET_BUS_AT_STOP" };
  }
  if (
    /\b(when|how long|what time)\b.*\b(bus|arriv|coming)\b/.test(normalized)
  ) {
    return { type: "GET_ARRIVAL" };
  }
  if (/\b(next stop|what stop is next)\b/.test(normalized)) {
    return { type: "GET_NEXT_STOP" };
  }
  if (
    /\b(how many stops|stops (are )?left|nearly there|almost there)\b/.test(
      normalized,
    )
  ) {
    return { type: "GET_STOPS_REMAINING" };
  }
  if (
    /\b(where|what stop)\b.*\b(getting off|destination|alight)\b/.test(
      normalized,
    )
  ) {
    return { type: "GET_DESTINATION" };
  }
  if (/\b(where am i|current stop|which stop am i at)\b/.test(normalized)) {
    return { type: "GET_CURRENT_STOP" };
  }
  if (/^(help|help me|what can i (say|ask|do))$/.test(normalized)) {
    return { type: "HELP" };
  }
  return { type: "UNKNOWN" };
}

function normalizeTranscript(transcript: string) {
  return transcript
    .trim()
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ");
}

function extractServiceNumber(transcript: string) {
  return transcript
    .match(/\b(?:service|bus)\s+([a-z]?\d+[a-z]?)\b/i)?.[1]
    ?.toUpperCase();
}

function unknownResolution(
  provider: AssistantIntentResolution["provider"],
): AssistantIntentResolution {
  return { intent: { type: "UNKNOWN" }, confidence: 0, provider };
}
