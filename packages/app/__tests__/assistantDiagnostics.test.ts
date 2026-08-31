import {
  createAssistantDiagnosticPreview,
  redactAssistantText,
} from "../src/voiceAssistant/assistantDiagnostics";
import type {
  AssistantContext,
  AssistantTurnResult,
} from "../src/voiceAssistant/types";

it("removes contact details, URLs, numbers and live journey values", () => {
  expect(
    redactAssistantText(
      "Email rider@example.com, open https://example.com and take Service 151.",
      ["Service 151"],
    ),
  ).toBe("Email [email], open [url] and take [journey value].");
});

it("creates a redacted preview without changing the original exchange", () => {
  const turn: AssistantTurnResult = {
    transcript: "Is Service 151 at Stop 16171?",
    intent: { type: "GET_BUS_AT_STOP" },
    response: "Service 151 is at Yusof Ishak House.",
    provider: "RULE_BASED",
    spoken: false,
    actionExecuted: false,
    pendingConfirmation: false,
  };
  const context = {
    currentStop: { busStopCode: "16171", description: "Yusof Ishak House" },
    selectedService: "151",
    busesAtStop: [],
  } as unknown as AssistantContext;
  const preview = createAssistantDiagnosticPreview(turn, context);
  expect(preview.redactedTranscript).not.toContain("151");
  expect(preview.redactedTranscript).not.toContain("16171");
  expect(preview.redactedResponse).not.toContain("Yusof Ishak House");
  expect(turn.transcript).toContain("16171");
});
