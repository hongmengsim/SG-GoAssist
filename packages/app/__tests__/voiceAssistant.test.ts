import { AssistanceRequestStatus } from "@buspass/shared";
import {
  FallbackAssistantIntentProvider,
  RuleBasedIntentProvider,
  resolveRuleBasedIntent,
  validateStructuredIntentResult,
  type AssistantIntentProvider,
} from "../src/voiceAssistant/AssistantIntentProvider";
import {
  VoiceAssistantController,
  type VoiceAssistantActions,
} from "../src/voiceAssistant/VoiceAssistantController";
import type {
  AssistantContext,
  AssistantIntent,
  AssistantTurnProvider,
} from "../src/voiceAssistant/types";

const bus151 = {
  id: "BUS-151",
  serviceNo: "151",
  destination: "Kent Ridge Terminal",
  wheelchairAccessible: true,
  confidence: "HIGH" as const,
};

function assistantContext(
  overrides: Partial<AssistantContext> = {},
): AssistantContext {
  return {
    journeyStage: "WAITING_FOR_BUS",
    hasActiveJourney: true,
    onboard: false,
    currentStop: {
      busStopCode: "16171",
      description: "Yusof Ishak House",
    },
    selectedService: "151",
    destination: "Central Library",
    nextStop: "Information Technology",
    stopsRemaining: 2,
    busesAtStop: [bus151],
    selectedBusAtStop: bus151,
    busArrivalSeconds: 150,
    rampStatus: "ONE_BUS_PRESENT",
    alightingAssistanceStatus: null,
    walkingGuidanceActive: false,
    walkingRouteAvailable: false,
    routeOptions: [
      {
        id: "151-central-library",
        title: "Fastest accessible route",
        serviceNo: "151",
        walkingMinutes: 6,
        shelterCoverage: "UNVERIFIED",
      },
    ],
    preferences: {
      wheelchairAssistance: true,
      spokenGuidance: true,
      simplifiedJourney: false,
      vibrationAlerts: true,
    },
    ...overrides,
  };
}

function createHarness({
  context = assistantContext(),
  intentProvider,
  turnProvider,
  now,
}: {
  context?: AssistantContext;
  intentProvider?: AssistantIntentProvider;
  turnProvider?: AssistantTurnProvider;
  now?: () => number;
} = {}) {
  let currentContext = context;
  const spoken: string[] = [];
  const actions: VoiceAssistantActions = {
    getContext: () => currentContext,
    refreshLocationContext: jest.fn(async () => ({ ok: false })),
    requestRamp: jest.fn(async () => ({ ok: true })),
    requestExtraBoardingTime: jest.fn(async () => ({ ok: true })),
    requestAlightingAssistance: jest.fn(async () => ({ ok: true })),
    requestOperatorHelp: jest.fn(async () => ({ ok: true })),
    startDirectionsToSelectedStop: jest.fn(async () => ({ ok: true })),
    stopGuidance: jest.fn(() => ({ ok: true })),
    repeatGuidance: jest.fn(() => ({
      ok: true,
      text: "Turn left in 20 metres.",
    })),
    endJourney: jest.fn(async () => ({ ok: true })),
    speakResponse: jest.fn((text: string) => {
      spoken.push(text);
      return true;
    }),
  };
  const controller = new VoiceAssistantController(actions, {
    intentProvider,
    turnProvider,
    now,
    confirmationTimeoutMs: 30_000,
  });
  return {
    actions,
    controller,
    setContext: (next: AssistantContext) => {
      currentContext = next;
    },
    spoken,
  };
}

describe("deterministic journey intents", () => {
  it.each<[string, AssistantIntent["type"]]>([
    ["What bus is here?", "GET_BUS_AT_STOP"],
    ["Where am I?", "GET_CURRENT_STOP"],
    ["Find my nearest bus stop", "GET_CURRENT_STOP"],
    ["Where is the closest bus stop?", "GET_CURRENT_STOP"],
    ["Which nearby stop should I use?", "GET_CURRENT_STOP"],
    ["What bus am I waiting for?", "GET_ACTIVE_BUS"],
    ["When is my bus coming?", "GET_ARRIVAL"],
    ["What's my next stop?", "GET_NEXT_STOP"],
    ["How many stops are left?", "GET_STOPS_REMAINING"],
    ["Where am I getting off?", "GET_DESTINATION"],
    ["Which route is sheltered?", "GET_SHELTERED_ROUTE"],
    ["Request the ramp.", "REQUEST_RAMP"],
    ["Request more boarding time.", "REQUEST_EXTRA_TIME"],
    ["Help me get off the bus.", "REQUEST_ALIGHTING_HELP"],
    ["Repeat that.", "REPEAT_GUIDANCE"],
    ["Guide me to the bus stop.", "START_DIRECTIONS"],
    ["Stop guidance.", "STOP_GUIDANCE"],
    ["End journey.", "END_JOURNEY"],
    ["Help", "HELP"],
  ])("maps %s to %s", (transcript, expected) => {
    expect(resolveRuleBasedIntent(transcript).type).toBe(expected);
  });

  it.each([
    "Can you deploy the ramp?",
    "I need the wheelchair ramp.",
    "Please request boarding assistance.",
  ])("maps ramp variant %s without AI", (transcript) => {
    expect(resolveRuleBasedIntent(transcript).type).toBe("REQUEST_RAMP");
  });

  it("returns grounded stop, bus, arrival, and journey answers", async () => {
    const { controller, spoken } = createHarness();

    await expect(
      controller.processTranscript("Where am I?"),
    ).resolves.toMatchObject({
      response: "You’re near Yusof Ishak House bus stop, Stop 16171.",
    });
    await expect(
      controller.processTranscript("What bus is here?"),
    ).resolves.toMatchObject({
      response: "Service 151 is currently at your stop.",
    });
    await expect(
      controller.processTranscript("When is my bus coming?"),
    ).resolves.toMatchObject({
      response: "Service 151 is expected in about 3 minutes.",
    });
    await expect(
      controller.processTranscript("What's my next stop?"),
    ).resolves.toMatchObject({
      response: "Your next stop is Information Technology.",
    });
    await expect(
      controller.processTranscript("How many stops are left?"),
    ).resolves.toMatchObject({
      response: "Your destination, Central Library, is 2 stops away.",
    });
    expect(spoken).toHaveLength(5);
  });

  it("does not invent shelter coverage for route options", async () => {
    const { controller } = createHarness();
    await expect(
      controller.processTranscript("Which route is sheltered?"),
    ).resolves.toMatchObject({
      intent: { type: "GET_SHELTERED_ROUTE" },
      response:
        "Shelter coverage isn’t verified for the current routes, so I can’t reliably identify a sheltered route yet.",
      sourceLabel: "Live journey",
    });
  });

  it("identifies routes with verified shelter coverage", async () => {
    const { controller } = createHarness({
      context: assistantContext({
        routeOptions: [
          {
            id: "151-central-library",
            title: "Route A",
            serviceNo: "151",
            walkingMinutes: 6,
            shelterCoverage: "FULL",
          },
        ],
      }),
    });
    await expect(
      controller.processTranscript("Which route is sheltered?"),
    ).resolves.toMatchObject({
      response: "Fully sheltered: Route A, Service 151.",
    });
  });

  it("refreshes transport context for a voice-only location question", async () => {
    const harness = createHarness({
      context: assistantContext({
        currentStop: null,
        busesAtStop: [],
        selectedBusAtStop: null,
      }),
    });
    (harness.actions.refreshLocationContext as jest.Mock).mockImplementation(
      async () => {
        harness.setContext(assistantContext());
        return { ok: true };
      },
    );

    await expect(
      harness.controller.processTranscript("What bus is here?"),
    ).resolves.toMatchObject({
      response: "Service 151 is currently at your stop.",
    });
    expect(harness.actions.refreshLocationContext).toHaveBeenCalledTimes(1);
  });

  it("returns an actionable nearest-stop fallback when location is unavailable", async () => {
    const harness = createHarness({
      context: assistantContext({
        currentStop: null,
        busesAtStop: [],
        selectedBusAtStop: null,
      }),
    });
    (harness.actions.refreshLocationContext as jest.Mock).mockResolvedValue({
      ok: false,
      reason:
        "I couldn’t identify your nearest bus stop. Use my location or choose a bus stop manually.",
    });

    await expect(
      harness.controller.processTranscript("Find my nearest bus stop"),
    ).resolves.toMatchObject({
      intent: { type: "GET_CURRENT_STOP" },
      response:
        "I couldn’t identify your nearest bus stop. Use my location or choose a bus stop manually.",
    });
  });

  it("uses shorter arrival wording in simplified mode", async () => {
    const { controller } = createHarness({
      context: assistantContext({
        preferences: {
          ...assistantContext().preferences,
          simplifiedJourney: true,
        },
      }),
    });
    await expect(
      controller.processTranscript("When is my bus coming?"),
    ).resolves.toMatchObject({ response: "Service 151. About 3 minutes." });
  });
});

describe("assistant action safety", () => {
  it("confirms a grounded ramp request before using Focused Assist", async () => {
    const { actions, controller } = createHarness();
    const confirmation =
      await controller.processTranscript("Request the ramp.");

    expect(confirmation).toMatchObject({
      response: "Request ramp assistance for Service 151?",
      pendingConfirmation: true,
      actionExecuted: false,
    });
    expect(actions.requestRamp).not.toHaveBeenCalled();

    const result = await controller.processTranscript("Yes.");
    expect(actions.requestRamp).toHaveBeenCalledWith("BUS-151");
    expect(result).toMatchObject({
      response: "Your ramp request for Service 151 has been sent.",
      actionExecuted: true,
    });
  });

  it("does not guess between multiple buses", async () => {
    const bus183 = { ...bus151, id: "BUS-183", serviceNo: "183" };
    const { actions, controller } = createHarness({
      context: assistantContext({
        selectedService: null,
        busesAtStop: [bus151, bus183],
        selectedBusAtStop: null,
      }),
    });

    const clarification =
      await controller.processTranscript("Request the ramp.");
    expect(clarification.response).toContain(
      "Service 151 and Service 183. Which one do you need?",
    );
    expect(actions.requestRamp).not.toHaveBeenCalled();

    await expect(controller.processTranscript("183")).resolves.toMatchObject({
      response: "Request ramp assistance for Service 183?",
    });
    await controller.processTranscript("Go ahead");
    expect(actions.requestRamp).toHaveBeenCalledWith("BUS-183");
  });

  it("uses the explicitly selected active-journey service among multiple buses", async () => {
    const bus183 = { ...bus151, id: "BUS-183", serviceNo: "183" };
    const { actions, controller } = createHarness({
      context: assistantContext({
        selectedService: "151",
        busesAtStop: [bus151, bus183],
        selectedBusAtStop: null,
      }),
    });

    await expect(
      controller.processTranscript("Request the ramp."),
    ).resolves.toMatchObject({
      response: "Request ramp assistance for Service 151?",
      pendingConfirmation: true,
    });
    await controller.processTranscript("Yes");
    expect(actions.requestRamp).toHaveBeenCalledWith("BUS-151");
  });

  it("cancels and expires pending confirmations", async () => {
    let now = 10_000;
    const { actions, controller } = createHarness({ now: () => now });
    await controller.processTranscript("Request ramp");
    await expect(controller.processTranscript("No")).resolves.toMatchObject({
      response: "Okay. I cancelled that action.",
    });
    expect(actions.requestRamp).not.toHaveBeenCalled();

    await controller.processTranscript("Request ramp");
    now += 31_000;
    await expect(controller.processTranscript("Yes")).resolves.toMatchObject({
      response:
        "That confirmation expired. Please ask me to perform the action again.",
    });
    expect(actions.requestRamp).not.toHaveBeenCalled();
  });

  it("rejects ramp requests when the stop or bus is unconfirmed", async () => {
    const { actions, controller } = createHarness({
      context: assistantContext({
        currentStop: null,
        busesAtStop: [],
        selectedBusAtStop: null,
      }),
    });
    const result = await controller.processTranscript("Request the ramp");
    expect(result.response).toContain("current bus stop isn’t confirmed");
    expect(actions.requestRamp).not.toHaveBeenCalled();
  });

  it("does not duplicate an acknowledged ramp request or call it ready", async () => {
    const { actions, controller } = createHarness({
      context: assistantContext({ rampStatus: "ACKNOWLEDGED" }),
    });
    const result = await controller.processTranscript("Request ramp");
    expect(result.response).toBe("The bus has received your ramp request.");
    expect(result.response.toLowerCase()).not.toContain("ramp is ready");
    expect(actions.requestRamp).not.toHaveBeenCalled();
  });

  it("confirms extra boarding time and alighting assistance", async () => {
    const boarding = createHarness();
    await expect(
      boarding.controller.processTranscript("I need more time to board"),
    ).resolves.toMatchObject({
      response: "Request more boarding time for Service 151?",
    });
    await boarding.controller.processTranscript("Yes");
    expect(boarding.actions.requestExtraBoardingTime).toHaveBeenCalledWith(
      "BUS-151",
    );

    const onboard = createHarness({
      context: assistantContext({
        onboard: true,
        journeyStage: "ONBOARD",
        busesAtStop: [],
        selectedBusAtStop: null,
      }),
    });
    await expect(
      onboard.controller.processTranscript("Help me get off"),
    ).resolves.toMatchObject({
      response:
        "I’ll request alighting assistance for Central Library. Should I send it?",
    });
    await onboard.controller.processTranscript("Yes");
    expect(onboard.actions.requestAlightingAssistance).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation before ending the current journey", async () => {
    const { actions, controller } = createHarness();
    await expect(
      controller.processTranscript("End my journey"),
    ).resolves.toMatchObject({
      response: "End your Service 151 journey?",
    });
    expect(actions.endJourney).not.toHaveBeenCalled();
    await controller.processTranscript("Confirm");
    expect(actions.endJourney).toHaveBeenCalledTimes(1);
  });

  it("rejects confirmation when the bound journey revision changes", async () => {
    const harness = createHarness({
      context: assistantContext({ journeyId: "journey-151", revision: 7 }),
    });
    await harness.controller.processTranscript("Request the ramp");
    harness.setContext(
      assistantContext({ journeyId: "journey-151", revision: 8 }),
    );

    await expect(
      harness.controller.processTranscript("Yes"),
    ).resolves.toMatchObject({
      response:
        "Your journey context changed, so I did not perform that action. Please ask again.",
      actionExecuted: false,
    });
    expect(harness.actions.requestRamp).not.toHaveBeenCalled();
    expect(
      harness.controller.getHealthSnapshot().confirmationRejections,
    ).toBe(1);
  });

  it("only requests an operator after an explicit confirmed passenger action", async () => {
    const { actions, controller } = createHarness();
    const pending = await controller.processTranscript(
      "Ask an operator for help",
    );
    expect(pending.pendingConfirmation).toBe(true);
    expect(actions.requestOperatorHelp).not.toHaveBeenCalled();

    const sent = await controller.processTranscript("Confirm");
    expect(sent.actionExecuted).toBe(true);
    expect(actions.requestOperatorHelp).toHaveBeenCalledTimes(1);
  });

  it("can ground operator help at a confirmed stop without an active journey", async () => {
    const { actions, controller } = createHarness({
      context: assistantContext({
        hasActiveJourney: false,
        selectedService: null,
      }),
    });
    await controller.processTranscript("Ask an operator for help");
    await controller.processTranscript("Confirm");
    expect(actions.requestOperatorHelp).toHaveBeenCalledTimes(1);
  });

  it("serializes rapid confirmations and executes a pending action once", async () => {
    const { actions, controller } = createHarness();
    await controller.processTranscript("Request the ramp");
    await Promise.all([
      controller.processTranscript("Yes"),
      controller.processTranscript("Yes"),
    ]);
    expect(actions.requestRamp).toHaveBeenCalledTimes(1);
  });

  it("uses journey stage for contextual help without requesting assistance", async () => {
    const { actions, controller } = createHarness({
      context: assistantContext({ onboard: true, journeyStage: "ONBOARD" }),
    });
    await expect(
      controller.processTranscript("Help me"),
    ).resolves.toMatchObject({
      response:
        "You can ask for your next stop, destination, or help getting off.",
    });
    expect(actions.requestAlightingAssistance).not.toHaveBeenCalled();
  });

  it("uses existing directions, stop, and repeat actions", async () => {
    const { actions, controller } = createHarness({
      context: assistantContext({ walkingGuidanceActive: true }),
    });
    await controller.processTranscript("Guide me to the bus stop");
    await controller.processTranscript("Stop guidance");
    const repeat = await controller.processTranscript("Repeat that");
    expect(actions.startDirectionsToSelectedStop).toHaveBeenCalledTimes(1);
    expect(actions.stopGuidance).toHaveBeenCalledTimes(1);
    expect(actions.repeatGuidance).toHaveBeenCalledTimes(1);
    expect(repeat.response).toBe("Turn left in 20 metres.");
  });
});

describe("bounded in-memory conversation context", () => {
  it("keeps only six turns and clears them after 15 minutes", async () => {
    let now = 1_000;
    const historySizes: number[] = [];
    const turnProvider: AssistantTurnProvider = {
      id: "history-test",
      resolveTurn: (request) => {
        historySizes.push(request.context.conversationHistory?.length ?? 0);
        return {
          kind: "COMMAND",
          intent: { type: "HELP" },
          confidence: 1,
          provider: "RULE_BASED",
        };
      },
    };
    const { controller } = createHarness({
      turnProvider,
      now: () => now,
    });
    for (let index = 0; index < 8; index += 1) {
      await controller.processTranscript(`question ${index}`);
      now += 1_000;
    }
    expect(historySizes.at(-1)).toBe(12);

    now += 15 * 60_000;
    await controller.processTranscript("after timeout");
    expect(historySizes.at(-1)).toBe(0);
  });
});

describe("structured AI fallback boundary", () => {
  it("accepts only validated structured AI intent fields", () => {
    expect(
      validateStructuredIntentResult({
        intent: "REQUEST_RAMP",
        serviceNo: "151",
        confidence: 0.96,
      }),
    ).toEqual({
      intent: { type: "REQUEST_RAMP", serviceNo: "151" },
      confidence: 0.96,
      provider: "AI",
    });
  });

  it("rejects malformed structured AI output", async () => {
    expect(validateStructuredIntentResult({ intent: "REQUEST_RAMP" })).toEqual({
      intent: { type: "UNKNOWN" },
      confidence: 0,
      provider: "FALLBACK",
    });
    const malformedAI: AssistantIntentProvider = {
      id: "malformed-ai",
      resolveIntent: () => ({ arbitrary: "execute javascript" }) as never,
    };
    const provider = new FallbackAssistantIntentProvider(
      new RuleBasedIntentProvider(),
      malformedAI,
    );
    const { actions, controller } = createHarness({ intentProvider: provider });
    const result = await controller.processTranscript("Could you handle it?");
    expect(result.intent.type).toBe("UNKNOWN");
    expect(actions.requestRamp).not.toHaveBeenCalled();
  });

  it("turns a low-confidence safety intent into clarification, not execution", async () => {
    const lowConfidenceAI: AssistantIntentProvider = {
      id: "low-confidence-ai",
      resolveIntent: () => ({
        intent: { type: "REQUEST_RAMP" },
        confidence: 0.52,
        provider: "AI",
      }),
    };
    const provider = new FallbackAssistantIntentProvider(
      new RuleBasedIntentProvider(),
      lowConfidenceAI,
    );
    const { actions, controller } = createHarness({ intentProvider: provider });
    const result = await controller.processTranscript("Could you handle it?");
    expect(result.pendingConfirmation).toBe(false);
    expect(result.resolutionKind).toBe("CLARIFY");
    expect(actions.requestRamp).not.toHaveBeenCalled();
  });

  it.each([
    [0.89, false],
    [0.9, true],
  ] as const)(
    "enforces the 0.90 AI state-change threshold at %s",
    async (confidence, shouldConfirm) => {
      const ai: AssistantIntentProvider = {
        id: "threshold-ai",
        resolveIntent: () => ({
          intent: { type: "REQUEST_RAMP" },
          confidence,
          provider: "AI",
        }),
      };
      const provider = new FallbackAssistantIntentProvider(
        new RuleBasedIntentProvider(),
        ai,
      );
      const { actions, controller } = createHarness({
        intentProvider: provider,
      });
      const result = await controller.processTranscript("Handle this for me");
      expect(result.pendingConfirmation).toBe(shouldConfirm);
      expect(actions.requestRamp).not.toHaveBeenCalled();
    },
  );

  it("requires confirmation for every AI-derived state-changing navigation command", async () => {
    const ai: AssistantIntentProvider = {
      id: "navigation-ai",
      resolveIntent: () => ({
        intent: { type: "START_DIRECTIONS" },
        confidence: 0.95,
        provider: "AI",
      }),
    };
    const provider = new FallbackAssistantIntentProvider(
      new RuleBasedIntentProvider(),
      ai,
    );
    const { actions, controller } = createHarness({ intentProvider: provider });
    const pending = await controller.processTranscript("Take me over there");
    expect(pending).toMatchObject({
      pendingConfirmation: true,
      actionExecuted: false,
      response: "Start walking guidance to the selected bus stop?",
    });
    expect(actions.startDirectionsToSelectedStop).not.toHaveBeenCalled();

    await controller.processTranscript("Confirm");
    expect(actions.startDirectionsToSelectedStop).toHaveBeenCalledTimes(1);
  });
});

describe("localized safety confirmations", () => {
  it.each([
    ["zh-SG", "next stop", "下一站是 Information Technology。"],
    [
      "ms-SG",
      "next stop",
      "Hentian seterusnya ialah Information Technology.",
    ],
    ["ta-SG", "next stop", "அடுத்த நிறுத்தம் Information Technology."],
  ] as const)(
    "replies in the selected %s locale for mixed-language live questions",
    async (locale, question, expected) => {
      const { controller } = createHarness({
        context: assistantContext({ locale }),
      });
      await expect(controller.processTranscript(question)).resolves.toMatchObject({
        response: expected,
        sourceLabel:
          locale === "zh-SG"
            ? "实时行程"
            : locale === "ms-SG"
              ? "Perjalanan langsung"
              : "நேரடி பயணம்",
      });
    },
  );

  it.each([
    ["zh-SG", "请为我请求斜坡板", "确认"],
    ["ms-SG", "Tolong minta tanjakan", "sahkan"],
    ["ta-SG", "சாய்வுப்பாதை வேண்டும்", "ஆம்"],
  ] as const)(
    "requires an explicit confirmation before a %s ramp request",
    async (locale, request, confirmation) => {
      const { actions, controller } = createHarness({
        context: assistantContext({ locale }),
      });
      const pending = await controller.processTranscript(request);
      expect(pending.pendingConfirmation).toBe(true);
      expect(actions.requestRamp).not.toHaveBeenCalled();

      const completed = await controller.processTranscript(confirmation);
      expect(completed.actionExecuted).toBe(true);
      expect(actions.requestRamp).toHaveBeenCalledWith("BUS-151");
    },
  );
});
