import { AssistanceRequestStatus } from "@buspass/shared";
import {
  getBusesAtCurrentStop,
  resolveCurrentStop,
  type BusPresenceProvider,
} from "./presenceProvider";
import type {
  BusAtStop,
  FocusedAssistContext,
  FocusedAssistContextInput,
} from "./types";

export interface FocusedAssistController {
  getContext(): FocusedAssistContext;
  selectBus(busId: string): void;
  requestRamp(): Promise<boolean>;
  requestRampForBus(busId: string): Promise<boolean>;
  requestExtraTime(): Promise<boolean>;
  requestExtraTimeForBus(busId: string): Promise<boolean>;
  getRampStatus(): FocusedAssistContext["state"];
  requestAlightingAssistance(): Promise<boolean>;
  refreshContext(): Promise<void>;
}

export type FocusedAssistControllerAdapters = {
  getContext: () => FocusedAssistContext;
  selectBus: (busId: string) => void;
  requestRamp: (
    bus: BusAtStop,
    context: FocusedAssistContext,
  ) => Promise<boolean>;
  requestExtraTime: (
    bus: BusAtStop,
    context: FocusedAssistContext,
  ) => Promise<boolean>;
  requestAlightingAssistance: () => Promise<boolean>;
  refreshContext: () => Promise<void>;
  reportError: (message: string) => void;
};

export function createFocusedAssistController(
  adapters: FocusedAssistControllerAdapters,
): FocusedAssistController {
  async function requestBoardingAssistance(
    kind: "RAMP" | "EXTRA_TIME",
    requestedBusId?: string,
  ) {
    const context = adapters.getContext();
    const bus = requestedBusId
      ? context.buses.find((candidate) => candidate.id === requestedBusId)
      : context.selectedBus;
    if (!bus) {
      adapters.reportError("Choose a bus before requesting assistance.");
      return false;
    }
    if (kind === "RAMP" && bus.wheelchairAccessible === false) {
      adapters.reportError(
        "Ramp assistance is unavailable on this bus. Please choose another bus.",
      );
      return false;
    }
    if (
      context.state === "REQUESTING" ||
      context.state === "REQUESTED" ||
      context.state === "ACKNOWLEDGED" ||
      context.state === "PREPARING_RAMP" ||
      context.state === "RAMP_READY"
    ) {
      return false;
    }
    if (
      context.state !== "ONE_BUS_PRESENT" &&
      context.state !== "BUS_CONFIRMATION_REQUIRED" &&
      context.state !== "MULTIPLE_BUSES_PRESENT" &&
      !(kind === "EXTRA_TIME" && context.state === "RAMP_UNAVAILABLE") &&
      context.state !== "ERROR"
    ) {
      adapters.reportError("We cannot confirm which bus needs assistance yet.");
      return false;
    }
    const selectedContext = { ...context, selectedBus: bus };
    return kind === "RAMP"
      ? adapters.requestRamp(bus, selectedContext)
      : adapters.requestExtraTime(bus, selectedContext);
  }

  return {
    getContext: adapters.getContext,
    selectBus: adapters.selectBus,
    requestRamp: () => requestBoardingAssistance("RAMP"),
    requestRampForBus: (busId) => requestBoardingAssistance("RAMP", busId),
    requestExtraTime: () => requestBoardingAssistance("EXTRA_TIME"),
    requestExtraTimeForBus: (busId) =>
      requestBoardingAssistance("EXTRA_TIME", busId),
    getRampStatus() {
      return adapters.getContext().state;
    },
    requestAlightingAssistance: adapters.requestAlightingAssistance,
    refreshContext: adapters.refreshContext,
  };
}

export function deriveFocusedAssistContext(
  input: FocusedAssistContextInput,
  provider: BusPresenceProvider,
): FocusedAssistContext {
  const stopResolution = resolveCurrentStop({
    location: input.location,
    nearbyStops: input.nearbyStops,
    manuallySelectedStop: input.manuallySelectedStop,
  });
  const emptyRequest = input.request;
  if (input.onboard) {
    return {
      state: "ONBOARD",
      stop: stopResolution.stop,
      buses: [],
      selectedBus: null,
      request: input.request,
      stopResolution,
      isDemoPresence: false,
      destinationName: input.destinationName,
      destinationIsNext: input.destinationIsNext,
    };
  }
  if (input.locating) {
    return baseContext("LOCATING", stopResolution, emptyRequest, input);
  }
  if (!stopResolution.stop) {
    return baseContext("NO_STOP", stopResolution, emptyRequest, input);
  }

  const buses = getBusesAtCurrentStop(provider, {
    currentStop: stopResolution.stop,
    arrivals: input.arrivals,
    activeJourney: input.activeJourney,
  });
  const requestedBus = input.request.bus;
  const activeJourneyBus = buses.find(
    (bus) => bus.activeJourneyMatch && bus.confidence === "HIGH",
  );
  const selectedBus =
    (input.selectedBusId
      ? buses.find((bus) => bus.id === input.selectedBusId)
      : null) ??
    requestedBus ??
    activeJourneyBus ??
    (buses.filter((bus) => bus.confidence === "HIGH").length === 1
      ? (buses.find((bus) => bus.confidence === "HIGH") ?? null)
      : buses.length === 1
        ? buses[0]
        : null);
  const requestState = stateForRequest(input.request.status);
  if (input.request.submitting || requestState) {
    return {
      state: input.request.submitting ? "REQUESTING" : requestState!,
      stop: input.request.stop ?? stopResolution.stop,
      buses,
      selectedBus,
      request: input.request,
      stopResolution,
      isDemoPresence: selectedBus?.source === "DEMO",
      destinationName: input.destinationName,
      destinationIsNext: input.destinationIsNext,
    };
  }
  if (input.request.error) {
    return {
      state: "ERROR",
      stop: stopResolution.stop,
      buses,
      selectedBus,
      request: input.request,
      stopResolution,
      isDemoPresence: selectedBus?.source === "DEMO",
      destinationName: input.destinationName,
      destinationIsNext: input.destinationIsNext,
    };
  }

  const highConfidenceBuses = buses.filter((bus) => bus.confidence === "HIGH");
  let state: FocusedAssistContext["state"];
  if (selectedBus?.wheelchairAccessible === false) {
    state = "RAMP_UNAVAILABLE";
  } else if ((input.selectedBusId || activeJourneyBus) && selectedBus) {
    state =
      selectedBus.confidence === "HIGH"
        ? "ONE_BUS_PRESENT"
        : "BUS_CONFIRMATION_REQUIRED";
  } else if (highConfidenceBuses.length > 1) {
    state = "MULTIPLE_BUSES_PRESENT";
  } else if (highConfidenceBuses.length === 1) {
    state = "ONE_BUS_PRESENT";
  } else if (buses.length > 1) {
    state = "MULTIPLE_BUSES_PRESENT";
  } else if (buses.length === 1) {
    state = "BUS_CONFIRMATION_REQUIRED";
  } else {
    state = "AT_STOP_NO_BUS";
  }
  return {
    state,
    stop: stopResolution.stop,
    buses,
    selectedBus,
    request: input.request,
    stopResolution,
    isDemoPresence: selectedBus?.source === "DEMO",
    destinationName: input.destinationName,
    destinationIsNext: input.destinationIsNext,
  };
}

function baseContext(
  state: FocusedAssistContext["state"],
  stopResolution: FocusedAssistContext["stopResolution"],
  request: FocusedAssistContext["request"],
  input: FocusedAssistContextInput,
): FocusedAssistContext {
  return {
    state,
    stop: stopResolution.stop,
    buses: [],
    selectedBus: null,
    request,
    stopResolution,
    isDemoPresence: false,
    destinationName: input.destinationName,
    destinationIsNext: input.destinationIsNext,
  };
}

function stateForRequest(status: AssistanceRequestStatus | null) {
  if (status === AssistanceRequestStatus.SENDING) return "REQUESTED" as const;
  if (status === AssistanceRequestStatus.ACKNOWLEDGED)
    return "ACKNOWLEDGED" as const;
  return null;
}
