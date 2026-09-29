import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  SpeechRecognitionProviderError,
  speechListeningWindowMs,
  type SpeechRecognitionProvider,
} from "./SpeechRecognitionProvider";
import type { AssistantLocale } from "./types";
import type { SpeechRecognitionSession } from "./types";

type Subscription = { remove(): void };

export class NativeSpeechRecognitionProvider implements SpeechRecognitionProvider {
  readonly id = "android-system-speech-recognition";
  private active = false;
  private stopActive: (() => void) | null = null;

  isSupported() {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  }

  async start(
    locale: AssistantLocale = "en-SG",
    session?: SpeechRecognitionSession,
  ) {
    if (this.active) {
      throw new SpeechRecognitionProviderError(
        "ALREADY_LISTENING",
        "GoAssist is already listening.",
      );
    }
    if (!this.isSupported()) {
      throw new SpeechRecognitionProviderError(
        "NOT_SUPPORTED",
        "Speech recognition is unavailable on this device.",
      );
    }
    session?.onStateChange?.("PREPARING");
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      throw new SpeechRecognitionProviderError(
        "PERMISSION_DENIED",
        "Microphone permission is needed to talk to GoAssist.",
      );
    }
    this.active = true;
    return new Promise<string>((resolve, reject) => {
      const subscriptions: Subscription[] = [];
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | null = null;
      let readinessDeadline: ReturnType<typeof setTimeout> | null = null;
      const finish = (result: { transcript?: string; error?: Error }) => {
        if (settled) return;
        settled = true;
        if (readinessDeadline) clearTimeout(readinessDeadline);
        if (deadline) clearTimeout(deadline);
        subscriptions.forEach((subscription) => subscription.remove());
        this.active = false;
        this.stopActive = null;
        ExpoSpeechRecognitionModule.abort();
        if (result.transcript) resolve(result.transcript);
        else reject(result.error);
      };
      readinessDeadline = setTimeout(
        () =>
          finish({
            error: new SpeechRecognitionProviderError(
              "SERVICE_UNAVAILABLE",
              "The speech service did not become ready.",
            ),
          }),
        5_000,
      );
      this.stopActive = () =>
        finish({
          error: new SpeechRecognitionProviderError(
            "NO_SPEECH",
            "Listening stopped before speech was recognised.",
          ),
        });
      subscriptions.push(
        ExpoSpeechRecognitionModule.addListener("start", () => {
          if (readinessDeadline) clearTimeout(readinessDeadline);
          session?.onStateChange?.("LISTENING");
          deadline = setTimeout(
            () =>
              finish({
                error: new SpeechRecognitionProviderError(
                  "TIMEOUT",
                  "The listening window ended before speech was recognised.",
                ),
              }),
            speechListeningWindowMs,
          );
        }),
        ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
          const transcript = event.results?.[0]?.transcript?.trim();
          if (
            transcript &&
            (event.isFinal !== false || event.results?.[0]?.isFinal)
          ) {
            session?.onStateChange?.("FINALISING");
            finish({ transcript });
          }
        }),
        ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
          const permissionDenied =
            event.error === "not-allowed" ||
            event.error === "service-not-allowed";
          const noSpeech = event.error === "no-speech";
          const languageUnavailable =
            event.error === "language-not-supported";
          const serviceUnavailable =
            event.error === "audio-capture" || event.error === "network";
          finish({
            error: new SpeechRecognitionProviderError(
              permissionDenied
                ? "PERMISSION_DENIED"
                : noSpeech
                  ? "NO_SPEECH"
                  : languageUnavailable
                    ? "LANGUAGE_UNAVAILABLE"
                    : serviceUnavailable
                      ? "SERVICE_UNAVAILABLE"
                      : "RECOGNITION_FAILED",
              permissionDenied
                ? "Microphone permission is needed to talk to GoAssist."
                : "I couldn't hear that.",
            ),
          });
        }),
      );
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        recordingOptions: { persist: false },
      });
    });
  }

  stop() {
    this.stopActive?.();
  }
}

export function createSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return new NativeSpeechRecognitionProvider();
}
