import {
  assistantIntentTypes,
  isAssistantIntentType,
  resolvePolicyIntent,
} from "./assistantIntentPolicies";
import { normalizeAssistantLocale } from "./localization";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantIntentResolution,
  AssistantLocale,
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
    context?: AssistantContext,
  ): AssistantIntentResolution {
    return {
      intent: resolveRuleBasedIntent(
        transcript,
        normalizeAssistantLocale(context?.locale),
      ),
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
      return validateStructuredIntentResult(
        await this.aiProvider.resolveIntent(transcript, context),
      );
    } catch {
      return unknownResolution("FALLBACK");
    }
  }
}

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
  if (
    !intentRecord ||
    !isAssistantIntentType(intentRecord.type) ||
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

export function resolveRuleBasedIntent(
  transcript: string,
  locale: AssistantLocale = "en-SG",
): AssistantIntent {
  if (!transcript.trim()) return { type: "UNKNOWN" };
  return resolvePolicyIntent(transcript, locale);
}

export { assistantIntentTypes };

function unknownResolution(
  provider: AssistantIntentResolution["provider"],
): AssistantIntentResolution {
  return { intent: { type: "UNKNOWN" }, confidence: 0, provider };
}
