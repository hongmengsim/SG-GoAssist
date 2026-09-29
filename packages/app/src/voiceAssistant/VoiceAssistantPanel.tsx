import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import {
  PassengerPressable as Pressable,
  PassengerText as Text,
} from "../accessibility/PassengerControls";
import {
  BookOpenCheck,
  CheckCircle2,
  Mic,
  Send,
  Share2,
  ShieldCheck,
  Square,
} from "../components/AppIcons";
import type { VoiceAssistantController } from "./VoiceAssistantController";
import {
  speechListeningWindowMs,
  SpeechRecognitionProviderError,
  type SpeechRecognitionProvider,
} from "./SpeechRecognitionProvider";
import {
  assistantLocales,
  type AssistantInteractionState,
  type AssistantLocale,
  type AssistantRuntimeStatus,
  type AssistantTurnResult,
} from "./types";
import {
  assistantCopy,
  assistantLocaleLabels,
  normalizeAssistantLocale,
} from "./localization";

export function VoiceAssistantPanel({
  controller,
  recognitionProvider,
  guidanceSpeaking,
  prominent,
  lightMode,
  highContrast,
  locale,
  runtimeStatus,
  prepareAssistant,
  retryAssistant,
  diagnosticsConsent = false,
  onLocaleChange,
  onDiagnosticsConsentChange,
  onShareDiagnostic,
}: {
  controller: VoiceAssistantController;
  recognitionProvider: SpeechRecognitionProvider;
  guidanceSpeaking: boolean;
  prominent: boolean;
  lightMode: boolean;
  highContrast: boolean;
  locale?: AssistantLocale;
  runtimeStatus?: AssistantRuntimeStatus;
  prepareAssistant?: () => Promise<AssistantRuntimeStatus> | void;
  retryAssistant?: () => Promise<AssistantRuntimeStatus> | void;
  diagnosticsConsent?: boolean;
  onLocaleChange?: (locale: AssistantLocale) => void;
  onDiagnosticsConsentChange?: (enabled: boolean) => void;
  onShareDiagnostic?: (turn: AssistantTurnResult) => void;
}) {
  const resolvedLocale = normalizeAssistantLocale(locale);
  const speechRecognitionSupported = recognitionProvider.isSupported();
  const [interactionState, setInteractionState] =
    useState<AssistantInteractionState>("IDLE");
  const [typedCommand, setTypedCommand] = useState("");
  const [latestTurn, setLatestTurn] = useState<AssistantTurnResult | null>(
    null,
  );
  const [turnHelpful, setTurnHelpful] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const speechAttemptRef = useRef(0);

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
    void Promise.resolve(prepareAssistant?.()).catch(() => undefined);
    try {
      const result = await controller.processTranscript(command);
      setLatestTurn(result);
      setTurnHelpful(null);
      setInteractionState(result.spoken ? "SPEAKING" : "IDLE");
    } catch {
      setErrorMessage(assistantCopy(resolvedLocale, "processingError"));
      setInteractionState("FAILED");
    }
  }

  async function startListening() {
    if (
      interactionState === "PREPARING" ||
      interactionState === "LISTENING" ||
      interactionState === "FINALISING"
    ) {
      speechAttemptRef.current += 1;
      recognitionProvider.stop();
      setInteractionState("IDLE");
      return;
    }
    if (!speechRecognitionSupported) {
      setErrorMessage(assistantCopy(resolvedLocale, "unsupportedSpeech"));
      setInteractionState("FAILED");
      return;
    }
    void Promise.resolve(prepareAssistant?.()).catch(() => undefined);
    const attempt = speechAttemptRef.current + 1;
    speechAttemptRef.current = attempt;
    setErrorMessage(null);
    setInteractionState("PREPARING");
    try {
      const transcript = await recognitionProvider.start(resolvedLocale, {
        onStateChange: (state) => {
          if (speechAttemptRef.current === attempt) {
            setInteractionState(state);
          }
        },
      });
      if (speechAttemptRef.current !== attempt) return;
      void processTranscript(transcript);
    } catch (error) {
      if (speechAttemptRef.current !== attempt) return;
      setErrorMessage(speechFailureMessage(error, resolvedLocale));
      setInteractionState("FAILED");
    }
  }

  function submitTypedCommand() {
    const command = typedCommand.trim();
    if (!command) return;
    if (
      interactionState === "PREPARING" ||
      interactionState === "LISTENING" ||
      interactionState === "FINALISING"
    ) {
      speechAttemptRef.current += 1;
      recognitionProvider.stop();
    }
    setTypedCommand("");
    void processTranscript(command);
  }

  const stateLabel =
    interactionState === "PREPARING"
      ? assistantCopy(resolvedLocale, "preparingSpeech")
      : interactionState === "LISTENING"
        ? assistantCopy(resolvedLocale, "listening")
        : interactionState === "FINALISING"
          ? assistantCopy(resolvedLocale, "finalisingSpeech")
          : interactionState === "PROCESSING"
            ? assistantCopy(resolvedLocale, "thinking")
            : interactionState === "SPEAKING"
              ? assistantCopy(resolvedLocale, "speaking")
              : interactionState === "FAILED"
                ? assistantCopy(resolvedLocale, "retry")
                : assistantCopy(resolvedLocale, "talk");
  const helpText =
    interactionState === "PREPARING"
      ? assistantCopy(resolvedLocale, "preparingSpeechHelp")
      : interactionState === "LISTENING"
        ? assistantCopy(resolvedLocale, "listeningHelp", {
            seconds: speechListeningWindowMs / 1000,
          })
        : interactionState === "FINALISING"
          ? assistantCopy(resolvedLocale, "finalisingSpeechHelp")
          : interactionState === "FAILED"
            ? assistantCopy(resolvedLocale, "retryHelp")
            : assistantCopy(resolvedLocale, "idleHelp");
  const textColor = highContrast && !lightMode ? "#FFFFFF" : "#102A2E";
  const mutedColor = highContrast && !lightMode ? "#FFFFFF" : "#52666A";
  const borderColor = highContrast
    ? lightMode
      ? "#000000"
      : "#FFFF00"
    : "#78AEB4";
  const statusLabel =
    runtimeStatus?.mode === "AI_READY"
      ? assistantCopy(resolvedLocale, "statusReady")
      : runtimeStatus?.mode === "LOADING"
        ? assistantCopy(resolvedLocale, "statusLoading")
        : assistantCopy(resolvedLocale, "statusBasic");

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
      <View style={styles.runtimeRow} accessibilityLiveRegion="polite">
        {runtimeStatus?.mode === "AI_READY" ? (
          <ShieldCheck size={20} color={textColor} />
        ) : runtimeStatus?.mode === "LOADING" ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <CheckCircle2 size={20} color={textColor} />
        )}
        <Text style={[styles.runtimeText, { color: textColor }]}>
          {statusLabel}
        </Text>
      </View>
      {runtimeStatus?.mode === "RULES_ONLY" ? (
        <View style={styles.runtimeFallback}>
          <Text style={[styles.runtimeDetail, { color: mutedColor }]}>
            {assistantCopy(resolvedLocale, "statusBasicDetail")}
          </Text>
          {runtimeStatus.retryAllowed &&
          (retryAssistant || prepareAssistant) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void (retryAssistant ?? prepareAssistant)?.()}
              style={styles.runtimeRetry}
            >
              <Text style={[styles.runtimeRetryText, { color: textColor }]}>
                {assistantCopy(resolvedLocale, "retryAssistant")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {onLocaleChange ? (
        <View style={styles.languageRow} accessibilityRole="radiogroup">
          {assistantLocales.map((option) => {
            const selected = option === resolvedLocale;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={assistantLocaleLabels[option]}
                accessibilityState={{ selected }}
                onPress={() => onLocaleChange(option)}
                style={[
                  styles.languageButton,
                  { borderColor },
                  selected && styles.languageButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.languageText,
                    { color: selected ? "#FFFFFF" : textColor },
                  ]}
                >
                  {assistantLocaleLabels[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {onDiagnosticsConsentChange ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: diagnosticsConsent }}
          accessibilityLabel={assistantCopy(
            resolvedLocale,
            diagnosticsConsent ? "diagnosticsOn" : "diagnosticsOff",
          )}
          accessibilityHint={assistantCopy(
            resolvedLocale,
            "diagnosticsToggleHint",
          )}
          onPress={() => onDiagnosticsConsentChange(!diagnosticsConsent)}
          style={styles.diagnosticsToggle}
        >
          <ShieldCheck size={19} color={textColor} />
          <Text style={[styles.diagnosticsToggleText, { color: textColor }]}>
            {assistantCopy(
              resolvedLocale,
              diagnosticsConsent ? "diagnosticsOn" : "diagnosticsOff",
            )}
          </Text>
          <View
            style={[
              styles.toggleTrack,
              diagnosticsConsent && styles.toggleTrackEnabled,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                diagnosticsConsent && styles.toggleThumbEnabled,
              ]}
            />
          </View>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          interactionState === "LISTENING"
            ? assistantCopy(resolvedLocale, "stopListening")
            : speechRecognitionSupported
              ? assistantCopy(resolvedLocale, "talk")
              : assistantCopy(resolvedLocale, "type")
        }
        accessibilityHint={
          speechRecognitionSupported
            ? "Starts push-to-talk speech recognition. GoAssist only listens after you press this control."
            : "Speech recognition is unavailable. Opens the text command fallback."
        }
        accessibilityState={{
          busy:
            interactionState === "PREPARING" ||
            interactionState === "LISTENING" ||
            interactionState === "FINALISING" ||
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
        {interactionState === "PREPARING" ||
        interactionState === "FINALISING" ||
        interactionState === "PROCESSING" ||
        interactionState === "SPEAKING" ? (
          <ActivityIndicator size="large" color="#FFFFFF" />
        ) : interactionState === "LISTENING" ? (
          <Square size={34} color="#FFFFFF" fill="#FFFFFF" />
        ) : (
          <Mic size={42} color="#FFFFFF" />
        )}
        <Text style={styles.talkButtonLabel}>{stateLabel}</Text>
      </Pressable>

      <Text style={[styles.helpText, { color: mutedColor }]}>{helpText}</Text>
      {speechRecognitionSupported ? (
        <Text style={[styles.vendorNote, { color: mutedColor }]}>
          {assistantCopy(resolvedLocale, "speechVendorNotice")}
        </Text>
      ) : null}

      {latestTurn ? (
        <View
          style={[styles.exchange, { borderColor }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.speakerLabel, { color: mutedColor }]}>
            {assistantCopy(resolvedLocale, "you")}
          </Text>
          <Text style={[styles.exchangeText, { color: textColor }]}>
            {latestTurn.transcript}
          </Text>
          <Text style={[styles.speakerLabel, { color: mutedColor }]}>
            {assistantCopy(resolvedLocale, "assistant")}
          </Text>
          <Text
            style={[styles.responseText, { color: textColor }]}
            accessibilityRole="alert"
          >
            {latestTurn.response}
          </Text>
          {latestTurn.sourceLabel ? (
            <View style={styles.sourceRow}>
              <BookOpenCheck size={17} color={mutedColor} />
              <Text style={[styles.sourceText, { color: mutedColor }]}>
                {latestTurn.sourceLabel}
              </Text>
            </View>
          ) : null}
          {diagnosticsConsent && onShareDiagnostic ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={assistantCopy(
                resolvedLocale,
                "shareExchange",
              )}
              accessibilityHint={assistantCopy(
                resolvedLocale,
                "diagnosticsHint",
              )}
              onPress={() => onShareDiagnostic(latestTurn)}
              style={styles.shareButton}
            >
              <Share2 size={18} color={textColor} />
              <Text style={[styles.shareText, { color: textColor }]}>
                {assistantCopy(resolvedLocale, "shareExchange")}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.feedbackRow}>
            <Text style={[styles.feedbackQuestion, { color: mutedColor }]}>
              {assistantCopy(resolvedLocale, "helpfulQuestion")}
            </Text>
            {[true, false].map((helpful) => (
              <Pressable
                key={String(helpful)}
                accessibilityRole="button"
                accessibilityState={{ selected: turnHelpful === helpful }}
                onPress={() => {
                  controller.recordTurnFeedback(helpful);
                  setTurnHelpful(helpful);
                }}
                style={[
                  styles.feedbackButton,
                  { borderColor },
                  turnHelpful === helpful && styles.feedbackButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackButtonText,
                    {
                      color: turnHelpful === helpful ? "#FFFFFF" : textColor,
                    },
                  ]}
                >
                  {assistantCopy(
                    resolvedLocale,
                    helpful ? "helpfulYes" : "helpfulNo",
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
          {(turnHelpful === false ||
            latestTurn.resolutionKind === "CLARIFY" ||
            latestTurn.resolutionKind === "UNSUPPORTED") &&
          (controller.getAssistantContext().hasActiveJourney ||
            Boolean(controller.getAssistantContext().currentStop)) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={assistantCopy(resolvedLocale, "operatorHint")}
              onPress={() =>
                void processTranscript(
                  assistantCopy(resolvedLocale, "operatorCommand"),
                )
              }
              style={[styles.operatorButton, { borderColor }]}
            >
              <ShieldCheck size={20} color={textColor} />
              <Text style={[styles.operatorButtonText, { color: textColor }]}>
                {assistantCopy(resolvedLocale, "askOperator")}
              </Text>
            </Pressable>
          ) : null}
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

      <View style={styles.textFallback}>
        <TextInput
          accessibilityLabel="Ask GoAssist"
          accessibilityHint="Enter a journey or accessibility command."
          value={typedCommand}
          onChangeText={setTypedCommand}
          maxLength={500}
          onSubmitEditing={submitTypedCommand}
          placeholder={assistantCopy(resolvedLocale, "askPlaceholder")}
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
          accessibilityLabel={assistantCopy(resolvedLocale, "send")}
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
    </View>
  );
}

function speechFailureMessage(error: unknown, locale: AssistantLocale) {
  if (!(error instanceof SpeechRecognitionProviderError)) {
    return assistantCopy(locale, "speechServiceError");
  }
  switch (error.code) {
    case "PERMISSION_DENIED":
      return assistantCopy(locale, "speechPermissionError");
    case "NO_SPEECH":
      return assistantCopy(locale, "speechSilenceError");
    case "TIMEOUT":
      return assistantCopy(locale, "speechTimeoutError");
    case "LANGUAGE_UNAVAILABLE":
      return assistantCopy(locale, "speechLanguageError");
    case "NOT_SUPPORTED":
      return assistantCopy(locale, "unsupportedSpeech");
    case "SERVICE_UNAVAILABLE":
    case "RECOGNITION_FAILED":
    case "ALREADY_LISTENING":
      return assistantCopy(locale, "speechServiceError");
  }
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
  runtimeRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 32,
  },
  runtimeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  runtimeFallback: {
    alignItems: "flex-start",
    gap: 4,
  },
  runtimeDetail: {
    fontSize: 13,
    lineHeight: 19,
  },
  runtimeRetry: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  runtimeRetryText: {
    fontSize: 14,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  diagnosticsToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
  },
  diagnosticsToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  toggleTrack: {
    backgroundColor: "#A8BABC",
    borderRadius: 999,
    height: 26,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 46,
  },
  toggleTrackEnabled: {
    backgroundColor: "#0B6670",
  },
  toggleThumb: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    height: 20,
    width: 20,
  },
  toggleThumbEnabled: {
    alignSelf: "flex-end",
  },
  languageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  languageButton: {
    borderRadius: 999,
    borderWidth: 2,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  languageButtonSelected: {
    backgroundColor: "#0B6670",
  },
  languageText: {
    fontSize: 14,
    fontWeight: "800",
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
  vendorNote: {
    fontSize: 13,
    lineHeight: 19,
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
  sourceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
  },
  sourceText: {
    fontSize: 14,
    fontWeight: "700",
  },
  shareButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  shareText: {
    fontSize: 14,
    fontWeight: "800",
  },
  feedbackRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 7,
  },
  feedbackQuestion: {
    fontSize: 14,
    fontWeight: "800",
    marginRight: 2,
  },
  feedbackButton: {
    borderRadius: 999,
    borderWidth: 2,
    minHeight: 38,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  feedbackButtonSelected: {
    backgroundColor: "#0B6670",
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  operatorButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  operatorButtonText: {
    fontSize: 15,
    fontWeight: "900",
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
