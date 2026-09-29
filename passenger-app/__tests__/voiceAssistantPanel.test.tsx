import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { VoiceAssistantPanel } from "../src/voiceAssistant/VoiceAssistantPanel";
import type { VoiceAssistantController } from "../src/voiceAssistant/VoiceAssistantController";
import {
  SpeechRecognitionProviderError,
  type SpeechRecognitionProvider,
} from "../src/voiceAssistant/SpeechRecognitionProvider";
import type { AssistantTurnResult } from "../src/voiceAssistant/types";

function turn(
  transcript: string,
  response: string,
  spoken = false,
): AssistantTurnResult {
  return {
    transcript,
    intent: { type: "GET_BUS_AT_STOP" },
    response,
    provider: "RULE_BASED",
    spoken,
    actionExecuted: false,
    pendingConfirmation: false,
  };
}

function renderPanel({
  provider,
  processTranscript = jest.fn(async (transcript: string) =>
    turn(transcript, "Service 151 is currently at your stop."),
  ),
  guidanceSpeaking = false,
}: {
  provider: SpeechRecognitionProvider;
  processTranscript?: jest.Mock;
  guidanceSpeaking?: boolean;
}) {
  const controller = {
    processTranscript,
  } as unknown as VoiceAssistantController;
  return {
    processTranscript,
    ...render(
      <VoiceAssistantPanel
        controller={controller}
        recognitionProvider={provider}
        guidanceSpeaking={guidanceSpeaking}
        prominent
        lightMode
        highContrast={false}
      />,
    ),
  };
}

it("shows listening and processing states before a visible grounded response", async () => {
  let resolveRecognition!: (value: string) => void;
  let resolveController!: (value: AssistantTurnResult) => void;
  const provider: SpeechRecognitionProvider = {
    id: "mock-speech",
    isSupported: () => true,
    start: jest.fn(
      (_locale, session) => {
        session?.onStateChange?.("LISTENING");
        return new Promise<string>(
          (resolve) => (resolveRecognition = resolve),
        );
      },
    ),
    stop: jest.fn(),
  };
  const processTranscript = jest.fn(
    () =>
      new Promise<AssistantTurnResult>(
        (resolve) => (resolveController = resolve),
      ),
  );
  renderPanel({ provider, processTranscript });

  fireEvent.press(screen.getByLabelText("Talk to GoAssist"));
  expect(screen.getByText("Listening — speak now")).toBeTruthy();
  expect(
    screen.getByText("Speak now. Listening for up to 15 seconds."),
  ).toBeTruthy();
  await act(async () => resolveRecognition("What bus is here?"));
  await screen.findByText("Thinking…");
  await act(async () =>
    resolveController(
      turn("What bus is here?", "Service 151 is currently at your stop."),
    ),
  );

  expect(processTranscript).toHaveBeenCalledWith("What bus is here?");
  expect(await screen.findByText("What bus is here?")).toBeTruthy();
  expect(
    screen.getByText("Service 151 is currently at your stop."),
  ).toBeTruthy();
});

it("keeps a typed command fallback when browser recognition is unsupported", async () => {
  const provider: SpeechRecognitionProvider = {
    id: "unsupported",
    isSupported: () => false,
    start: jest.fn(async () => ""),
    stop: jest.fn(),
  };
  const { processTranscript } = renderPanel({ provider });

  expect(screen.getByLabelText("Type to GoAssist")).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText("Ask GoAssist"), "Where am I?");
  fireEvent.press(screen.getByLabelText("Send to GoAssist"));

  await waitFor(() =>
    expect(processTranscript).toHaveBeenCalledWith("Where am I?"),
  );
  expect(await screen.findByText("Where am I?")).toBeTruthy();
});

it("prepares the private model only after an explicit assistant request", async () => {
  const provider: SpeechRecognitionProvider = {
    id: "unsupported",
    isSupported: () => false,
    start: jest.fn(async () => ""),
    stop: jest.fn(),
  };
  let resolvePreparation!: (value: any) => void;
  const prepareAssistant = jest.fn(
    () => new Promise((resolve) => (resolvePreparation = resolve)),
  );
  const controller = {
    processTranscript: jest.fn(async (transcript: string) =>
      turn(transcript, "Basic help remains available."),
    ),
  } as unknown as VoiceAssistantController;
  render(
    <VoiceAssistantPanel
      controller={controller}
      recognitionProvider={provider}
      guidanceSpeaking={false}
      prominent
      lightMode
      highContrast={false}
      prepareAssistant={prepareAssistant}
    />,
  );

  expect(prepareAssistant).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("Ask GoAssist"), "Help me");
  fireEvent.press(screen.getByLabelText("Send to GoAssist"));
  await waitFor(() => expect(prepareAssistant).toHaveBeenCalledTimes(1));
  expect(controller.processTranscript).toHaveBeenCalledWith("Help me");
  await act(async () =>
    resolvePreparation({
      mode: "AI_READY",
      modelVersion: "test-model",
      consecutiveFailures: 0,
    }),
  );
});

it("shows a microphone error and permits another push-to-talk attempt", async () => {
  const provider: SpeechRecognitionProvider = {
    id: "failing-speech",
    isSupported: () => true,
    start: jest.fn(async () => {
      throw new SpeechRecognitionProviderError(
        "NO_SPEECH",
        "I couldn't hear that.",
      );
    }),
    stop: jest.fn(),
  };
  renderPanel({ provider });

  fireEvent.press(screen.getByLabelText("Talk to GoAssist"));
  expect(
    await screen.findByText(
      "I couldn’t hear speech. Try again and wait for Listening, or type below.",
    ),
  ).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Talk to GoAssist"));
  await waitFor(() => expect(provider.start).toHaveBeenCalledTimes(2));
});

it("shows private-runtime, language and explicit diagnostics controls", () => {
  const provider: SpeechRecognitionProvider = {
    id: "unsupported",
    isSupported: () => false,
    start: jest.fn(async () => ""),
    stop: jest.fn(),
  };
  const onLocaleChange = jest.fn();
  const onDiagnosticsConsentChange = jest.fn();
  const controller = {
    processTranscript: jest.fn(),
  } as unknown as VoiceAssistantController;
  render(
    <VoiceAssistantPanel
      controller={controller}
      recognitionProvider={provider}
      guidanceSpeaking={false}
      prominent
      lightMode
      highContrast={false}
      locale="en-SG"
      runtimeStatus={{ mode: "AI_READY", modelVersion: "test-model" }}
      diagnosticsConsent={false}
      onLocaleChange={onLocaleChange}
      onDiagnosticsConsentChange={onDiagnosticsConsentChange}
    />,
  );

  expect(screen.getByText("Private assistant ready")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("中文"));
  expect(onLocaleChange).toHaveBeenCalledWith("zh-SG");
  fireEvent.press(screen.getByLabelText("Optional diagnostics off"));
  expect(onDiagnosticsConsentChange).toHaveBeenCalledWith(true);
});

it("offers an explicit operator fallback without sending it automatically", async () => {
  const provider: SpeechRecognitionProvider = {
    id: "unsupported",
    isSupported: () => false,
    start: jest.fn(async () => ""),
    stop: jest.fn(),
  };
  const processTranscript = jest.fn(async (transcript: string) => ({
    ...turn(transcript, "I don’t have verified information for that yet."),
    resolutionKind: "UNSUPPORTED" as const,
  }));
  const controller = {
    processTranscript,
    recordTurnFeedback: jest.fn(),
    getAssistantContext: () => ({ hasActiveJourney: true }),
  } as unknown as VoiceAssistantController;
  render(
    <VoiceAssistantPanel
      controller={controller}
      recognitionProvider={provider}
      guidanceSpeaking={false}
      prominent
      lightMode
      highContrast={false}
    />,
  );

  fireEvent.changeText(screen.getByLabelText("Ask GoAssist"), "Unknown need");
  fireEvent.press(screen.getByLabelText("Send to GoAssist"));
  expect(await screen.findByText("Ask an operator")).toBeTruthy();
  expect(processTranscript).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText("Ask an operator"));
  await waitFor(() =>
    expect(processTranscript).toHaveBeenLastCalledWith(
      "Ask an operator for help",
    ),
  );
});

it("uses explicit retry to reopen a circuit instead of automatic preparation", () => {
  const provider: SpeechRecognitionProvider = {
    id: "unsupported",
    isSupported: () => false,
    start: jest.fn(async () => ""),
    stop: jest.fn(),
  };
  const prepareAssistant = jest.fn();
  const retryAssistant = jest.fn();
  const controller = {
    processTranscript: jest.fn(),
  } as unknown as VoiceAssistantController;
  render(
    <VoiceAssistantPanel
      controller={controller}
      recognitionProvider={provider}
      guidanceSpeaking={false}
      prominent
      lightMode
      highContrast={false}
      runtimeStatus={{
        mode: "RULES_ONLY",
        reasonCode: "CIRCUIT_OPEN",
        retryAllowed: true,
        consecutiveFailures: 2,
        retryAt: Date.now() + 300_000,
      }}
      prepareAssistant={prepareAssistant}
      retryAssistant={retryAssistant}
    />,
  );

  fireEvent.press(screen.getByText("Retry private assistant"));
  expect(retryAssistant).toHaveBeenCalledTimes(1);
  expect(prepareAssistant).not.toHaveBeenCalled();
});
