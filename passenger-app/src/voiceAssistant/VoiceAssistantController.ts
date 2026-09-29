import { AssistanceRequestStatus } from "@buspass/shared";
import {
  resolveRuleBasedIntent,
  type AssistantIntentProvider,
} from "./AssistantIntentProvider";
import {
  HybridAssistantTurnProvider,
  IntentProviderTurnAdapter,
} from "./AssistantTurnProvider";
import {
  assistantCopy,
  assistantSafetyCopy,
  normalizeAssistantLocale,
} from "./localization";
import { assistantIntentPolicy } from "./assistantIntentPolicies";
import { AssistantHealthMonitor } from "./assistantHealth";
import type {
  AssistantActionResult,
  AssistantBusContext,
  AssistantConversationMessage,
  AssistantContext,
  AssistantIntent,
  AssistantTurnResult,
  AssistantTurnProvider,
  PendingAssistantAction,
} from "./types";

export type VoiceAssistantActions = {
  getContext: () => AssistantContext;
  refreshLocationContext: () => Promise<AssistantActionResult>;
  requestRamp: (busId: string) => Promise<AssistantActionResult>;
  requestExtraBoardingTime: (busId: string) => Promise<AssistantActionResult>;
  requestAlightingAssistance: () => Promise<AssistantActionResult>;
  requestOperatorHelp: (reason: string) => Promise<AssistantActionResult>;
  startDirectionsToSelectedStop: () => Promise<AssistantActionResult>;
  stopGuidance: () => AssistantActionResult;
  repeatGuidance: () => AssistantActionResult & { text?: string };
  endJourney: () => Promise<AssistantActionResult>;
  speakResponse: (text: string) => boolean;
};

export type VoiceAssistantControllerOptions = {
  intentProvider?: AssistantIntentProvider;
  turnProvider?: AssistantTurnProvider;
  now?: () => number;
  confirmationTimeoutMs?: number;
  developmentLogging?: boolean;
  healthMonitor?: AssistantHealthMonitor;
};

const defaultConfirmationTimeoutMs = 30_000;
const turnDeadlineMs = 8_000;
const conversationTimeoutMs = 15 * 60_000;
const maximumConversationMessages = 12;

export class VoiceAssistantController {
  private pendingAction: PendingAssistantAction | null = null;
  private readonly turnProvider: AssistantTurnProvider;
  private readonly now: () => number;
  private readonly confirmationTimeoutMs: number;
  private readonly developmentLogging: boolean;
  private readonly healthMonitor: AssistantHealthMonitor;
  private conversationHistory: AssistantConversationMessage[] = [];
  private turnQueue: Promise<void> = Promise.resolve();
  private turnCounter = 0;
  private activeTurnId: string | undefined;

  constructor(
    private readonly actions: VoiceAssistantActions,
    options: VoiceAssistantControllerOptions = {},
  ) {
    this.turnProvider =
      options.turnProvider ??
      (options.intentProvider
        ? new IntentProviderTurnAdapter(options.intentProvider)
        : new HybridAssistantTurnProvider());
    this.now = options.now ?? Date.now;
    this.confirmationTimeoutMs =
      options.confirmationTimeoutMs ?? defaultConfirmationTimeoutMs;
    this.developmentLogging = options.developmentLogging ?? false;
    this.healthMonitor = options.healthMonitor ?? new AssistantHealthMonitor();
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

  processTranscript(transcript: string): Promise<AssistantTurnResult> {
    const queued = this.turnQueue.then(() =>
      this.processTranscriptSerial(transcript),
    );
    this.turnQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  getHealthSnapshot() {
    return this.healthMonitor.getSnapshot();
  }

  recordTurnFeedback(helpful: boolean) {
    this.healthMonitor.recordHelpfulness(helpful);
  }

  recordModelFailure(reasonCode: string) {
    this.healthMonitor.recordModelFailure(reasonCode);
  }

  private async processTranscriptSerial(
    transcript: string,
  ): Promise<AssistantTurnResult> {
    this.clearExpiredConversation();
    const result = await this.resolveTranscript(transcript);
    if (result.intent.type === "END_JOURNEY" && result.actionExecuted) {
      this.clearConversation();
    } else {
      this.rememberConversation(result.transcript, result.response);
    }
    this.healthMonitor.recordTurn(result);
    return result;
  }

  clearConversation() {
    this.conversationHistory = [];
  }

  private async resolveTranscript(
    transcript: string,
  ): Promise<AssistantTurnResult> {
    const trimmedTranscript = transcript.trim();
    this.turnCounter += 1;
    const turnId = `assistant-${this.now()}-${this.turnCounter}`;
    this.activeTurnId = turnId;
    const context = snapshotAssistantContext(
      this.actions.getContext(),
      this.conversationHistory,
    );
    const pendingResult = await this.resolvePendingTurn(
      trimmedTranscript,
      context,
    );
    if (pendingResult) return pendingResult;

    const startedAt = this.now();
    const resolution = await this.turnProvider.resolveTurn({
      turnId,
      transcript: trimmedTranscript,
      context,
      deadlineAt: this.now() + turnDeadlineMs,
    });
    this.logDevelopment("resolved", {
      transcript: trimmedTranscript,
      kind: resolution.kind,
      intent:
        resolution.kind === "COMMAND" ? resolution.intent.type : undefined,
      provider: resolution.provider,
      confidence:
        "confidence" in resolution ? resolution.confidence : undefined,
    });

    const latencyMs = Math.max(0, this.now() - startedAt);
    if (resolution.kind === "ANSWER") {
      return {
        ...this.respond(
          trimmedTranscript,
          { type: "UNKNOWN" },
          resolution.message,
          resolution.provider,
        ),
        resolutionKind: resolution.kind,
        evidenceIds: resolution.evidenceIds,
        sourceLabel: resolution.sourceLabel,
        confidence: resolution.confidence,
        latencyMs,
      };
    }
    if (resolution.kind === "CLARIFY") {
      return {
        ...this.respond(
          trimmedTranscript,
          { type: "UNKNOWN" },
          resolution.message,
          resolution.provider,
        ),
        resolutionKind: resolution.kind,
        confidence: resolution.confidence,
        latencyMs,
      };
    }
    if (resolution.kind === "UNSUPPORTED") {
      return {
        ...this.respond(
          trimmedTranscript,
          { type: "UNKNOWN" },
          resolution.reason,
          resolution.provider,
        ),
        resolutionKind: resolution.kind,
        latencyMs,
        fallbackReason: resolution.reason,
      };
    }

    const intentPolicy = assistantIntentPolicy(resolution.intent.type);
    if (
      resolution.provider === "AI" &&
      (!intentPolicy?.modelAllowed || !intentPolicy.contextValidator(context))
    ) {
      return {
        ...this.respond(
          trimmedTranscript,
          resolution.intent,
          assistantCopy(
            normalizeAssistantLocale(context.locale),
            "genericClarification",
          ),
          resolution.provider,
        ),
        resolutionKind: "CLARIFY",
        confidence: resolution.confidence,
        latencyMs,
      };
    }
    if (
      resolution.provider === "AI" &&
      resolution.confidence < (intentPolicy?.aiConfidenceThreshold ?? 1)
    ) {
      return {
        ...this.respond(
          trimmedTranscript,
          resolution.intent,
          assistantCopy(
            normalizeAssistantLocale(context.locale),
            "genericClarification",
          ),
          resolution.provider,
        ),
        resolutionKind: "CLARIFY",
        confidence: resolution.confidence,
        latencyMs,
      };
    }

    const result = await this.executeIntent(
      trimmedTranscript,
      resolution.intent,
      context,
      resolution.provider,
    );
    return {
      ...result,
      resolutionKind: "COMMAND",
      sourceLabel: assistantCopy(
        normalizeAssistantLocale(context.locale),
        "sourceLive",
      ),
      confidence: resolution.confidence,
      latencyMs,
    };
  }

  private rememberConversation(transcript: string, response: string) {
    const at = this.now();
    this.conversationHistory.push(
      { role: "user", text: transcript, at },
      { role: "assistant", text: response, at },
    );
    if (this.conversationHistory.length > maximumConversationMessages) {
      this.conversationHistory = this.conversationHistory.slice(
        -maximumConversationMessages,
      );
    }
  }

  private clearExpiredConversation() {
    const latest = this.conversationHistory.at(-1);
    if (latest && this.now() - latest.at >= conversationTimeoutMs) {
      this.clearConversation();
    }
  }

  private async resolvePendingTurn(
    transcript: string,
    context: AssistantContext,
  ) {
    const pending = this.pendingAction;
    if (!pending) return null;
    if (pending.expiresAt <= this.now()) {
      this.pendingAction = null;
      if (isConfirmationTranscript(transcript, context.locale)) {
        return this.respond(
          transcript,
          { type: "CONFIRM" },
          assistantSafetyCopy(context.locale, "confirmationExpired"),
          "RULE_BASED",
        );
      }
      return null;
    }

    if (isCancelTranscript(transcript, context.locale)) {
      this.pendingAction = null;
      return this.respond(
        transcript,
        { type: "CANCEL" },
        assistantSafetyCopy(context.locale, "actionCancelled"),
        "RULE_BASED",
      );
    }

    if (pending.contextFingerprint !== assistantContextFingerprint(context)) {
      this.pendingAction = null;
      this.healthMonitor.recordConfirmationRejection();
      if (!isConfirmationTranscript(transcript, context.locale)) return null;
      return this.respond(
        transcript,
        { type: "CONFIRM" },
        assistantSafetyCopy(context.locale, "confirmationContextChanged"),
        "RULE_BASED",
      );
    }

    if (
      pending.intent.type === "SELECT_BUS_FOR_RAMP" ||
      pending.intent.type === "SELECT_BUS_FOR_EXTRA_TIME"
    ) {
      const selectedBus = busFromSelection(
        transcript,
        pending.intent.candidates,
      );
      if (!selectedBus) {
        const services = joinServices(pending.intent.candidates);
        return this.respond(
          transcript,
          { type: "UNKNOWN" },
          assistantSafetyCopy(context.locale, "sayService", { services }),
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
            ? assistantSafetyCopy(context.locale, "rampConfirmation", {
                service: selectedBus.serviceNo,
              })
            : assistantSafetyCopy(context.locale, "extraTimeConfirmation", {
                service: selectedBus.serviceNo,
              }),
        expiresAt: this.now() + this.confirmationTimeoutMs,
        contextFingerprint: assistantContextFingerprint(context),
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

    if (!isConfirmationTranscript(transcript, context.locale)) {
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
            ? assistantCopy(context.locale, "stopKnown", {
                description: context.currentStop.description,
                stop: context.currentStop.busStopCode,
              })
            : (refreshResult?.reason ??
                assistantCopy(context.locale, "stopUnknown")),
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
            ? assistantCopy(context.locale, "selectedBus", {
                service: context.selectedService,
              })
            : assistantCopy(context.locale, "noSelectedBus"),
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
            ? assistantCopy(context.locale, "nextStop", {
                stop: context.nextStop,
              })
            : context.onboard
              ? assistantCopy(context.locale, "nextStopUnavailable")
              : assistantCopy(context.locale, "nextStopAfterStart"),
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
            ? assistantCopy(context.locale, "destinationKnown", {
                destination: context.destination,
              })
            : assistantCopy(context.locale, "destinationUnknown"),
          provider,
        );
      case "GET_SHELTERED_ROUTE":
        return this.respond(
          transcript,
          intent,
          shelteredRouteResponse(context),
          provider,
        );
      case "GET_STOP_AMENITIES":
        return this.respond(
          transcript,
          intent,
          stopAmenitiesResponse(context),
          provider,
        );
      case "GET_SERVICE_ADVISORIES":
        return this.respond(
          transcript,
          intent,
          serviceAdvisoryResponse(context),
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
        if (provider === "AI") {
          return this.setPending(
            transcript,
            intent,
            { type: "START_DIRECTIONS" },
            assistantSafetyCopy(context.locale, "startDirectionsConfirmation"),
            provider,
            context,
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
        if (provider === "AI") {
          return this.setPending(
            transcript,
            intent,
            { type: "STOP_GUIDANCE" },
            assistantSafetyCopy(context.locale, "stopGuidanceConfirmation"),
            provider,
            context,
          );
        }
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
          assistantSafetyCopy(context.locale, "endConfirmation", {
            service: context.selectedService,
          }),
          provider,
          context,
        );
      case "REQUEST_OPERATOR_HELP":
        if (!context.hasActiveJourney && !context.currentStop) {
          return this.respond(
            transcript,
            intent,
            assistantSafetyCopy(context.locale, "operatorNeedsJourney"),
            provider,
          );
        }
        return this.setPending(
          transcript,
          intent,
          {
            type: "REQUEST_OPERATOR_HELP",
            reason: "Passenger requested help through GoAssist",
          },
          assistantSafetyCopy(context.locale, "operatorConfirmation"),
          provider,
          context,
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
        assistantSafetyCopy(context.locale, "onboardBoardingBlocked"),
        provider,
      );
    }
    if (!context.currentStop) {
      return this.respond(
        transcript,
        { type },
        assistantSafetyCopy(context.locale, "stopUnconfirmed"),
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
    const activeJourneyBus =
      context.selectedBusAtStop ??
      (context.selectedService
        ? candidates.find(
            (bus) =>
              bus.serviceNo.toUpperCase() ===
              context.selectedService?.toUpperCase(),
          )
        : null);
    if (requestedServiceNo && !requestedBus) {
      return this.respond(
        transcript,
        { type, serviceNo: requestedServiceNo },
        assistantSafetyCopy(context.locale, "serviceUnconfirmed", {
          service: requestedServiceNo,
        }),
        provider,
      );
    }
    if (!requestedBus && candidates.length === 0) {
      return this.respond(
        transcript,
        { type },
        assistantSafetyCopy(context.locale, "noBusDetected"),
        provider,
      );
    }
    if (!requestedBus && !activeJourneyBus && candidates.length > 1) {
      const selectionType =
        type === "REQUEST_RAMP"
          ? "SELECT_BUS_FOR_RAMP"
          : "SELECT_BUS_FOR_EXTRA_TIME";
      return this.setPending(
        transcript,
        { type },
        { type: selectionType, candidates },
        assistantSafetyCopy(context.locale, "chooseBus", {
          count: candidates.length,
          services: joinServices(candidates),
        }),
        provider,
        context,
      );
    }
    const bus = requestedBus ?? activeJourneyBus ?? candidates[0];
    if (!bus) {
      return this.respond(
        transcript,
        { type },
        assistantSafetyCopy(context.locale, "busUnconfirmed"),
        provider,
      );
    }
    if (type === "REQUEST_RAMP" && bus.wheelchairAccessible === false) {
      return this.respond(
        transcript,
        { type, serviceNo: bus.serviceNo },
        assistantSafetyCopy(context.locale, "rampUnavailable", {
          service: bus.serviceNo,
        }),
        provider,
      );
    }
    const confirmation =
      type === "REQUEST_RAMP"
        ? assistantSafetyCopy(context.locale, "rampConfirmation", {
            service: bus.serviceNo,
          })
        : assistantSafetyCopy(context.locale, "extraTimeConfirmation", {
            service: bus.serviceNo,
          });
    return this.setPending(
      transcript,
      { type, serviceNo: bus.serviceNo },
      { type, busId: bus.id, serviceNo: bus.serviceNo },
      confirmation,
      provider,
      context,
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
        assistantSafetyCopy(context.locale, "alightingOnboardOnly"),
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
        assistantSafetyCopy(context.locale, "destinationRequired"),
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
      assistantSafetyCopy(context.locale, "alightingConfirmation", {
        destination: context.destination,
      }),
      provider,
      context,
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
            assistantSafetyCopy(context.locale, "busChanged"),
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestRamp(pendingIntent.busId);
        return this.respond(
          transcript,
          { type: "REQUEST_RAMP", serviceNo: pendingIntent.serviceNo },
          action.ok
            ? assistantSafetyCopy(context.locale, "rampSent", {
                service: pendingIntent.serviceNo,
              })
            : (action.reason ??
                assistantSafetyCopy(context.locale, "rampFailed")),
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
            assistantSafetyCopy(context.locale, "busChanged"),
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
            ? assistantSafetyCopy(context.locale, "extraTimeSent", {
                service: pendingIntent.serviceNo,
              })
            : (action.reason ??
                assistantSafetyCopy(context.locale, "extraTimeFailed")),
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
            assistantSafetyCopy(context.locale, "journeyChanged"),
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestAlightingAssistance();
        return this.respond(
          transcript,
          { type: "REQUEST_ALIGHTING_HELP" },
          action.ok
            ? assistantSafetyCopy(context.locale, "alightingSent")
            : (action.reason ??
                assistantSafetyCopy(context.locale, "alightingFailed")),
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
            ? assistantSafetyCopy(context.locale, "journeyEnded")
            : (action.reason ??
                assistantSafetyCopy(context.locale, "journeyEndFailed")),
          "RULE_BASED",
          action.ok,
        );
      }
      case "REQUEST_OPERATOR_HELP": {
        if (!context.hasActiveJourney && !context.currentStop) {
          return this.respond(
            transcript,
            { type: "REQUEST_OPERATOR_HELP" },
            assistantSafetyCopy(context.locale, "confirmationContextChanged"),
            "RULE_BASED",
          );
        }
        const action = await this.actions.requestOperatorHelp(
          pendingIntent.reason,
        );
        return this.respond(
          transcript,
          { type: "REQUEST_OPERATOR_HELP" },
          action.ok
            ? assistantSafetyCopy(context.locale, "operatorSent")
            : (action.reason ??
                assistantSafetyCopy(context.locale, "operatorFailed")),
          "RULE_BASED",
          action.ok,
        );
      }
      case "START_DIRECTIONS": {
        if (!context.currentStop) {
          return this.respond(
            transcript,
            { type: "START_DIRECTIONS" },
            assistantSafetyCopy(context.locale, "confirmationContextChanged"),
            "RULE_BASED",
          );
        }
        const action = await this.actions.startDirectionsToSelectedStop();
        return this.respond(
          transcript,
          { type: "START_DIRECTIONS" },
          action.ok
            ? `Starting guidance to ${context.currentStop.description} bus stop.`
            : (action.reason ?? "I couldn’t start directions to the bus stop."),
          "RULE_BASED",
          action.ok,
        );
      }
      case "STOP_GUIDANCE": {
        const action = this.actions.stopGuidance();
        return this.respond(
          transcript,
          { type: "STOP_GUIDANCE" },
          action.ok
            ? "Guidance stopped."
            : (action.reason ?? "Walking guidance isn’t active."),
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
    context: AssistantContext,
  ) {
    this.pendingAction = {
      intent: pendingIntent,
      confirmationText,
      expiresAt: this.now() + this.confirmationTimeoutMs,
      contextFingerprint: assistantContextFingerprint(context),
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
      turnId: this.activeTurnId,
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
    return assistantCopy(context.locale, "noBusDetected");
  }
  if (buses.length > 1) {
    return assistantCopy(context.locale, "busesDetected", {
      services: joinServices(buses),
    });
  }
  const bus = buses[0];
  return bus.confidence === "HIGH"
    ? assistantCopy(context.locale, "busAtStop", { service: bus.serviceNo })
    : assistantCopy(context.locale, "busArriving", {
        service: bus.serviceNo,
      });
}

function arrivalResponse(context: AssistantContext) {
  if (!context.selectedService)
    return assistantCopy(context.locale, "noSelectedBus");
  if (context.busArrivalSeconds === null) {
    return assistantCopy(context.locale, "arrivalUnavailable", {
      service: context.selectedService,
    });
  }
  if (context.busArrivalSeconds <= 45) {
    return assistantCopy(context.locale, "arrivalNow", {
      service: context.selectedService,
    });
  }
  const minutes = Math.max(1, Math.ceil(context.busArrivalSeconds / 60));
  return assistantCopy(
    context.locale,
    context.preferences.simplifiedJourney
      ? "arrivalMinutesSimple"
      : "arrivalMinutes",
    {
      service: context.selectedService,
      minutes,
      unit: minutes === 1 ? "minute" : "minutes",
    },
  );
}

function stopsRemainingResponse(context: AssistantContext) {
  if (!context.destination || context.stopsRemaining === null) {
    return assistantCopy(context.locale, "stopsUnavailable");
  }
  if (context.stopsRemaining === 0) {
    return assistantCopy(context.locale, "destinationHere", {
      destination: context.destination,
    });
  }
  if (context.stopsRemaining === 1) {
    return assistantCopy(context.locale, "destinationNext", {
      destination: context.destination,
    });
  }
  return assistantCopy(context.locale, "stopsAway", {
    destination: context.destination,
    count: context.stopsRemaining,
  });
}

function shelteredRouteResponse(context: AssistantContext) {
  const locale = normalizeAssistantLocale(context.locale);
  const routeOptions = context.routeOptions ?? [];
  if (routeOptions.length === 0) {
    return assistantCopy(locale, "shelterPlanRequired");
  }

  const fullySheltered = routeOptions.filter(
    (route) => route.shelterCoverage === "FULL",
  );
  if (fullySheltered.length > 0) {
    return assistantCopy(locale, "shelterFullRoutes", {
      routes: fullySheltered.map(routeOptionLabel).join(", "),
    });
  }

  const partlySheltered = routeOptions.filter(
    (route) => route.shelterCoverage === "PARTIAL",
  );
  if (partlySheltered.length > 0) {
    return assistantCopy(locale, "shelterPartialRoutes", {
      routes: partlySheltered.map(routeOptionLabel).join(", "),
    });
  }

  return assistantCopy(locale, "shelterUnverified");
}

function stopAmenitiesResponse(context: AssistantContext) {
  const locale = normalizeAssistantLocale(context.locale);
  const amenities = context.currentStopAmenities;
  if (!context.currentStop || !amenities) {
    return localizedOperationalCopy(locale, "AMENITIES_UNAVAILABLE");
  }
  const available = [
    [amenities.shelter, "shelter"],
    [amenities.seating, "seating"],
    [amenities.lighting, "lighting"],
    [amenities.tactilePaving, "tactile paving"],
    [amenities.stepFreeKerb, "step-free kerb"],
    [amenities.audioBeacon, "audio beacon"],
    [amenities.physicalAssistButton, "physical assistance button"],
  ]
    .filter(([status]) => status === "YES")
    .map(([, label]) => label);
  if (available.length === 0) {
    return `${localizedOperationalCopy(locale, "AMENITIES_UNKNOWN")} ${amenities.provenance.sourceLabel}.`;
  }
  return `${localizedOperationalCopy(locale, "AMENITIES_PREFIX")} ${available.join(", ")}. ${amenities.provenance.sourceLabel}.`;
}

function serviceAdvisoryResponse(context: AssistantContext) {
  const locale = normalizeAssistantLocale(context.locale);
  const advisories = context.serviceAdvisories ?? [];
  if (advisories.length === 0) {
    return localizedOperationalCopy(locale, "NO_ADVISORIES");
  }
  return `${localizedOperationalCopy(locale, "ADVISORIES_PREFIX")} ${advisories
    .slice(0, 2)
    .map((advisory) => advisory.title)
    .join(" ")} ${advisories[0].provenance.sourceLabel}.`;
}

function localizedOperationalCopy(
  locale: AssistantContext["locale"],
  key:
    | "AMENITIES_UNAVAILABLE"
    | "AMENITIES_UNKNOWN"
    | "AMENITIES_PREFIX"
    | "NO_ADVISORIES"
    | "ADVISORIES_PREFIX",
) {
  const copy = {
    "en-SG": {
      AMENITIES_UNAVAILABLE:
        "Choose or confirm a bus stop to check its facilities.",
      AMENITIES_UNKNOWN:
        "Verified facility information is unavailable for this stop.",
      AMENITIES_PREFIX: "Verified at this stop:",
      NO_ADVISORIES:
        "There are no verified advisories for your current stop or service.",
      ADVISORIES_PREFIX: "Travel notice:",
    },
    "zh-SG": {
      AMENITIES_UNAVAILABLE: "请先选择或确认巴士站，以查看站点设施。",
      AMENITIES_UNKNOWN: "此站暂无已验证的设施资料。",
      AMENITIES_PREFIX: "此站已验证的设施：",
      NO_ADVISORIES: "当前车站或服务没有已验证的通知。",
      ADVISORIES_PREFIX: "出行通知：",
    },
    "ms-SG": {
      AMENITIES_UNAVAILABLE:
        "Pilih atau sahkan perhentian bas untuk menyemak kemudahannya.",
      AMENITIES_UNKNOWN:
        "Maklumat kemudahan yang disahkan tidak tersedia untuk perhentian ini.",
      AMENITIES_PREFIX: "Disahkan di perhentian ini:",
      NO_ADVISORIES:
        "Tiada nasihat yang disahkan untuk perhentian atau perkhidmatan semasa anda.",
      ADVISORIES_PREFIX: "Notis perjalanan:",
    },
    "ta-SG": {
      AMENITIES_UNAVAILABLE:
        "வசதிகளைச் சரிபார்க்க பேருந்து நிறுத்தத்தைத் தேர்ந்தெடுக்கவும் அல்லது உறுதிப்படுத்தவும்.",
      AMENITIES_UNKNOWN:
        "இந்த நிறுத்தத்திற்கான சரிபார்க்கப்பட்ட வசதி தகவல் கிடைக்கவில்லை.",
      AMENITIES_PREFIX: "இந்த நிறுத்தத்தில் சரிபார்க்கப்பட்டவை:",
      NO_ADVISORIES:
        "உங்கள் தற்போதைய நிறுத்தம் அல்லது சேவைக்கு சரிபார்க்கப்பட்ட அறிவிப்புகள் இல்லை.",
      ADVISORIES_PREFIX: "பயண அறிவிப்பு:",
    },
  } as const;
  return copy[normalizeAssistantLocale(locale)][key];
}

function routeOptionLabel(
  route: NonNullable<AssistantContext["routeOptions"]>[number],
) {
  return `${route.title}, Service ${route.serviceNo}`;
}

function contextualHelp(context: AssistantContext) {
  if (context.walkingGuidanceActive) {
    return assistantCopy(context.locale, "helpWalking");
  }
  if (context.onboard) {
    return assistantCopy(context.locale, "helpOnboard");
  }
  if (context.hasActiveJourney) {
    return assistantCopy(context.locale, "helpJourney");
  }
  if (context.currentStop) {
    return assistantCopy(context.locale, "helpAtStop");
  }
  return assistantCopy(context.locale, "helpDiscovery");
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

function isConfirmationTranscript(
  transcript: string,
  locale: AssistantContext["locale"],
) {
  return (
    resolveRuleBasedIntent(transcript, normalizeAssistantLocale(locale))
      .type === "CONFIRM"
  );
}

function isCancelTranscript(
  transcript: string,
  locale: AssistantContext["locale"],
) {
  return (
    resolveRuleBasedIntent(transcript, normalizeAssistantLocale(locale))
      .type === "CANCEL"
  );
}

export function assistantContextFingerprint(context: AssistantContext) {
  return JSON.stringify({
    journeyId: context.journeyId ?? null,
    revision: context.revision ?? 0,
    journeyStage: context.journeyStage,
    onboard: context.onboard,
    stopCode: context.currentStop?.busStopCode ?? null,
    selectedService: context.selectedService,
    selectedBusId: context.selectedBusAtStop?.id ?? null,
    selectedBusConfidence: context.selectedBusAtStop?.confidence ?? null,
    buses: context.busesAtStop
      .map((bus) => `${bus.id}:${bus.serviceNo}:${bus.confidence}`)
      .sort(),
    destination: context.destination,
    activeCaseId: context.activeCaseId ?? null,
    rampStatus: context.rampStatus,
    alightingAssistanceStatus: context.alightingAssistanceStatus,
    walkingGuidanceActive: context.walkingGuidanceActive,
    walkingRouteAvailable: context.walkingRouteAvailable,
  });
}

function snapshotAssistantContext(
  context: AssistantContext,
  conversationHistory: AssistantConversationMessage[],
): AssistantContext {
  return {
    ...context,
    currentStop: context.currentStop ? { ...context.currentStop } : null,
    busesAtStop: context.busesAtStop.map((bus) => ({ ...bus })),
    selectedBusAtStop: context.selectedBusAtStop
      ? { ...context.selectedBusAtStop }
      : null,
    routeOptions: context.routeOptions?.map((route) => ({ ...route })),
    currentStopAmenities: context.currentStopAmenities
      ? {
          ...context.currentStopAmenities,
          provenance: { ...context.currentStopAmenities.provenance },
        }
      : null,
    serviceAdvisories: context.serviceAdvisories?.map((advisory) => ({
      ...advisory,
      affectedServices: [...advisory.affectedServices],
      affectedStops: [...advisory.affectedStops],
      provenance: { ...advisory.provenance },
    })),
    preferences: { ...context.preferences },
    conversationHistory: conversationHistory.map((message) => ({
      ...message,
    })),
  };
}
