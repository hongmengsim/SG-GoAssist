import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Keyboard, Mic, Send, Square } from "lucide-react-native";
import type { VoiceAssistantController } from "./VoiceAssistantController";
import type { SpeechRecognitionProvider } from "./SpeechRecognitionProvider";
import type { AssistantInteractionState, AssistantTurnResult } from "./types";

export function VoiceAssistantPanel({
  controller,
  recognitionProvider,
  guidanceSpeaking,
  prominent,
  lightMode,
  highContrast,
}: {
  controller: VoiceAssistantController;
  recognitionProvider: SpeechRecognitionProvider;
  guidanceSpeaking: boolean;
  prominent: boolean;
  lightMode: boolean;
  highContrast: boolean;
}) {
  const speechRecognitionSupported = recognitionProvider.isSupported();
  const [interactionState, setInteractionState] =
    useState<AssistantInteractionState>("IDLE");
  const [typedCommand, setTypedCommand] = useState("");
  const [showTextFallback, setShowTextFallback] = useState(
    !speechRecognitionSupported,
  );
  const [latestTurn, setLatestTurn] = useState<AssistantTurnResult | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (interactionState === "SPEAKING" && !guidanceSpeaking) {
      setInteractionState("IDLE");
    }
  }, [guidanceSpeaking, interactionState]);

  async function processTranscript(transcript: string) {
    const command = transcript.trim();
    if (!command || interactionState === "PROCESSING") return;
    setErrorMessage(null);
    setInteractionState("PROCESSING");
    try {
      const result = await controller.processTranscript(command);
      setLatestTurn(result);
      setInteractionState(result.spoken ? "SPEAKING" : "IDLE");
    } catch {
      setErrorMessage("I couldn’t process that request. Try again.");
      setInteractionState("ERROR");
    }
  }

  async function startListening() {
    if (interactionState === "LISTENING") {
      recognitionProvider.stop();
      return;
    }
    if (!speechRecognitionSupported) {
      setShowTextFallback(true);
      setErrorMessage(
        "Speech recognition isn’t available in this browser. Type your request instead.",
      );
      setInteractionState("ERROR");
      return;
    }
    setErrorMessage(null);
    setInteractionState("LISTENING");
    try {
      const transcript = await recognitionProvider.start();
      await processTranscript(transcript);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "I couldn’t hear that.",
      );
      setInteractionState("ERROR");
    }
  }

  function submitTypedCommand() {
    const command = typedCommand.trim();
    if (!command) return;
    setTypedCommand("");
    void processTranscript(command);
  }

  const stateLabel =
    interactionState === "LISTENING"
      ? "Listening…"
      : interactionState === "PROCESSING"
        ? "Thinking…"
        : interactionState === "SPEAKING"
          ? "GoAssist is speaking…"
          : interactionState === "ERROR"
            ? "Try Talk to GoAssist again"
            : "Talk to GoAssist";
  const textColor = highContrast && !lightMode ? "#FFFFFF" : "#102A2E";
  const mutedColor = highContrast && !lightMode ? "#FFFFFF" : "#52666A";
  const borderColor = highContrast
    ? lightMode
      ? "#000000"
      : "#FFFF00"
    : "#78AEB4";

  return (
    <View
      style={[
        styles.panel,
        lightMode ? styles.panelLight : styles.panelDark,
        highContrast && styles.highContrastPanel,
      ]}
      testID="voice-assistant-panel"
    >
      <View style={styles.divider} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          interactionState === "LISTENING"
            ? "Stop listening"
            : speechRecognitionSupported
              ? "Talk to GoAssist"
              : "Type to GoAssist"
        }
        accessibilityHint={
          speechRecognitionSupported
            ? "Starts push-to-talk speech recognition. GoAssist only listens after you press this control."
            : "Speech recognition is unavailable. Opens the text command fallback."
        }
        accessibilityState={{
          busy:
            interactionState === "LISTENING" ||
            interactionState === "PROCESSING" ||
            interactionState === "SPEAKING",
        }}
        disabled={
          interactionState === "PROCESSING" || interactionState === "SPEAKING"
        }
        onPress={() => void startListening()}
        style={({ pressed }) => [
          styles.talkButton,
          prominent && styles.prominentTalkButton,
          highContrast && styles.highContrastTalkButton,
          pressed && styles.pressed,
        ]}
      >
        {interactionState === "PROCESSING" ||
        interactionState === "SPEAKING" ? (
          <ActivityIndicator size="large" color="#FFFFFF" />
        ) : interactionState === "LISTENING" ? (
          <Square size={34} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Mic size={42} color="#FFFFFF" />
        )}
        <Text style={styles.talkButtonLabel}>{stateLabel}</Text>
      </Pressable>

      <Text style={[styles.helpText, { color: mutedColor }]}>
        Ask what bus is here, request assistance, or check your journey.
      </Text>

      {latestTurn ? (
        <View
          style={[styles.exchange, { borderColor }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.speakerLabel, { color: mutedColor }]}>You</Text>
          <Text style={[styles.exchangeText, { color: textColor }]}>
            {latestTurn.transcript}
          </Text>
          <Text style={[styles.speakerLabel, { color: mutedColor }]}>
            GoAssist
          </Text>
          <Text
            style={[styles.responseText, { color: textColor }]}
            accessibilityRole="alert"
          >
            {latestTurn.response}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <Text
          style={[styles.errorText, highContrast && styles.highContrastError]}
          accessibilityRole="alert"
        >
          {errorMessage}
        </Text>
      ) : null}

      {!showTextFallback && speechRecognitionSupported ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type to GoAssist instead"
          onPress={() => setShowTextFallback(true)}
          style={({ pressed }) => [
            styles.typeInstead,
            pressed && styles.pressed,
          ]}
        >
          <Keyboard size={22} color={textColor} />
          <Text style={[styles.typeInsteadText, { color: textColor }]}>
            Type instead
          </Text>
        </Pressable>
      ) : null}

      {showTextFallback ? (
        <View style={styles.textFallback}>
          <TextInput
            accessibilityLabel="Ask GoAssist"
            accessibilityHint="Enter a journey or accessibility command."
            value={typedCommand}
            onChangeText={setTypedCommand}
            onSubmitEditing={submitTypedCommand}
            placeholder="Ask GoAssist…"
            placeholderTextColor={
              highContrast && !lightMode ? "#FFFFFF" : "#617478"
            }
            returnKeyType="send"
            style={[
              styles.input,
              { borderColor, color: textColor },
              highContrast && styles.highContrastInput,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send to GoAssist"
            accessibilityState={{ disabled: !typedCommand.trim() }}
            disabled={!typedCommand.trim() || interactionState === "PROCESSING"}
            onPress={submitTypedCommand}
            style={({ pressed }) => [
              styles.sendButton,
              !typedCommand.trim() && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Send size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
    marginTop: 18,
  },
  panelLight: {
    backgroundColor: "transparent",
  },
  panelDark: {
    backgroundColor: "transparent",
  },
  highContrastPanel: {
    borderColor: "transparent",
  },
  divider: {
    backgroundColor: "#9BBFC3",
    height: 1,
    width: "100%",
  },
  talkButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#0B6670",
    borderColor: "#064A51",
    borderRadius: 22,
    borderWidth: 2,
    flexDirection: "row",
    gap: 14,
    justifyContent: "center",
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  prominentTalkButton: {
    minHeight: 96,
  },
  highContrastTalkButton: {
    backgroundColor: "#000000",
    borderColor: "#FFFF00",
    borderWidth: 3,
  },
  talkButtonLabel: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  helpText: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  exchange: {
    borderRadius: 16,
    borderWidth: 2,
    gap: 5,
    padding: 16,
  },
  speakerLabel: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 3,
    textTransform: "uppercase",
  },
  exchangeText: {
    fontSize: 17,
    lineHeight: 24,
  },
  responseText: {
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 27,
  },
  errorText: {
    backgroundColor: "#FEE4E2",
    borderColor: "#B42318",
    borderRadius: 12,
    borderWidth: 2,
    color: "#8A1C13",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    padding: 12,
  },
  highContrastError: {
    backgroundColor: "#000000",
    borderColor: "#FFFF00",
    color: "#FFFFFF",
  },
  typeInstead: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  typeInsteadText: {
    fontSize: 16,
    fontWeight: "800",
  },
  textFallback: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10,
  },
  input: {
    borderRadius: 14,
    borderWidth: 2,
    flex: 1,
    fontSize: 18,
    minHeight: 58,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  highContrastInput: {
    borderWidth: 3,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#0B6670",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 58,
    minWidth: 58,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
