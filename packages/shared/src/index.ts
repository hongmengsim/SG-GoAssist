/**
 * Shared contracts for the BUSPASS passenger assistance MVP.
 *
 * The passenger app communicates assistance intent. Autonomous bus hardware
 * and controller software remain responsible for vehicle positioning, ramp
 * safety, external announcements, and physical actuation.
 */

export type AssistanceType = "WHEELCHAIR_RAMP" | "BUS_AUDIO_IDENTIFICATION";

export type AssistanceSource =
  | "MOBILE_APP"
  | "PHYSICAL_BUTTON"
  | "RFID"
  | "AUTOMATIC_DETECTION";

export enum AssistanceRequestStatus {
  SENDING = "SENDING",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  CANCELLED = "CANCELLED",
  FAILED = "FAILED",
}

export enum VehicleStatus {
  APPROACHING = "APPROACHING",
  ARRIVED = "ARRIVED",
  DEPARTED = "DEPARTED",
}

/**
 * Existing screen model retained for a small app migration.
 * New integrations should use assistanceTypes as the canonical request field.
 */
export interface AccessibilityRequirements {
  wheelchairRamp: boolean;
  busAudioIdentification: boolean;
}

export interface AppAccessibilityPreferences {
  screenReaderOptimised: boolean;
  hapticAlerts: boolean;
  largeText: boolean;
  highContrast: boolean;
  repeatAudio: boolean;
}

export interface PassengerAssistanceRequest {
  requestId: string;
  sessionId: string;
  busService: string;
  busId: string;
  boardingStop: string;
  destination: string;
  assistanceTypes: AssistanceType[];
  source: AssistanceSource;
  boardingOrAlighting: "BOARDING" | "ALIGHTING";
  status: AssistanceRequestStatus;
  createdAt: string;
  acknowledgedAt?: string;
  cancelledAt?: string;
  failedAt?: string;
}

export interface CreateAssistanceRequestPayload {
  sessionId?: string;
  busService: string;
  busId: string;
  boardingStop: string;
  destination: string;
  assistanceTypes: AssistanceType[];
  source?: AssistanceSource;
  boardingOrAlighting: "BOARDING" | "ALIGHTING";
}

export interface AssistanceRequestInput {
  sessionId?: string;
  busId: string;
  busService: string;
  boardingStop?: string;
  destination?: string;
  assistanceType: AssistanceType;
  source: AssistanceSource;
}

export interface AssistanceRequestResponse {
  requestId: string;
  status: AssistanceRequestStatus;
  createdAt: string;
  duplicateOfRequestId?: string;
}

export interface RequestStatusUpdateMessage {
  type: "REQUEST_STATUS";
  requestId: string;
  status: AssistanceRequestStatus;
  timestamp: string;
  assistanceTypes: AssistanceType[];
  source: AssistanceSource;
  busId: string;
  busService: string;
  message?: string;
}

export interface VehicleStatusUpdateMessage {
  type: "VEHICLE_STATUS";
  busId: string;
  busService: string;
  status: VehicleStatus;
  timestamp: string;
  message?: string;
}

export interface ExternalAnnouncementMessage {
  type: "EXTERNAL_ANNOUNCEMENT";
  busId: string;
  busService: string;
  requestId: string;
  assistanceType: "BUS_AUDIO_IDENTIFICATION";
  announcement: string;
  timestamp: string;
}

export type StatusUpdateMessage =
  | RequestStatusUpdateMessage
  | VehicleStatusUpdateMessage
  | ExternalAnnouncementMessage;

export interface Bus {
  busId: string;
  busService: string;
  routeNumber: string;
  currentStop: string;
  nextStop: string;
  isAccessible: boolean;
  wheelchairSpaces: number;
  latitude: number;
  longitude: number;
  estimatedArrivalSeconds: number;
}

export interface BusStop {
  busStopCode: string;
  roadName: string;
  description: string;
  latitude: number;
  longitude: number;
}

export interface NearbyBusStop extends BusStop {
  distanceMeters: number;
}

export interface NearbyBusStopsRequest {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface NearbyBusStopsResponse {
  stops: NearbyBusStop[];
  debug: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    maxDistanceMeters: number;
  };
}

export interface ArrivalBus {
  busId: string;
  serviceNo: string;
  arrivalSlot: "NEXT_BUS" | "NEXT_BUS_2" | "NEXT_BUS_3";
  etaSeconds: number;
  wheelchairAccessible: boolean;
  vehicleType: "SD" | "DD" | "BD";
  destination: string;
}

export interface BusArrivalService {
  serviceNo: string;
  buses: ArrivalBus[];
}

export interface BusStopArrivalsResponse {
  busStop: BusStop;
  services: BusArrivalService[];
}

export interface RequestLog {
  requestId: string;
  busService: string;
  busId: string;
  assistanceTypes: AssistanceType[];
  source: AssistanceSource;
  createdAt: string;
  acknowledgedAt?: string;
  cancelledAt?: string;
  failedAt?: string;
  timeToAcknowledgeMs?: number;
}

export interface SimulatorCommand {
  requestId: string;
  command: "ACKNOWLEDGE" | "FAIL" | "CANCEL";
}

export interface VehicleSimulatorCommand {
  busId: string;
  status: VehicleStatus;
}

export interface PhysicalButtonRequestPayload {
  busId: string;
  busService: string;
  boardingStop?: string;
}

export interface PhysicalButtonRequestResponse {
  requestId: string;
  status: AssistanceRequestStatus;
  source: "PHYSICAL_BUTTON";
  feedback: {
    led: "CONFIRMATION_ON" | "ERROR_BLINK";
    buzzer?: "SHORT_CONFIRMATION";
    message: string;
  };
  duplicateOfRequestId?: string;
}
