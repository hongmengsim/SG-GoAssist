import {
  SpeechRecognitionProviderError,
  shouldSuppressAssistantTts,
  WebSpeechRecognitionProvider,
} from "../src/voiceAssistant/SpeechRecognitionProvider";

class FakeRecognition {
  static latest: FakeRecognition | null = null;
  continuous = true;
  interimResults = true;
  lang = "";
  maxAlternatives = 0;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  start = jest.fn();
  stop = jest.fn(() => this.onend?.());

  constructor() {
    FakeRecognition.latest = this;
  }
}

it("captures one en-SG transcript without storing audio", async () => {
  const provider = new WebSpeechRecognitionProvider({
    SpeechRecognition: FakeRecognition,
  } as any);
  const transcript = provider.start();
  expect(provider.isSupported()).toBe(true);
  expect(FakeRecognition.latest).toMatchObject({
    continuous: false,
    interimResults: false,
    lang: "en-SG",
    maxAlternatives: 1,
  });
  FakeRecognition.latest?.onresult?.({
    results: [{ 0: { transcript: "What bus is here?" } }],
  });
  await expect(transcript).resolves.toBe("What bus is here?");
});

it("reports unsupported browsers and microphone permission failures", async () => {
  const unsupported = new WebSpeechRecognitionProvider({} as any);
  expect(unsupported.isSupported()).toBe(false);
  await expect(unsupported.start()).rejects.toMatchObject({
    code: "NOT_SUPPORTED",
  });

  const provider = new WebSpeechRecognitionProvider({
    webkitSpeechRecognition: FakeRecognition,
  } as any);
  const transcript = provider.start();
  FakeRecognition.latest?.onerror?.({ error: "not-allowed" });
  await expect(transcript).rejects.toEqual(
    new SpeechRecognitionProviderError(
      "PERMISSION_DENIED",
      "Microphone permission is needed to talk to GoAssist.",
    ),
  );
});

it("prevents overlapping listening sessions and supports stopping", async () => {
  const provider = new WebSpeechRecognitionProvider({
    SpeechRecognition: FakeRecognition,
  } as any);
  const first = provider.start();
  await expect(provider.start()).rejects.toMatchObject({
    code: "ALREADY_LISTENING",
  });
  provider.stop();
  expect(FakeRecognition.latest?.stop).toHaveBeenCalledTimes(1);
  await expect(first).rejects.toMatchObject({ code: "NO_SPEECH" });
});

it("suppresses optional TTS only when native screen-reader detection is reliable", () => {
  expect(
    shouldSuppressAssistantTts({
      platform: "ios",
      screenReaderDetected: true,
    }),
  ).toBe(true);
  expect(
    shouldSuppressAssistantTts({
      platform: "web",
      screenReaderDetected: true,
    }),
  ).toBe(false);
  expect(
    shouldSuppressAssistantTts({
      platform: "android",
      screenReaderDetected: false,
    }),
  ).toBe(false);
});
