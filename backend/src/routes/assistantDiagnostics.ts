import { Router, type Request, type Response } from "express";
import {
  deleteAssistantDiagnostic,
  saveAssistantDiagnostic,
} from "../services/assistantDiagnosticsService";

const locales = new Set(["en-SG", "zh-SG", "ms-SG", "ta-SG"]);
const resolutionTypes = new Set([
  "COMMAND",
  "ANSWER",
  "CLARIFY",
  "UNSUPPORTED",
]);
const confidenceBands = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);

export const router = Router();

router.post("/diagnostics", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (
    body.consentConfirmed !== true ||
    typeof body.locale !== "string" ||
    !locales.has(body.locale) ||
    typeof body.redactedTranscript !== "string" ||
    typeof body.redactedResponse !== "string" ||
    typeof body.resolutionType !== "string" ||
    !resolutionTypes.has(body.resolutionType) ||
    typeof body.confidenceBand !== "string" ||
    !confidenceBands.has(body.confidenceBand) ||
    typeof body.appVersion !== "string" ||
    typeof body.modelVersion !== "string"
  ) {
    res
      .status(400)
      .json({ error: "Invalid or unconfirmed diagnostic payload" });
    return;
  }

  const saved = saveAssistantDiagnostic({
    locale: body.locale as "en-SG" | "zh-SG" | "ms-SG" | "ta-SG",
    redactedTranscript: body.redactedTranscript.slice(0, 1_000),
    redactedResponse: body.redactedResponse.slice(0, 1_000),
    resolutionType: body.resolutionType as
      "COMMAND" | "ANSWER" | "CLARIFY" | "UNSUPPORTED",
    confidenceBand: body.confidenceBand as
      "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN",
    latencyMs:
      typeof body.latencyMs === "number"
        ? Math.max(0, Math.min(120_000, body.latencyMs))
        : undefined,
    fallbackReason:
      typeof body.fallbackReason === "string"
        ? body.fallbackReason.slice(0, 500)
        : undefined,
    appVersion: body.appVersion.slice(0, 80),
    modelVersion: body.modelVersion.slice(0, 80),
  });
  res.status(201).json({
    diagnosticId: saved.diagnostic.diagnosticId,
    deletionToken: saved.deletionToken,
    expiresAt: saved.diagnostic.expiresAt,
  });
});

router.delete("/diagnostics/:diagnosticId", (req: Request, res: Response) => {
  const token = req.header("x-diagnostic-deletion-token") ?? "";
  if (!deleteAssistantDiagnostic(req.params.diagnosticId, token)) {
    res.status(404).json({ error: "Diagnostic not found" });
    return;
  }
  res.status(204).send();
});
