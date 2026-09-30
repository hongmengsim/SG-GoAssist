import { randomBytes, randomUUID } from "crypto";
import { getOperationsData } from "./operationsData";

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

export type StoredDiagnostic = AssistantDiagnostic & { deletionToken: string };

/** A purge looks at most this many diagnostics; the retention policy keeps far fewer. */
const PURGE_SCAN_LIMIT = 50_000;

const retentionMs = 30 * 24 * 60 * 60 * 1_000;

export async function saveAssistantDiagnostic(
  input: Omit<AssistantDiagnostic, "diagnosticId" | "createdAt" | "expiresAt">,
  now = new Date(),
) {
  await purgeExpiredAssistantDiagnostics(now);
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
  await (await getOperationsData()).diagnostics.put(stored);
  return { diagnostic: publicDiagnostic(stored), deletionToken };
}

export async function deleteAssistantDiagnostic(
  diagnosticId: string,
  deletionToken: string,
) {
  const table = (await getOperationsData()).diagnostics;
  const existing = await table.get(diagnosticId);
  if (!existing || existing.deletionToken !== deletionToken) return false;
  await table.delete(diagnosticId);
  return true;
}

export async function purgeExpiredAssistantDiagnostics(now = new Date()) {
  const table = (await getOperationsData()).diagnostics;
  for (const diagnostic of await table.list(PURGE_SCAN_LIMIT)) {
    if (new Date(diagnostic.expiresAt).getTime() <= now.getTime()) {
      await table.delete(diagnostic.diagnosticId);
    }
  }
}

export async function listAssistantDiagnosticsForTests() {
  await purgeExpiredAssistantDiagnostics();
  const table = (await getOperationsData()).diagnostics;
  return (await table.list(PURGE_SCAN_LIMIT)).map(publicDiagnostic);
}

export async function clearAssistantDiagnosticsForTests() {
  await (await getOperationsData()).diagnostics.clear();
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
