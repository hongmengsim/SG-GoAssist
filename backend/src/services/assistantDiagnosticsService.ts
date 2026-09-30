import { createHash, randomBytes, randomUUID } from "crypto";
import { safeEqual } from "../routes/auth";
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

/** Only a hash of the deletion token is kept, so a copy of the store cannot delete anyone's record. */
export type StoredDiagnostic = AssistantDiagnostic & {
  deletionTokenHash: string;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/** Diagnostics are read for a purge or a listing in batches of this size. */
const PURGE_BATCH = 200;
const LIST_LIMIT = 50_000;

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
    deletionTokenHash: hashToken(deletionToken),
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
  if (
    !existing ||
    !safeEqual(existing.deletionTokenHash, hashToken(deletionToken))
  )
    return false;
  await table.delete(diagnosticId);
  return true;
}

/**
 * Every diagnostic lives the same 30 days, so they expire in the order they were saved: the
 * purge reads from the oldest end and stops at the first one still alive. Its cost follows how
 * many have expired, not how many are stored.
 */
export async function purgeExpiredAssistantDiagnostics(now = new Date()) {
  const table = (await getOperationsData()).diagnostics;
  for (;;) {
    const batch = await table.list(PURGE_BATCH);
    const expired = batch.filter(
      (item) => new Date(item.expiresAt).getTime() <= now.getTime(),
    );
    for (const item of expired) await table.delete(item.diagnosticId);
    if (expired.length < PURGE_BATCH) return;
  }
}

export async function listAssistantDiagnosticsForTests() {
  await purgeExpiredAssistantDiagnostics();
  const table = (await getOperationsData()).diagnostics;
  return (await table.list(LIST_LIMIT)).map(publicDiagnostic);
}

export async function clearAssistantDiagnosticsForTests() {
  await (await getOperationsData()).diagnostics.clear();
}

function publicDiagnostic({
  deletionTokenHash: _hash,
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
