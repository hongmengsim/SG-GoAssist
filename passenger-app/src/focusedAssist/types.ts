import type {
  ArrivalBus,
  AssistanceCaseState,
  AssistanceType,
  AssistanceRequestStatus,
  Bus,
  JourneyPhase,
  NearbyBusStop,
  SafetyTelemetry,
  VehicleStatus,
  StopVehiclePresence,
} from "@buspass/shared";

export type FocusedAssistState =
  | "LOCATING"
  | "NO_STOP"
  | "AT_STOP_NO_BUS"
  | "ONE_BUS_PRESENT"
  | "BUS_CONFIRMATION_REQUIRED"
  | "MULTIPLE_BUSES_PRESENT"
  | "REQUESTING"
  | "REQUESTED"
  | "ACKNOWLEDGED"
  | "PREPARING_RAMP"
  | "RAMP_READY"
  | "RAMP_UNAVAILABLE"
  | "ONBOARD"
  | "ERROR";

export type BusPresenceConfidence = "HIGH" | "MEDIUM" | "LOW";

export type BusPresenceSource =
  "VEHICLE_TELEMETRY" | "LIVE_ARRIVAL" | "ACTIVE_JOURNEY" | "DEMO";

export type BusAtStop = {
  id: string;
  serviceNo: string;
  vehicleId?: string;
  destination?: string;
  wheelchairAccessible?: boolean;
  etaSeconds?: number;
  confidence: BusPresenceConfidence;
  source: BusPresenceSource;
  activeJourneyMatch: boolean;
  presenceState?: StopVehiclePresence["state"];
  presenceObservedAt?: string;
};

export type FocusedAssistStopResolution = {
  stop: NearbyBusStop | null;
  reason: "RESOLVED" | "LOCATION_REQUIRED" | "POOR_ACCURACY" | "NO_NEARBY_STOP";
};

export type FocusedAssistLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type ActiveJourneyBusContext = {
  bus: Bus;
  boardingStopCode: string | null;
  arrival: ArrivalBus | null;
  phase: JourneyPhase;
  vehicleStatus: VehicleStatus | null;
};

export type BusPresenceInput = {
  currentStop: NearbyBusStop;
  arrivals: ArrivalBus[];
  activeJourney: ActiveJourneyBusContext | null;
  stopVehicles: StopVehiclePresence[];
};

export type FocusedAssistRequestContext = {
  requestId: string | null;
  caseId?: string | null;
  caseState?: AssistanceCaseState | null;
  escalationReason?: string | null;
  status: AssistanceRequestStatus | null;
  assistanceType: AssistanceType | null;
  submitting: boolean;
  bus: BusAtStop | null;
  stop: NearbyBusStop | null;
  safetyTelemetry?: SafetyTelemetry | null;
  error: string | null;
};

export type FocusedAssistContext = {
  state: FocusedAssistState;
  stop: NearbyBusStop | null;
  buses: BusAtStop[];
  selectedBus: BusAtStop | null;
  request: FocusedAssistRequestContext;
  stopResolution: FocusedAssistStopResolution;
  isDemoPresence: boolean;
  destinationName: string | null;
  destinationIsNext: boolean;
};

export type FocusedAssistContextInput = {
  locating: boolean;
  location: FocusedAssistLocation | null;
  nearbyStops: NearbyBusStop[];
  manuallySelectedStop: NearbyBusStop | null;
  arrivals: ArrivalBus[];
  stopVehicles: StopVehiclePresence[];
  activeJourney: ActiveJourneyBusContext | null;
  onboard: boolean;
  destinationName: string | null;
  destinationIsNext: boolean;
  selectedBusId: string | null;
  request: FocusedAssistRequestContext;
};
