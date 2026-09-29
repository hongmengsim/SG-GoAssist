import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/integration";
import {
  clearAssistantDiagnosticsForTests,
  listAssistantDiagnosticsForTests,
} from "../services/assistantDiagnosticsService";

test("assistant diagnostics require explicit consent, redact again and can be deleted", async () => {
  clearAssistantDiagnosticsForTests();
  const server = await startTestServer();
  try {
    const denied = await fetch(`${server.baseUrl}/api/assistant/diagnostics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(false)),
    });
    assert.equal(denied.status, 400);
    assert.equal(listAssistantDiagnosticsForTests().length, 0);

    const accepted = await fetch(
      `${server.baseUrl}/api/assistant/diagnostics`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(true)),
      },
    );
    assert.equal(accepted.status, 201);
    const receipt = (await accepted.json()) as {
      diagnosticId: string;
      deletionToken: string;
      expiresAt: string;
    };
    const stored = listAssistantDiagnosticsForTests()[0];
    assert.match(stored.redactedTranscript, /\[email\]/);
    assert.match(stored.redactedTranscript, /\[number\]/);
    assert.equal(
      new Date(receipt.expiresAt).getTime() -
        new Date(stored.createdAt).getTime(),
      30 * 24 * 60 * 60 * 1_000,
    );

    const removed = await fetch(
      `${server.baseUrl}/api/assistant/diagnostics/${receipt.diagnosticId}`,
      {
        method: "DELETE",
        headers: { "x-diagnostic-deletion-token": receipt.deletionToken },
      },
    );
    assert.equal(removed.status, 204);
    assert.equal(listAssistantDiagnosticsForTests().length, 0);
  } finally {
    clearAssistantDiagnosticsForTests();
    await server.close();
  }
});

function payload(consentConfirmed: boolean) {
  return {
    consentConfirmed,
    locale: "en-SG",
    redactedTranscript: "Email rider@example.com about Service 151",
    redactedResponse: "Service 151 is arriving",
    resolutionType: "COMMAND",
    confidenceBand: "HIGH",
    latencyMs: 120,
    appVersion: "0.1.0",
    modelVersion: "rules-only",
  };
}
