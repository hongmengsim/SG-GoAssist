import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";
import type {
  AssistantContext,
  AssistantLocale,
  AssistantRuntimeStatus,
  AssistantTurnResult,
} from "./types";

const deletionReceiptsKey = "goassist:assistant-diagnostic-deletions:v1";

type DeletionReceipt = { diagnosticId: string; deletionToken: string };

export function createAssistantDiagnosticPreview(
  turn: AssistantTurnResult,
  context: AssistantContext,
) {
  const sensitiveValues = [
    context.currentStop?.busStopCode,
    context.currentStop?.description,
    context.selectedService,
    context.destination,
    context.nextStop,
    ...context.busesAtStop.flatMap((bus) => [bus.id, bus.serviceNo]),
  ].filter((value): value is string => Boolean(value));
  return {
    redactedTranscript: redactAssistantText(turn.transcript, sensitiveValues),
    redactedResponse: redactAssistantText(turn.response, sensitiveValues),
  };
}

export function redactAssistantText(
  text: string,
  sensitiveValues: string[] = [],
) {
  let redacted = text;
  for (const value of [...sensitiveValues].sort(
    (a, b) => b.length - a.length,
  )) {
    redacted = redacted.replaceAll(value, "[journey value]");
  }
  return redacted
    .replace(/https?:\/\/\S+|www\.\S+/giu, "[url]")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu, "[email]")
    .replace(/\b\d+[A-Za-z]?\b/gu, "[number]")
    .slice(0, 1_000);
}

export async function submitAssistantDiagnostic(input: {
  turn: AssistantTurnResult;
  context: AssistantContext;
  locale: AssistantLocale;
  runtimeStatus: AssistantRuntimeStatus;
}) {
  const preview = createAssistantDiagnosticPreview(input.turn, input.context);
  const response = await fetch(`${API_BASE_URL}/api/assistant/diagnostics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consentConfirmed: true,
      locale: input.locale,
      ...preview,
      resolutionType: input.turn.resolutionKind ?? "COMMAND",
      confidenceBand: confidenceBand(input.turn.confidence),
      latencyMs: input.turn.latencyMs,
      fallbackReason: input.turn.fallbackReason,
      appVersion: "0.1.0",
      modelVersion:
        input.runtimeStatus.mode === "AI_READY"
          ? input.runtimeStatus.modelVersion
          : "rules-only",
    }),
  });
  if (!response.ok)
    throw new Error("The diagnostic exchange could not be shared.");
  const receipt = (await response.json()) as DeletionReceipt;
  const receipts = await readReceipts();
  await AsyncStorage.setItem(
    deletionReceiptsKey,
    JSON.stringify([...receipts, receipt]),
  );
}

export async function withdrawAssistantDiagnostics() {
  const receipts = await readReceipts();
  await Promise.allSettled(
    receipts.map((receipt) =>
      fetch(
        `${API_BASE_URL}/api/assistant/diagnostics/${receipt.diagnosticId}`,
        {
          method: "DELETE",
          headers: { "x-diagnostic-deletion-token": receipt.deletionToken },
        },
      ),
    ),
  );
  await AsyncStorage.removeItem(deletionReceiptsKey);
}

async function readReceipts(): Promise<DeletionReceipt[]> {
  try {
    const value = await AsyncStorage.getItem(deletionReceiptsKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function confidenceBand(value?: number) {
  if (typeof value !== "number") return "UNKNOWN";
  if (value >= 0.85) return "HIGH";
  if (value >= 0.6) return "MEDIUM";
  return "LOW";
}
