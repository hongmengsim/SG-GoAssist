import type {
  AssistantLocale,
  SpeechRecognitionSession,
} from "./types";

export type SpeechRecognitionFailure =
  | "NOT_SUPPORTED"
  | "ALREADY_LISTENING"
  | "NO_SPEECH"
  | "PERMISSION_DENIED"
  | "SERVICE_UNAVAILABLE"
  | "LANGUAGE_UNAVAILABLE"
  | "TIMEOUT"
  | "RECOGNITION_FAILED";

export class SpeechRecognitionProviderError extends Error {
  constructor(
    readonly code: SpeechRecognitionFailure,
    message: string,
  ) {
    super(message);
    this.name = "SpeechRecognitionProviderError";
  }
}

export interface SpeechRecognitionProvider {
  readonly id: string;
  isSupported(): boolean;
  start(
    locale?: AssistantLocale,
    session?: SpeechRecognitionSession,
  ): Promise<string>;
  stop(): void;
}

export const speechListeningWindowMs = 15_000;
const speechRecognitionRestartDelayMs = 150;

export function shouldSuppressAssistantTts({
  platform,
  screenReaderDetected,
}: {
  platform: string;
  screenReaderDetected: boolean;
}) {
  // React Native Web reports screen-reader support rather than reliable active
  // usage, so suppression is only safe where native detection is meaningful.
  return platform !== "web" && screenReaderDetected;
}

type RecognitionResultEvent = {
  results?: ArrayLike<{ 0?: { transcript?: string } }>;
};

type RecognitionErrorEvent = { error?: string };

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
};

type RecognitionConstructor = new () => RecognitionInstance;

type SpeechRecognitionEnvironment = typeof globalThis & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

export class WebSpeechRecognitionProvider implements SpeechRecognitionProvider {
  readonly id = "web-speech-recognition";
  private activeRecognition: RecognitionInstance | null = null;
  private stopActiveRecognition: (() => void) | null = null;

  constructor(
    private readonly environment: SpeechRecognitionEnvironment = globalThis as SpeechRecognitionEnvironment,
  ) {}

  isSupported() {
    return Boolean(this.constructorForEnvironment());
  }

  start(
    locale: AssistantLocale = "en-SG",
    session?: SpeechRecognitionSession,
  ): Promise<string> {
    if (this.activeRecognition) {
      return Promise.reject(
        new SpeechRecognitionProviderError(
          "ALREADY_LISTENING",
          "GoAssist is already listening.",
        ),
      );
    }
    const Recognition = this.constructorForEnvironment();
    if (!Recognition) {
      return Promise.reject(
        new SpeechRecognitionProviderError(
          "NOT_SUPPORTED",
          "Speech recognition is unavailable in this browser.",
        ),
      );
    }

    session?.onStateChange?.("PREPARING");
    return new Promise<string>((resolve, reject) => {
      const recognition = new Recognition();
      this.activeRecognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = locale;
      recognition.maxAlternatives = 1;
      let settled = false;
      let restartTimer: ReturnType<typeof setTimeout> | null = null;
      let restartPending = false;
      let deadline = Number.POSITIVE_INFINITY;
      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      let readinessTimer: ReturnType<typeof setTimeout> | null = null;
      let listeningStarted = false;
      const noSpeechError = () =>
        new SpeechRecognitionProviderError(
          "NO_SPEECH",
          "I couldn't hear that. Try again and speak when Listening appears.",
        );
      const finish = (result: { transcript?: string; error?: Error }) => {
        if (settled) return;
        settled = true;
        if (deadlineTimer) clearTimeout(deadlineTimer);
        if (readinessTimer) clearTimeout(readinessTimer);
        if (restartTimer) clearTimeout(restartTimer);
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
          this.stopActiveRecognition = null;
        }
        if (result.transcript) resolve(result.transcript);
        else reject(result.error);
      };
      const beginListening = () => {
        if (settled || listeningStarted) return;
        listeningStarted = true;
        if (readinessTimer) clearTimeout(readinessTimer);
        deadline = Date.now() + speechListeningWindowMs;
        session?.onStateChange?.("LISTENING");
        deadlineTimer = setTimeout(() => {
          if (settled) return;
          finish({
            error: new SpeechRecognitionProviderError(
              "TIMEOUT",
              "The listening window ended before speech was recognised.",
            ),
          });
          try {
            recognition.stop();
          } catch {
            // The browser may already have ended this recognition attempt.
          }
        }, speechListeningWindowMs);
      };
      const scheduleRestart = () => {
        if (settled || restartPending) return;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= speechRecognitionRestartDelayMs) {
          finish({ error: noSpeechError() });
          return;
        }
        restartPending = true;
        restartTimer = setTimeout(() => {
          restartPending = false;
          if (settled) return;
          try {
            recognition.start();
          } catch {
            finish({
              error: new SpeechRecognitionProviderError(
                "RECOGNITION_FAILED",
                "I couldn't restart the microphone. Try again.",
              ),
            });
          }
        }, speechRecognitionRestartDelayMs);
      };
      this.stopActiveRecognition = () => {
        if (settled) return;
        finish({ error: noSpeechError() });
        try {
          recognition.stop();
        } catch {
          // The recognition attempt has already stopped.
        }
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        session?.onStateChange?.("FINALISING");
        finish(
          transcript
            ? { transcript }
            : {
                error: new SpeechRecognitionProviderError(
                  "NO_SPEECH",
                  "I couldn't hear that. Try again and speak when Listening appears.",
                ),
              },
        );
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech") {
          scheduleRestart();
          return;
        }
        const permissionDenied =
          event.error === "not-allowed" ||
          event.error === "service-not-allowed";
        const languageUnavailable = event.error === "language-not-supported";
        const serviceUnavailable =
          event.error === "audio-capture" || event.error === "network";
        finish({
          error: new SpeechRecognitionProviderError(
            permissionDenied
              ? "PERMISSION_DENIED"
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
      };
      recognition.onend = () => {
        scheduleRestart();
      };
      recognition.onstart = beginListening;
      readinessTimer = setTimeout(
        () =>
          finish({
            error: new SpeechRecognitionProviderError(
              "SERVICE_UNAVAILABLE",
              "The speech service did not become ready.",
            ),
          }),
        5_000,
      );
      try {
        recognition.start();
      } catch {
        finish({
          error: new SpeechRecognitionProviderError(
            "RECOGNITION_FAILED",
            "I couldn't start the microphone.",
          ),
        });
      }
    });
  }

  stop() {
    this.stopActiveRecognition?.();
  }

  private constructorForEnvironment() {
    return (
      this.environment.SpeechRecognition ??
      this.environment.webkitSpeechRecognition ??
      null
    );
  }
}
