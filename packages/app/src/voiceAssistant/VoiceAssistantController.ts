import { AssistanceRequestStatus } from "@buspass/shared";
import {
  FallbackAssistantIntentProvider,
  type AssistantIntentProvider,
} from "./AssistantIntentProvider";
import type {
  AssistantActionResult,
  AssistantBusContext,
  AssistantContext,
  AssistantIntent,
  AssistantTurnResult,
  PendingAssistantAction,
} from "./types";

export type VoiceAssistantActions = {
  getContext: () => AssistantContext;
  refreshLocationContext: () => Promise<AssistantActionResult>;
  requestRamp: (busId: string) => Promise<AssistantActionResult>;
  requestExtraBoardingTime: (busId: string) => Promise<AssistantActionResult>;
  requestAlightingAssistance: () => Promise<AssistantActionResult>;
  startDirectionsToSelectedStop: () => Promise<AssistantActionResult>;
  stopGuidance: () => AssistantActionResult;
  repeatGuidance: () => AssistantActionResult & { text?: string };
  endJourney: () => Promise<AssistantActionResult>;
  speakResponse: (text: string) => boolean;
};

export type VoiceAssistantControllerOptions = {
  intentProvider?: AssistantIntentProvider;
  now?: () => number;
  confirmationTimeoutMs?: number;
  developmentLogging?: boolean;
};

const defaultConfirmationTimeoutMs = 30_000;
const minimumAIConfidence = 0.75;

export class VoiceAssistantController {
  private pendingAction: PendingAssistantAction | null = null;
  private readonly intentProvider: AssistantIntentProvider;
  private readonly now: () => number;
  private readonly confirmationTimeoutMs: number;
  private readonly developmentLogging: boolean;

  constructor(
    private readonly actions: VoiceAssistantActions,
    options: VoiceAssistantControllerOptions = {},
  ) {
    this.intentProvider =
      options.intentProvider ?? new FallbackAssistantIntentProvider();
    this.now = options.now ?? Date.now;
    this.confirmationTimeoutMs =
      options.confirmationTimeoutMs ?? defaultConfirmationTimeoutMs;
    this.developmentLogging = options.developmentLogging ?? false;
  }

  getAssistantContext() {
    return this.actions.getContext();
  }

  getPendingAction() {
    if (this.pendingAction && this.pendingAction.expiresAt <= this.now()) {
      this.pendingAction = null;
    }
    return this.pendingAction;
  }

  clearPendingAction() {
    this.pendingAction = null;
  }

  async processTranscript(transcript: string): Promise<AssistantTurnResult> {
    const trimmedTranscript = transcript.trim();
    const context = this.actions.getContext();
    const pendingResult = await this.resolvePendingTurn(
      trimmedTranscript,
      context,
    );
    if (pendingResult) return pendingResult;

    const resolution = await this.intentProvider.resolveIntent(
      trimmedTranscript,
      context,
    );
    this.logDevelopment("resolved", {
      transcript: trimmedTranscript,
      intent: resolution.intent.type,
      provider: resolution.provider,
      confidence: resolution.confidence,
    });

    if (
      resolution.provider === "AI" &&
      resolution.confidence < minimumAIConfidence
    ) {
      if (resolution.intent.type === "REQUEST_RAMP") {
        return this.prepareRampRequest(
          trimmedTranscript,
          context,
          resolution.intent.serviceNo,
          resolution.provider,
        );
      }
      return this.respond(
        trimmedTranscript,
        resolution.intent,
        "I’m not sure I understood. Do you want help with your bus, journey, directions, or accessibility assistance?",
        resolution.provider,
      );
    }

    return this.executeIntent(
      trimmedTranscript,
      resolution.intent,
      context,
      resolution.provider,
    );
  }

  private async resolvePendingTurn(
    transcript: string,
    context: AssistantContext,
  ) {
    const pending = this.pendingAction;
    if (!pending) return null;
    if (pending.expiresAt <= this.now()) {
      this.pendingAction = null;
      if (isConfirmationTranscript(transcript)) {
        return this.respond(
          transcript,
          { type: "CONFIRM" },
          "That confirmation expired. Please ask me to perform the action again.",
          "RULE_BASED",
        );
      }
      return null;
    }

    if (
      pending.intent.type === "SELECT_BUS_FOR_RAMP" ||
      pending.intent.type === "SELECT_BUS_FOR_EXTRA_TIME"
    ) {
      if (isCancelTranscript(transcript)) {
        this.pendingAction = null;
        return this.respond(
          transcript,
          { type: "CANCEL" },
          "Okay. I won’t send an assistance request.",
          "RULE_BASED",
        );
      }
      const selectedBus = busFromSelection(
        transcript,
        pending.intent.candidates,
      );
      if (!selectedBus) {
        const services = joinServices(pending.intent.candidates);
        return this.respond(
          transcript,
          { type: "UNKNOWN" },
          `Please say the service number. ${services}.`,
          "RULE_BASED",
          false,
          true,
        );
      }
      const requestType =
        pending.intent.type === "SELECT_BUS_FOR_RAMP"
          ? "REQUEST_RAMP"
          : "REQUEST_EXTRA_TIME";
      this.pendingAction = {
        intent: {
          type: requestType,
          busId: selectedBus.id,
          serviceNo: selectedBus.serviceNo,
        },
        confirmationText:
          requestType === "REQUEST_RAMP"
            ? `Request ramp assistance for Service ${selectedBus.serviceNo}?`
            : `Request more boarding time for Service ${selectedBus.serviceNo}?`,
        expiresAt: this.now() + this.confirmationTimeoutMs,
      };
      return this.respond(
        transcript,
        {
          type: requestType,
          serviceNo: selectedBus.serviceNo,
        },
        this.pendingAction.confirmationText,
        "RULE_BASED",
        false,
        true,
      );
    }

    if (isCancelTranscript(transcript)) {
      this.pendingAction = null;
      return this.respond(
        transcript,
        { type: "CANCEL" },
        "Okay. I cancelled that action.",
        "RULE_BASED",
      );
    }
    if (!isConfirmationTranscript(transcript)) {
      this.pendingAction = null;
      return null;
    }

    this.pendingAction = null;
    return this.executeConfirmedAction(transcript, pending, context);
  }

  private async executeIntent(
    transcript: string,
    intent: AssistantIntent,
    context: AssistantContext,
    provider: AssistantTurnResult["provider"],
  ): Promise<AssistantTurnResult> {
    switch (intent.type) {
      case "GET_CURRENT_STOP": {
        let refreshResult: AssistantActionResult | null = null;
        if (!context.currentStop) {
          refreshResult = await this.actions.refreshLocationContext();
          context = this.actions.getContext();
        }
        return this.respond(
          transcript,
          intent,
          context.currentStop
            ? `You’re near ${context.currentStop.description} bus stop, Stop ${context.currentStop.busStopCode}.`
            : (refreshResult?.reason ??
                "You’re not currently close enough to a known bus stop for me to identify one confidently."),
          provider,
        );
      }
      case "GET_BUS_AT_STOP":
        if (!context.currentStop) {
          await this.actions.refreshLocationContext();
          context = this.actions.getContext();
        }
        return this.respond(
          transcript,
          intent,
          busPresenceResponse(context),
          provider,
        );
      case "GET_ACTIVE_BUS":
        return this.respond(
          transcript,
          intent,
          context.selectedService
            ? `You’re waiting for Service ${context.selectedService}.`
            : "You don’t have a bus selected yet.",
          provider,
        );
      case "GET_ARRIVAL":
        return this.respond(
          transcript,
          intent,
          arrivalResponse(context),
          provider,
        );
      case "GET_NEXT_STOP":
        return this.respond(
          transcript,
          intent,
          context.nextStop
            ? `Your next stop is ${context.nextStop}.`
            : context.onboard
              ? "The next stop is unavailable right now."
              : "Your next stop will be available after your journey starts.",
          provider,
        );
      case "GET_STOPS_REMAINING":
        return this.respond(
          transcript,
          intent,
          stopsRemainingResponse(context),
          provider,
        );
      case "GET_DESTINATION":
        return this.respond(
          transcript,
          intent,
          context.destination
            ? `You’re getting off at ${context.destination}.`
            : "You haven’t selected where to get off yet.",
          provider,
        );
      case "REQUEST_RAMP":
        return this.prepareRampRequest(
          transcript,
          context,
          intent.serviceNo,
          provider,
        );
      case "REQUEST_EXTRA_TIME":
        return this.prepareExtraTimeRequest(
          transcript,
          context,
          intent.serviceNo,
          provider,
        );
      case "REQUEST_ALIGHTING_HELP":
        return this.prepareAlightingRequest(transcript, context, provider);
      case "START_DIRECTIONS": {
        if (!context.currentStop) {
          return this.respond(
            transcript,
            intent,
            "Choose a bus stop first, then ask me to guide you there.",
            provider,
          );
        }
        const action = await this.actions.startDirectionsToSelectedStop();
        return this.respond(
          transcript,
          intent,
          action.ok
            ? `Starting guidance to ${context.currentStop.description} bus stop.`
            : (action.reason ?? "I couldn’t start directions to the bus stop."),
          provider,
          action.ok,
        );
      }
      case "STOP_GUIDANCE": {
        const action = this.actions.stopGuidance();
        return this.respond(
          transcript,
          intent,
          action.ok
            ? "Guidance stopped."
            : (action.reason ?? "Walking guidance isn’t active."),
          provider,
          action.ok,
        );
      }
      case "REPEAT_GUIDANCE": {
        const action = this.actions.repeatGuidance();
        if (!action.ok) {
          return this.respond(
            transcript,
            intent,
            action.reason ?? "There isn’t a guidance message to repeat yet.",
            provider,
          );
        }
        return this.respond(
          transcript,
          intent,
          action.text ?? "Repeating the latest guidance.",
          provider,
          true,
          false,
          false,
          true,
        );
      }
      case "END_JOURNEY":
        if (!context.hasActiveJourney || !context.selectedService) {
          return this.respond(
            transcript,
            intent,
            "There isn’t an active journey to end.",
            provider,
          );
        }
        return this.setPending(
          transcript,
          intent,
          {
            type: "END_JOURNEY",
            serviceNo: context.selectedService,
          },
          `End your Service ${context.selectedService} journey?`,
          provider,
        );
      case "HELP":
        return this.respond(
          transcript,
          intent,
          contextualHelp(context),
          provider,
        );
      case "CONFIRM":
        return this.respond(
          transcript,
          intent,
          "There isn’t an action waiting for confirmation.",
          provider,
        );
      case "CANCEL":
        return this.respond(
          transcript,
          intent,
          "There isn’t a pending action to cancel.",
          provider,
        );
      case "UNKNOWN":
        return this.respond(
          transcript,
          intent,
          "I didn’t understand that. You can ask me about your bus, next stop, directions, or accessibility assistance.",
          provider,
        );
    }
  }

  private prepareRampRequest(
    transcript: string,
    context: AssistantContext,
    serviceNo: string | undefined,
    provider: AssistantTurnResult["provider"],
  ) {
    const existingStatus = rampStatusResponse(context.rampStatus);
    if (existingStatus) {
      return this.respond(
        transcript,
        { type: "REQUEST_RAMP" },
        existingStatus,
        provider,
      );
    }
    return this.prepareBoardingRequest(
      transcript,
      context,
      serviceNo,
      "REQUEST_RAMP",
      provider,
    );
  }

  private prepareExtraTimeRequest(
    transcript: string,
    context: AssistantContext,
    serviceNo: string | undefined,
    provider: AssistantTurnResult["provider"],
  ) {
    return this.prepareBoardingRequest(
      transcript,
      context,
      serviceNo,
      "REQUEST_EXTRA_TIME",
      provider,
    );
  }

  private prepareBoardingRequest(
    transcript: string,
    context: AssistantContext,
    requestedServiceNo: string | undefined,
    type: "REQUEST_RAMP" | "REQUEST_EXTRA_TIME",
    provider: AssistantTurnResult["provider"],
  ) {
    if (context.onboard) {
      return this.respond(
        transcript,
        { type },
        "You’re already onboard. You can ask me for help getting off the bus.",
        provider,
      );
    }
    if (!context.currentStop) {
      return this.respond(
        transcript,
        { type },
        "I can’t send that request because your current bus stop isn’t confirmed.",
        provider,
      );
    }
    const candidates = context.busesAtStop;
    const requestedBus = requestedServiceNo
      ? candidates.find(
          (bus) =>
            bus.serviceNo.toUpperCase() === requestedServiceNo.toUpperCase(),
        )
      : null;
    if (requestedServiceNo && !requestedBus) {
      return this.respond(
        transcript,
        { type, serviceNo: requestedServiceNo },
        `I can’t confirm Service ${requestedServiceNo} at this stop. No request was sent.`,
        provider,
      );
    }
    if (!requestedBus && candidates.length === 0) {
      return this.respond(
        transcript,
        { type },
        "No bus is currently detected at your stop, so I didn’t send a request.",
        provider,
      );
    }
    if (!requestedBus && candidates.length > 1) {
      const selectionType =
        type === "REQUEST_RAMP"
          ? "SELECT_BUS_FOR_RAMP"
          : "SELECT_BUS_FOR_EXTRA_TIME";
      return this.setPending(
        transcript,
        { type },
        { type: selectionType, candidates },
        `There are ${numberWord(candidates.length)} buses at the stop: ${joinServices(candidates)}. Which one do you need?`,
        provider,
      );
    }
    const bus = requestedBus ?? context.selectedBusAtStop ?? candidates[0];
    if (!bus) {
      return this.respond(
        transcript,
        { type },
        "I can’t confirm which bus needs assistance.",
        provider,
      );
    }
    if (type === "REQUEST_RAMP" && bus.wheelchairAccessible === false) {
      return this.respond(
        transcript,
        { type, serviceNo: bus.serviceNo },
        `Ramp assistance is unavailable on Service ${bus.serviceNo}. No request was sent.`,
        provider,
      );
    }
    const confirmation =
      type === "REQUEST_RAMP"
        ? `Request ramp assistance for Service ${bus.serviceNo}?`
        : `Request more boarding time for Service ${bus.serviceNo}?`;
    return this.setPending(
      transcript,
      { type, serviceNo: bus.serviceNo },
      { type, busId: bus.id, serviceNo: bus.serviceNo },
      confirmation,
      provider,
    );
  }

  private prepareAlightingRequest(
    transcript: string,
    context: AssistantContext,
    provider: AssistantTurnResult["provider"],
  ) {
    if (!context.onboard) {
      return this.respond(
        transcript,
        { type: "REQUEST_ALIGHTING_HELP" },
        "Alighting assistance is available once you’re onboard.",
        provider,
      );
    }
    if (
      context.alightingAssistanceStatus === AssistanceRequestStatus.SENDING ||
      context.alightingAssistanceStatus === AssistanceRequestStatus.ACKNOWLEDGED
    ) {
      return this.respond(
        transcript,
        { type: "REQUEST_ALIGHTING_HELP" },
        context.alightingAssistanceStatus ===
          AssistanceRequestStatus.ACKNOWLEDGED
          ? "The bus has received your alighting assistance request."
          : "Your alighting assistance request has already been sent.",
        provider,
      );
    }
    if (!context.destination) {
      return this.respond(
        transcript,
        { type: "REQUEST_ALIGHTING_HELP" },
        "Choose where you’re getting off before requesting alighting assistance.",
        provider,
      );
    }
    return this.setPending(
      transcript,
      { type: "REQUEST_ALIGHTING_HELP" },
      {
        type: "REQUEST_ALIGHTING_HELP",
        destination: context.destination,
      },
      `I’ll request alighting assistance for ${context.destination}. Should I send it?`,
      provider,
    );
  }

  private async executeConfirmedAction(
    transcript: string,
    pending: PendingAssistantAction,
    context: AssistantContext,
  ): Promise<AssistantTurnResult> {
    const pendingIntent = pending.intent;
    switch (pendingIntent.type) {
      case "REQUEST_RAMP": {
        const candidate = context.busesAtStop.find(
          (bus) => bus.id === pendingIntent.busId,
        );
        if (!context.currentStop || !candidate) {
          return this.respond(
            transcript,
            { type: "REQUEST_RAMP" },
            "I can’t confirm that bus is still at this stop. No request was sent.",
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestRamp(pendingIntent.busId);
        return this.respond(
          transcript,
          { type: "REQUEST_RAMP", serviceNo: pendingIntent.serviceNo },
          action.ok
            ? `Your ramp request for Service ${pendingIntent.serviceNo} has been sent.`
            : (action.reason ?? "I couldn’t send your ramp request."),
          "RULE_BASED",
          action.ok,
        );
      }
      case "REQUEST_EXTRA_TIME": {
        const candidate = context.busesAtStop.find(
          (bus) => bus.id === pendingIntent.busId,
        );
        if (!context.currentStop || !candidate) {
          return this.respond(
            transcript,
            { type: "REQUEST_EXTRA_TIME" },
            "I can’t confirm that bus is still at this stop. No request was sent.",
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestExtraBoardingTime(
          pendingIntent.busId,
        );
        return this.respond(
          transcript,
          {
            type: "REQUEST_EXTRA_TIME",
            serviceNo: pendingIntent.serviceNo,
          },
          action.ok
            ? `Your request for more boarding time on Service ${pendingIntent.serviceNo} has been sent.`
            : (action.reason ?? "I couldn’t request more boarding time."),
          "RULE_BASED",
          action.ok,
        );
      }
      case "REQUEST_ALIGHTING_HELP": {
        if (
          !context.onboard ||
          context.destination !== pendingIntent.destination
        ) {
          return this.respond(
            transcript,
            { type: "REQUEST_ALIGHTING_HELP" },
            "Your journey context changed, so I didn’t send the request.",
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestAlightingAssistance();
        return this.respond(
          transcript,
          { type: "REQUEST_ALIGHTING_HELP" },
          action.ok
            ? "Your alighting assistance request has been sent."
            : (action.reason ??
                "I couldn’t send your alighting assistance request."),
          "RULE_BASED",
          action.ok,
        );
      }
      case "END_JOURNEY": {
        if (
          !context.hasActiveJourney ||
          context.selectedService !== pendingIntent.serviceNo
        ) {
          return this.respond(
            transcript,
            { type: "END_JOURNEY" },
            "Your journey context changed, so I didn’t end it.",
            "RULE_BASED",
          );
        }
        const action = await this.actions.endJourney();
        return this.respond(
          transcript,
          { type: "END_JOURNEY" },
          action.ok
            ? "Your journey has ended. Find your bus is ready."
            : (action.reason ?? "I couldn’t end your journey."),
          "RULE_BASED",
          action.ok,
        );
      }
      case "SELECT_BUS_FOR_RAMP":
      case "SELECT_BUS_FOR_EXTRA_TIME":
        return this.respond(
          transcript,
          { type: "UNKNOWN" },
          "Please choose a service before confirming.",
          "RULE_BASED",
        );
    }
  }

  private setPending(
    transcript: string,
    intent: AssistantIntent,
    pendingIntent: PendingAssistantAction["intent"],
    confirmationText: string,
    provider: AssistantTurnResult["provider"],
  ) {
    this.pendingAction = {
      intent: pendingIntent,
      confirmationText,
      expiresAt: this.now() + this.confirmationTimeoutMs,
    };
    return this.respond(
      transcript,
      intent,
      confirmationText,
      provider,
      false,
      true,
    );
  }

  private respond(
    transcript: string,
    intent: AssistantIntent,
    response: string,
    provider: AssistantTurnResult["provider"],
    actionExecuted = false,
    pendingConfirmation = false,
    speak = true,
    alreadySpoken = false,
  ): AssistantTurnResult {
    const conciseResponse = response.trim();
    const spoken =
      alreadySpoken || (speak && this.actions.speakResponse(conciseResponse));
    this.logDevelopment("result", {
      intent: intent.type,
      provider,
      actionExecuted,
      pendingConfirmation,
      response: conciseResponse,
    });
    return {
      transcript,
      intent,
      response: conciseResponse,
      provider,
      spoken,
      actionExecuted,
      pendingConfirmation,
    };
  }

  private logDevelopment(event: string, value: Record<string, unknown>) {
    if (this.developmentLogging) {
      console.info(`[VoiceAssistant] ${event}`, value);
    }
  }
}

function busPresenceResponse(context: AssistantContext) {
  const buses = context.busesAtStop;
  if (!context.currentStop || buses.length === 0) {
    return "No bus is currently detected at your stop.";
  }
  if (buses.length > 1) {
    return `${joinServices(buses)} are currently detected at this stop.`;
  }
  const bus = buses[0];
  return bus.confidence === "HIGH"
    ? `Service ${bus.serviceNo} is currently at your stop.`
    : `Service ${bus.serviceNo} appears to be arriving.`;
}

function arrivalResponse(context: AssistantContext) {
  if (!context.selectedService) return "You don’t have a bus selected yet.";
  if (context.busArrivalSeconds === null) {
    return `Live arrival information for Service ${context.selectedService} is unavailable right now.`;
  }
  if (context.busArrivalSeconds <= 45) {
    return `Service ${context.selectedService} is arriving now.`;
  }
  const minutes = Math.max(1, Math.ceil(context.busArrivalSeconds / 60));
  return context.preferences.simplifiedJourney
    ? `Service ${context.selectedService}. About ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
    : `Service ${context.selectedService} is expected in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

function stopsRemainingResponse(context: AssistantContext) {
  if (!context.destination || context.stopsRemaining === null) {
    return "The number of stops remaining is unavailable right now.";
  }
  if (context.stopsRemaining === 0) {
    return `This is your destination, ${context.destination}.`;
  }
  if (context.stopsRemaining === 1) {
    return `${context.destination} is your next stop.`;
  }
  return `Your destination, ${context.destination}, is ${context.stopsRemaining} stops away.`;
}

function contextualHelp(context: AssistantContext) {
  if (context.walkingGuidanceActive) {
    return "You can ask me to repeat the directions or stop guidance.";
  }
  if (context.onboard) {
    return "You can ask for your next stop, destination, or help getting off.";
  }
  if (context.hasActiveJourney) {
    return "You can ask when your bus is arriving or request ramp assistance.";
  }
  if (context.currentStop) {
    return "You can ask me what bus is here or request boarding assistance.";
  }
  return "You can ask where you are, what bus is here, or choose a stop and ask for directions.";
}

function rampStatusResponse(status: AssistantContext["rampStatus"]) {
  if (status === "REQUESTING") return "Your ramp request is being sent.";
  if (status === "REQUESTED") return "Your ramp request has already been sent.";
  if (status === "ACKNOWLEDGED")
    return "The bus has received your ramp request.";
  if (status === "PREPARING_RAMP")
    return "The bus is preparing the ramp. Please wait.";
  if (status === "RAMP_READY")
    return "The ramp is ready. Board when the path is clear.";
  return null;
}

function busFromSelection(
  transcript: string,
  candidates: AssistantBusContext[],
) {
  const normalized = transcript.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return candidates.find((candidate) => {
    const service = candidate.serviceNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return normalized === service || normalized === `SERVICE${service}`;
  });
}

function joinServices(candidates: AssistantBusContext[]) {
  const labels = candidates.map((bus) => `Service ${bus.serviceNo}`);
  if (labels.length <= 1) return labels[0] ?? "No services";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function numberWord(value: number) {
  return value === 2 ? "two" : value === 3 ? "three" : String(value);
}

function isConfirmationTranscript(transcript: string) {
  return /^(yes|yeah|yep|confirm|please do|go ahead|do it)[.!]?$/i.test(
    transcript.trim(),
  );
}

function isCancelTranscript(transcript: string) {
  return /^(no|nope|cancel|do not|don't|never mind|stop)[.!]?$/i.test(
    transcript.trim(),
  );
}
