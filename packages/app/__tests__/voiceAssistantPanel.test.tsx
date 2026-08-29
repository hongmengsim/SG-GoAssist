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
import type { SpeechRecognitionProvider } from "../src/voiceAssistant/SpeechRecognitionProvider";
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
      () => new Promise<string>((resolve) => (resolveRecognition = resolve)),
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
    screen.getByText("Speak now. Listening for up to 10 seconds."),
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

it("shows a microphone error and permits another push-to-talk attempt", async () => {
  const provider: SpeechRecognitionProvider = {
    id: "failing-speech",
    isSupported: () => true,
    start: jest.fn(async () => {
      throw new Error("I couldn't hear that.");
    }),
    stop: jest.fn(),
  };
  renderPanel({ provider });

  fireEvent.press(screen.getByLabelText("Talk to GoAssist"));
  expect(await screen.findByText("I couldn't hear that.")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Talk to GoAssist"));
  await waitFor(() => expect(provider.start).toHaveBeenCalledTimes(2));
});
