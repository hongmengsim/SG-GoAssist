import {
  createBrowserSpeechAdapter,
  GuidanceService,
  type GuidanceHaptic,
  type SpeechAdapter,
} from "../src/guidance/GuidanceService";

function createSpeechHarness(autoFinish = true) {
  const spoken: string[] = [];
  const cancelled: number[] = [];
  let finish: (() => void) | null = null;
  const adapter: SpeechAdapter = {
    cancel: () => cancelled.push(cancelled.length + 1),
    speak: (text, { onDone }) => {
      spoken.push(text);
      finish = onDone;
      if (autoFinish) onDone();
      return true;
    },
  };
  return { adapter, cancelled, finish: () => finish?.(), spoken };
}

it("keeps spoken guidance silent when the preference is off", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: false });

  const result = service.announce({
    id: "walking-start",
    priority: "WALKING",
    text: "Continue for 80 metres.",
  });

  expect(result.spoken).toBe(false);
  expect(speech.spoken).toEqual([]);
  expect(service.snapshot().latestSpokenText).toBeNull();
});

it("speaks an explicit assistant response and repeats it through GuidanceService", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: false });

  expect(service.speakAssistantResponse("Service 151 is at your stop.")).toBe(
    true,
  );
  expect(service.repeatLatest()).toBe(false);
  expect(service.repeatLatest({ force: true })).toBe(true);
  expect(speech.spoken).toEqual([
    "Service 151 is at your stop.",
    "Service 151 is at your stop.",
  ]);
});

it("speaks an important event once when the preference is on", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });
  const event = {
    id: "walking-step-2",
    priority: "WALKING" as const,
    text: "Turn left onto Dover Road.",
  };

  expect(service.announce(event).spoken).toBe(true);
  expect(service.announce(event).duplicate).toBe(true);
  expect(speech.spoken).toEqual(["Turn left onto Dover Road."]);
});

it("allows a new maneuver while suppressing a repeated event", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });

  service.announce({ id: "step-1", priority: "WALKING", text: "Head north." });
  service.announce({ id: "step-1", priority: "WALKING", text: "Head north." });
  service.announce({
    id: "step-2",
    priority: "WALKING",
    text: "Turn right onto Dover Road.",
  });

  expect(speech.spoken).toEqual(["Head north.", "Turn right onto Dover Road."]);
});

it("repeats only the latest instruction after it has actually been spoken", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });

  expect(service.repeatLatest()).toBe(false);
  service.announce({
    id: "off-route-1",
    priority: "WALKING",
    text: "You're off the suggested walking route.",
  });
  expect(service.repeatLatest()).toBe(true);
  expect(speech.spoken).toEqual([
    "You're off the suggested walking route.",
    "You're off the suggested walking route.",
  ]);
});

it("stops active speech idempotently and clears stale repeat guidance", () => {
  const speech = createSpeechHarness(false);
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });
  service.announce({
    id: "walking-active-step",
    priority: "WALKING",
    text: "Turn left in 20 metres.",
  });

  service.stopActiveSpeech();
  service.stopActiveSpeech();

  expect(speech.cancelled).toHaveLength(2);
  expect(service.snapshot().latestSpokenText).toBeNull();
  expect(service.repeatLatest()).toBe(false);
});

it("lets destination guidance override lower-priority walking speech", () => {
  const speech = createSpeechHarness(false);
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });

  service.announce({
    id: "destination-next",
    priority: "DESTINATION",
    text: "Your destination is the next stop.",
  });
  const walking = service.announce({
    id: "walking-step",
    priority: "WALKING",
    text: "Continue straight.",
  });

  expect(walking.spoken).toBe(false);
  expect(speech.spoken).toEqual(["Your destination is the next stop."]);
});

it("triggers configured haptics once even when speech is disabled", () => {
  const haptics: GuidanceHaptic[] = [];
  const service = new GuidanceService({
    haptic: (event) => haptics.push(event),
  });
  service.configure({
    vibrationAlerts: "IMPORTANT",
    spokenGuidanceEnabled: false,
  });
  const event = {
    haptic: "WARNING" as const,
    id: "off-route-1",
    priority: "WALKING" as const,
    text: "You're off route.",
  };

  service.announce(event);
  service.announce(event);

  expect(haptics).toEqual(["WARNING"]);
});

it("limits important vibration alerts and allows all-guidance vibration", () => {
  const haptics: GuidanceHaptic[] = [];
  const service = new GuidanceService({
    haptic: (event) => haptics.push(event),
  });
  service.configure({
    vibrationAlerts: "IMPORTANT",
    spokenGuidanceEnabled: false,
  });
  service.announce({
    haptic: "START",
    id: "start-important",
    priority: "WALKING",
    text: "Start.",
  });
  service.announce({
    haptic: "WARNING",
    id: "warning-important",
    priority: "BUS",
    text: "Bus approaching.",
  });
  expect(haptics).toEqual(["WARNING"]);

  service.configure({ vibrationAlerts: "ALL", spokenGuidanceEnabled: false });
  service.announce({
    haptic: "START",
    id: "start-all",
    priority: "WALKING",
    text: "Start again.",
  });
  service.announce({
    haptic: "TURN",
    id: "turn-all",
    priority: "WALKING",
    text: "Turn left.",
  });
  expect(haptics).toEqual(["WARNING", "START", "TURN"]);
});

it("announces off-route and destination events only once each", () => {
  const speech = createSpeechHarness();
  const service = new GuidanceService({ speech: speech.adapter });
  service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });
  const offRoute = {
    id: "walking-off-route-1",
    priority: "WALKING" as const,
    text: "You're off the suggested walking route.",
  };
  const arrived = {
    id: "walking-arrived-1",
    priority: "DESTINATION" as const,
    text: "You've reached the bus stop.",
  };

  service.announce(offRoute);
  service.announce(offRoute);
  service.announce(arrived);
  service.announce(arrived);

  expect(speech.spoken).toEqual([
    "You're off the suggested walking route.",
    "You've reached the bus stop.",
  ]);
});

it("uses the browser Web Speech API without a cloud TTS dependency", () => {
  const originalSpeechSynthesis = (globalThis as any).speechSynthesis;
  const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;
  const spoken: Array<{ lang: string; rate: number; text: string }> = [];
  class MockSpeechSynthesisUtterance {
    lang = "";
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly text: string) {}
  }
  (globalThis as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  (globalThis as any).speechSynthesis = {
    cancel: jest.fn(),
    speak: jest.fn((utterance: MockSpeechSynthesisUtterance) => {
      spoken.push({
        lang: utterance.lang,
        rate: utterance.rate,
        text: utterance.text,
      });
      utterance.onend?.();
    }),
  };

  try {
    const adapter = createBrowserSpeechAdapter();
    const service = new GuidanceService({ speech: adapter });
    service.configure({ vibrationAlerts: "OFF", spokenGuidanceEnabled: true });
    service.announce({
      id: "walking-start-web",
      priority: "WALKING",
      text: "Continue for 80 metres.",
    });

    expect(spoken).toEqual([
      { lang: "en-SG", rate: 0.96, text: "Continue for 80 metres." },
    ]);
  } finally {
    (globalThis as any).speechSynthesis = originalSpeechSynthesis;
    (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
  }
});
