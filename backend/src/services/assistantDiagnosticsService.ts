import { randomBytes, randomUUID } from "crypto";

export type AssistantDiagnostic = {
  diagnosticId: string;
  locale: "en-SG" | "zh-SG" | "ms-SG" | "ta-SG";
  redactedTranscript: string;
  redactedResponse: string;
  resolutionType: "COMMAND" | "ANSWER" | "CLARIFY" | "UNSUPPORTED";
  confidenceBand: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  latencyMs?: number;
  fallbackReason?: string;
  appVersion: string;
  modelVersion: string;
  createdAt: string;
  expiresAt: string;
};

type StoredDiagnostic = AssistantDiagnostic & { deletionToken: string };

const retentionMs = 30 * 24 * 60 * 60 * 1_000;
const diagnostics = new Map<string, StoredDiagnostic>();

export function saveAssistantDiagnostic(
  input: Omit<AssistantDiagnostic, "diagnosticId" | "createdAt" | "expiresAt">,
  now = new Date(),
) {
  purgeExpiredAssistantDiagnostics(now);
  const diagnosticId = randomUUID();
  const deletionToken = randomBytes(24).toString("base64url");
  const stored: StoredDiagnostic = {
    ...input,
    redactedTranscript: defensivelyRedact(input.redactedTranscript),
    redactedResponse: defensivelyRedact(input.redactedResponse),
    fallbackReason: input.fallbackReason
      ? defensivelyRedact(input.fallbackReason)
      : undefined,
    diagnosticId,
    deletionToken,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + retentionMs).toISOString(),
  };
  diagnostics.set(diagnosticId, stored);
  return { diagnostic: publicDiagnostic(stored), deletionToken };
}

export function deleteAssistantDiagnostic(
  diagnosticId: string,
  deletionToken: string,
) {
  const existing = diagnostics.get(diagnosticId);
  if (!existing || existing.deletionToken !== deletionToken) return false;
  return diagnostics.delete(diagnosticId);
}

export function purgeExpiredAssistantDiagnostics(now = new Date()) {
  for (const [id, diagnostic] of diagnostics) {
    if (new Date(diagnostic.expiresAt).getTime() <= now.getTime()) {
      diagnostics.delete(id);
    }
  }
}

export function listAssistantDiagnosticsForTests() {
  purgeExpiredAssistantDiagnostics();
  return [...diagnostics.values()].map(publicDiagnostic);
}

export function clearAssistantDiagnosticsForTests() {
  diagnostics.clear();
}

function publicDiagnostic({
  deletionToken: _token,
  ...diagnostic
}: StoredDiagnostic) {
  return diagnostic;
}

function defensivelyRedact(value: string) {
  return value
    .replace(/https?:\/\/\S+|www\.\S+/giu, "[url]")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu, "[email]")
    .replace(/\b\d+[A-Za-z]?\b/gu, "[number]")
    .slice(0, 1_000);
}
