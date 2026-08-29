export type SpeechRecognitionFailure =
  | "NOT_SUPPORTED"
  | "ALREADY_LISTENING"
  | "NO_SPEECH"
  | "PERMISSION_DENIED"
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
  start(): Promise<string>;
  stop(): void;
}

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

  constructor(
    private readonly environment: SpeechRecognitionEnvironment = globalThis as SpeechRecognitionEnvironment,
  ) {}

  isSupported() {
    return Boolean(this.constructorForEnvironment());
  }

  start(): Promise<string> {
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

    return new Promise<string>((resolve, reject) => {
      const recognition = new Recognition();
      this.activeRecognition = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-SG";
      recognition.maxAlternatives = 1;
      let settled = false;
      const finish = (result: { transcript?: string; error?: Error }) => {
        if (settled) return;
        settled = true;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
        if (result.transcript) resolve(result.transcript);
        else reject(result.error);
      };
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        finish(
          transcript
            ? { transcript }
            : {
                error: new SpeechRecognitionProviderError(
                  "NO_SPEECH",
                  "I couldn't hear that.",
                ),
              },
        );
      };
      recognition.onerror = (event) => {
        const permissionDenied =
          event.error === "not-allowed" ||
          event.error === "service-not-allowed";
        finish({
          error: new SpeechRecognitionProviderError(
            permissionDenied ? "PERMISSION_DENIED" : "RECOGNITION_FAILED",
            permissionDenied
              ? "Microphone permission is needed to talk to GoAssist."
              : "I couldn't hear that.",
          ),
        });
      };
      recognition.onend = () => {
        finish({
          error: new SpeechRecognitionProviderError(
            "NO_SPEECH",
            "I couldn't hear that.",
          ),
        });
      };
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
    this.activeRecognition?.stop();
  }

  private constructorForEnvironment() {
    return (
      this.environment.SpeechRecognition ??
      this.environment.webkitSpeechRecognition ??
      null
    );
  }
}
