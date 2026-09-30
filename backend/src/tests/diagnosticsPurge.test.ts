import test from "node:test";
import assert from "node:assert/strict";
import { getOperationsData } from "../services/operationsData";
import {
  clearAssistantDiagnosticsForTests,
  deleteAssistantDiagnostic,
  purgeExpiredAssistantDiagnostics,
  saveAssistantDiagnostic,
} from "../services/assistantDiagnosticsService";

const DAY = 24 * 60 * 60 * 1000;
const input = {
  locale: "en-SG" as const,
  redactedTranscript: "hello",
  redactedResponse: "hi",
  resolutionType: "ANSWER" as const,
  confidenceBand: "HIGH" as const,
  appVersion: "1",
  modelVersion: "1",
};

test("only a hash of the deletion token is stored, and the token still deletes", async () => {
  await clearAssistantDiagnosticsForTests();
  const { diagnostic, deletionToken } = await saveAssistantDiagnostic(input);
  const stored = (await (await getOperationsData()).diagnostics.list(10))[0];
  assert.equal(JSON.stringify(stored).includes(deletionToken), false);
  assert.equal(
    await deleteAssistantDiagnostic(diagnostic.diagnosticId, "wrong"),
    false,
  );
  assert.equal(
    await deleteAssistantDiagnostic(diagnostic.diagnosticId, deletionToken),
    true,
  );
});

test("a purge removes the expired diagnostics from the oldest end and leaves the rest", async () => {
  await clearAssistantDiagnosticsForTests();
  const start = Date.parse("2026-01-01T00:00:00Z");
  for (let n = 0; n < 5; n += 1) {
    await saveAssistantDiagnostic(input, new Date(start + n * DAY));
  }
  // 31 days after the first: the first two (days 0 and 1) have expired.
  await purgeExpiredAssistantDiagnostics(new Date(start + 31.5 * DAY));
  const left = await (await getOperationsData()).diagnostics.count();
  assert.equal(left, 3);
});

test("saving does not read every stored diagnostic", async () => {
  await clearAssistantDiagnosticsForTests();
  const table = (await getOperationsData()).diagnostics;
  for (let n = 0; n < 3; n += 1) await saveAssistantDiagnostic(input);
  const limits: number[] = [];
  const original = table.list.bind(table);
  table.list = (limit: number) => {
    limits.push(limit);
    return original(limit);
  };
  try {
    await saveAssistantDiagnostic(input);
  } finally {
    table.list = original;
  }
  assert.ok(
    limits.every((limit) => limit <= 500),
    `read limits ${limits}`,
  );
});
