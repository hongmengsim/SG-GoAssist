import { AssistanceRequestStatus } from "@buspass/shared";
import {
  createFocusedAssistController,
  deriveFocusedAssistContext,
} from "../src/focusedAssist/FocusedAssistController";
import {
  DemoBusPresenceProvider,
  RealBusPresenceProvider,
  resolveCurrentStop,
} from "../src/focusedAssist/presenceProvider";
import type {
  BusAtStop,
  FocusedAssistContext,
  FocusedAssistContextInput,
} from "../src/focusedAssist/types";

const stop = {
  busStopCode: "16171",
  roadName: "Kent Ridge Cres",
  description: "Yusof Ishak Hse",
  latitude: 1.29812,
  longitude: 103.77424,
  services: ["151", "183"],
  distanceMeters: 20,
};

const service151Arrival = {
  busId: "BUS-151",
  serviceNo: "151",
  arrivalSlot: "NEXT_BUS" as const,
  etaSeconds: 45,
  wheelchairAccessible: true,
  vehicleType: "SD" as const,
  destination: "Kent Ridge Terminal",
};

function contextInput(
  overrides: Partial<FocusedAssistContextInput> = {},
): FocusedAssistContextInput {
  return {
    locating: false,
    location: {
      latitude: stop.latitude,
      longitude: stop.longitude,
      accuracyMeters: 12,
    },
    nearbyStops: [stop],
    manuallySelectedStop: null,
    arrivals: [],
    stopVehicles: [],
    activeJourney: null,
    onboard: false,
    destinationName: null,
    destinationIsNext: false,
    selectedBusId: null,
    request: {
      requestId: null,
      status: null,
      assistanceType: null,
      submitting: false,
      bus: null,
      stop: null,
      error: null,
    },
    ...overrides,
  };
}

describe("Focused Assist context", () => {
  it("does not choose a stop without location or with poor accuracy", () => {
    expect(
      resolveCurrentStop({
        location: null,
        nearbyStops: [stop],
        manuallySelectedStop: null,
      }).reason,
    ).toBe("LOCATION_REQUIRED");
    expect(
      resolveCurrentStop({
        location: {
          latitude: stop.latitude,
          longitude: stop.longitude,
          accuracyMeters: 120,
        },
        nearbyStops: [stop],
        manuallySelectedStop: null,
      }).reason,
    ).toBe("POOR_ACCURACY");
    expect(
      resolveCurrentStop({
        location: {
          latitude: stop.latitude,
          longitude: stop.longitude,
          accuracyMeters: 12,
        },
        nearbyStops: [stop],
        manuallySelectedStop: null,
      }).reason,
    ).toBe("RESOLVED");
  });

  it("rejects a geographically distant nearest stop", () => {
    expect(
      resolveCurrentStop({
        location: {
          latitude: 1.35,
          longitude: 103.82,
          accuracyMeters: 10,
        },
        nearbyStops: [stop],
        manuallySelectedStop: null,
      }).reason,
    ).toBe("NO_NEARBY_STOP");
  });

  it("resolves no-bus, one-bus, and multiple-bus states", () => {
    const provider = new DemoBusPresenceProvider();
    expect(deriveFocusedAssistContext(contextInput(), provider).state).toBe(
      "AT_STOP_NO_BUS",
    );
    expect(
      deriveFocusedAssistContext(
        contextInput({ arrivals: [service151Arrival] }),
        provider,
      ).state,
    ).toBe("ONE_BUS_PRESENT");
    expect(
      deriveFocusedAssistContext(
        contextInput({
          arrivals: [
            service151Arrival,
            {
              ...service151Arrival,
              busId: "BUS-183",
              serviceNo: "183",
            },
          ],
        }),
        provider,
      ).state,
    ).toBe("MULTIPLE_BUSES_PRESENT");
  });

  it("keeps ETA-only presence below high confidence outside demo mode", () => {
    const context = deriveFocusedAssistContext(
      contextInput({ arrivals: [service151Arrival] }),
      new RealBusPresenceProvider(),
    );
    expect(context.state).toBe("BUS_CONFIRMATION_REQUIRED");
    expect(context.selectedBus?.confidence).toBe("MEDIUM");
    expect(context.selectedBus?.source).toBe("LIVE_ARRIVAL");
  });

  it("uses only fresh parked telemetry for immediate ramp access", () => {
    const parkedVehicle = {
      busId: "BUS-151",
      busService: "151",
      stopCode: stop.busStopCode,
      state: "PARKED" as const,
      destination: "Kent Ridge Terminal",
      wheelchairAccessible: true,
      observedAt: new Date().toISOString(),
      fresh: true,
    };
    const parked = deriveFocusedAssistContext(
      contextInput({
        arrivals: [service151Arrival],
        stopVehicles: [parkedVehicle],
      }),
      new RealBusPresenceProvider(),
    );
    expect(parked.state).toBe("ONE_BUS_PRESENT");
    expect(parked.selectedBus).toMatchObject({
      id: "BUS-151",
      confidence: "HIGH",
      presenceState: "PARKED",
      source: "VEHICLE_TELEMETRY",
    });

    const stale = deriveFocusedAssistContext(
      contextInput({
        arrivals: [service151Arrival],
        stopVehicles: [{ ...parkedVehicle, fresh: false }],
      }),
      new RealBusPresenceProvider(),
    );
    expect(stale.state).toBe("BUS_CONFIRMATION_REQUIRED");
    expect(stale.selectedBus?.source).toBe("LIVE_ARRIVAL");
  });

  it("requires a choice for multiple parked buses and ignores mismatched or departed presence", () => {
    const parkedVehicle = {
      busId: "BUS-151",
      busService: "151",
      stopCode: stop.busStopCode,
      state: "PARKED" as const,
      destination: "Kent Ridge Terminal",
      wheelchairAccessible: true,
      observedAt: new Date().toISOString(),
      fresh: true,
    };
    const secondParkedVehicle = {
      ...parkedVehicle,
      busId: "BUS-95",
      busService: "95",
      destination: "Buona Vista Terminal",
    };

    const multiple = deriveFocusedAssistContext(
      contextInput({
        stopVehicles: [parkedVehicle, secondParkedVehicle],
      }),
      new RealBusPresenceProvider(),
    );
    expect(multiple.state).toBe("MULTIPLE_BUSES_PRESENT");
    expect(multiple.buses).toHaveLength(2);
    expect(multiple.selectedBus).toBeNull();

    const unavailable = deriveFocusedAssistContext(
      contextInput({
        stopVehicles: [
          { ...parkedVehicle, stopCode: "99999" },
          { ...secondParkedVehicle, state: "DEPARTED" as const },
        ],
      }),
      new RealBusPresenceProvider(),
    );
    expect(unavailable.state).toBe("AT_STOP_NO_BUS");
    expect(unavailable.buses).toHaveLength(0);
  });

  it("uses real ARRIVED telemetry for high confidence and prioritizes the active journey", () => {
    const context = deriveFocusedAssistContext(
      contextInput({
        arrivals: [
          { ...service151Arrival, busId: "OTHER-183", serviceNo: "183" },
          service151Arrival,
        ],
        activeJourney: {
          bus: {
            busId: "BUS-151",
            busService: "151",
            routeNumber: "151",
            currentStop: stop.description,
            nextStop: "Central Library",
            isAccessible: true,
            wheelchairSpaces: 1,
            latitude: stop.latitude,
            longitude: stop.longitude,
            estimatedArrivalSeconds: 0,
          },
          boardingStopCode: stop.busStopCode,
          arrival: service151Arrival,
          phase: "WAITING_FOR_BUS",
          vehicleStatus: "ARRIVED",
        },
      }),
      new RealBusPresenceProvider(),
    );
    expect(context.buses[0]).toMatchObject({
      serviceNo: "151",
      confidence: "HIGH",
      source: "VEHICLE_TELEMETRY",
      activeJourneyMatch: true,
    });
    expect(context.state).toBe("ONE_BUS_PRESENT");
    expect(context.selectedBus?.serviceNo).toBe("151");
  });

  it("keeps a selected active-journey bus available for an advance request", () => {
    const context = deriveFocusedAssistContext(
      contextInput({
        arrivals: [{ ...service151Arrival, etaSeconds: 480 }],
        activeJourney: {
          bus: {
            busId: "BUS-151",
            busService: "151",
            routeNumber: "151",
            currentStop: stop.description,
            nextStop: "Central Library",
            isAccessible: true,
            wheelchairSpaces: 1,
            latitude: stop.latitude,
            longitude: stop.longitude,
            estimatedArrivalSeconds: 480,
          },
          boardingStopCode: stop.busStopCode,
          arrival: { ...service151Arrival, etaSeconds: 480 },
          phase: "WAITING_FOR_BUS",
          vehicleStatus: null,
        },
      }),
      new RealBusPresenceProvider(),
    );

    expect(context.state).toBe("BUS_CONFIRMATION_REQUIRED");
    expect(context.selectedBus).toMatchObject({
      serviceNo: "151",
      confidence: "LOW",
      source: "ACTIVE_JOURNEY",
      activeJourneyMatch: true,
    });
  });

  it("maps request receipt separately from ramp readiness", () => {
    const bus: BusAtStop = {
      id: "BUS-151",
      serviceNo: "151",
      vehicleId: "BUS-151",
      wheelchairAccessible: true,
      confidence: "HIGH",
      source: "DEMO",
      activeJourneyMatch: false,
    };
    const context = deriveFocusedAssistContext(
      contextInput({
        arrivals: [service151Arrival],
        request: {
          requestId: "REQ-151",
          status: AssistanceRequestStatus.ACKNOWLEDGED,
          assistanceType: "WHEELCHAIR_RAMP",
          submitting: false,
          bus,
          stop,
          error: null,
        },
      }),
      new DemoBusPresenceProvider(),
    );
    expect(context.state).toBe("ACKNOWLEDGED");
    expect(context.state).not.toBe("RAMP_READY");
  });

  it("shows ramp ready only with a ready case and fresh verified telemetry", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T04:00:05.000Z"));
    const bus: BusAtStop = {
      id: "BUS-151",
      serviceNo: "151",
      vehicleId: "BUS-151",
      wheelchairAccessible: true,
      confidence: "HIGH",
      source: "DEMO",
      activeJourneyMatch: false,
    };
    const input = contextInput({
      arrivals: [service151Arrival],
      request: {
        requestId: "REQ-151",
        caseId: "CASE-151",
        caseState: "READY",
        status: AssistanceRequestStatus.ACKNOWLEDGED,
        assistanceType: "WHEELCHAIR_RAMP",
        submitting: false,
        bus,
        stop,
        safetyTelemetry: {
          busId: "BUS-151",
          stopCode: stop.busStopCode,
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: true,
          deploymentPathClear: true,
          rampPosition: "DEPLOYED",
          observedAt: "2026-09-01T04:00:03.000Z",
        },
        error: null,
      },
    });
    expect(
      deriveFocusedAssistContext(input, new DemoBusPresenceProvider()).state,
    ).toBe("RAMP_READY");
    expect(
      deriveFocusedAssistContext(
        {
          ...input,
          request: {
            ...input.request,
            safetyTelemetry: {
              ...input.request.safetyTelemetry!,
              doorOpen: false,
            },
          },
        },
        new DemoBusPresenceProvider(),
      ).state,
    ).not.toBe("RAMP_READY");
    jest.useRealTimers();
  });

  it("keeps a confirmed request authoritative when live updates disconnect", () => {
    const bus: BusAtStop = {
      id: "BUS-151",
      serviceNo: "151",
      vehicleId: "BUS-151",
      wheelchairAccessible: true,
      confidence: "HIGH",
      source: "DEMO",
      activeJourneyMatch: false,
    };
    const context = deriveFocusedAssistContext(
      contextInput({
        arrivals: [service151Arrival],
        request: {
          requestId: "REQ-151",
          status: AssistanceRequestStatus.ACKNOWLEDGED,
          assistanceType: "WHEELCHAIR_RAMP",
          submitting: false,
          bus,
          stop,
          error:
            "Live request updates are unavailable. Your request may still be active.",
        },
      }),
      new DemoBusPresenceProvider(),
    );

    expect(context.state).toBe("ACKNOWLEDGED");
  });
});

describe("Focused Assist semantic controller", () => {
  it("exposes reusable semantic actions and prevents duplicate requests", async () => {
    const bus: BusAtStop = {
      id: "BUS-151",
      serviceNo: "151",
      vehicleId: "BUS-151",
      wheelchairAccessible: true,
      confidence: "HIGH",
      source: "DEMO",
      activeJourneyMatch: false,
    };
    let currentContext = {
      ...deriveFocusedAssistContext(
        contextInput({ arrivals: [service151Arrival] }),
        new DemoBusPresenceProvider(),
      ),
      selectedBus: bus,
    } as FocusedAssistContext;
    const requestRamp = jest.fn(async () => {
      currentContext = {
        ...currentContext,
        state: "REQUESTED",
        request: {
          requestId: "REQ-151",
          status: AssistanceRequestStatus.SENDING,
          assistanceType: "WHEELCHAIR_RAMP",
          submitting: false,
          bus,
          stop,
          error: null,
        },
      };
      return true;
    });
    const controller = createFocusedAssistController({
      getContext: () => currentContext,
      selectBus: jest.fn(),
      requestRamp,
      requestExtraTime: jest.fn(async () => true),
      requestAlightingAssistance: jest.fn(async () => true),
      refreshContext: jest.fn(async () => undefined),
      reportError: jest.fn(),
    });

    expect(await controller.requestRamp()).toBe(true);
    expect(await controller.requestRamp()).toBe(false);
    expect(requestRamp).toHaveBeenCalledTimes(1);
    expect(controller.getRampStatus()).toBe("REQUESTED");
    expect(typeof controller.getContext).toBe("function");
    expect(typeof controller.requestAlightingAssistance).toBe("function");
  });
});
