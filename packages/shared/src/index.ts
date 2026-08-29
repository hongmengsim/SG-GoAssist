/**
 * Shared contracts for the BUSPASS passenger assistance MVP.
 *
 * The passenger app communicates assistance intent. Autonomous bus hardware
 * and controller software remain responsible for vehicle positioning, ramp
 * safety, external announcements, and physical actuation.
 */

export type AssistanceType =
  "WHEELCHAIR_RAMP" | "BUS_AUDIO_IDENTIFICATION" | "EXTENDED_DWELL_TIME";

export type AssistanceSource =
  "MOBILE_APP" | "PHYSICAL_BUTTON" | "RFID" | "AUTOMATIC_DETECTION";

export type AccessibilityVerificationStatus =
  "UNVERIFIED" | "PENDING" | "VERIFIED";

export type VerificationMethod =
  "PWD_CONCESSION_CARD" | "SENIOR_CONCESSION_CARD" | "DEMO_CREDENTIAL";

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

const assistanceRequestStatusTransitions: Record<
  AssistanceRequestStatus,
  readonly AssistanceRequestStatus[]
> = {
  [AssistanceRequestStatus.SENDING]: [
    AssistanceRequestStatus.ACKNOWLEDGED,
    AssistanceRequestStatus.CANCELLED,
    AssistanceRequestStatus.FAILED,
  ],
  [AssistanceRequestStatus.ACKNOWLEDGED]: [AssistanceRequestStatus.CANCELLED],
  [AssistanceRequestStatus.CANCELLED]: [],
  [AssistanceRequestStatus.FAILED]: [],
};

const vehicleStatusTransitions: Record<
  VehicleStatus,
  readonly VehicleStatus[]
> = {
  [VehicleStatus.APPROACHING]: [VehicleStatus.ARRIVED],
  [VehicleStatus.ARRIVED]: [VehicleStatus.DEPARTED],
  [VehicleStatus.DEPARTED]: [],
};

export function canTransitionAssistanceRequestStatus(
  current: AssistanceRequestStatus | null | undefined,
  next: AssistanceRequestStatus,
): boolean {
  return (
    current == null ||
    current === next ||
    assistanceRequestStatusTransitions[current].includes(next)
  );
}

export function canTransitionVehicleStatus(
  current: VehicleStatus | null | undefined,
  next: VehicleStatus,
): boolean {
  return (
    current == null ||
    current === next ||
    vehicleStatusTransitions[current].includes(next)
  );
}

export type JourneyPhase =
  | "DISCOVERY"
  | "PLANNING"
  | "WALKING_TO_STOP"
  | "WAITING_FOR_BUS"
  | "BUS_ARRIVING"
  | "BOARDING"
  | "ONBOARD"
  | "DESTINATION_APPROACHING"
  | "DESTINATION_NEXT"
  | "DISEMBARKING"
  | "ALIGHTING"
  | "COMPLETED";

export type AssistancePhase = "BOARDING" | "ALIGHTING";

/**
 * Existing screen model retained for a small app migration.
 * New integrations should use assistanceTypes as the canonical request field.
 */
export interface AccessibilityRequirements {
  wheelchairRamp: boolean;
  busAudioIdentification: boolean;
  extendedDwellTime: boolean;
}

export interface AssistancePreferences {
  wheelchairRamp: boolean;
  busAudioIdentification: boolean;
  extendedDwellTime: boolean;
}

export type AccessibilityTextSize = "STANDARD" | "LARGE" | "EXTRA_LARGE";

export type VibrationAlertMode = "OFF" | "IMPORTANT" | "ALL";

export interface AccessibilityPreferences {
  wheelchairAssistance: boolean;
  wheelchairRouting: boolean;
  avoidSteepSlopes: boolean;
  preferSmoothSurfaces: boolean;
  extraBoardingTime: boolean;
  alightingAssistance: boolean;
  preferAccessibleStops: boolean;
  textSize: AccessibilityTextSize;
  highContrast: boolean;
  spokenGuidance: boolean;
  audioBusIdentification: boolean;
  reduceMapDependence: boolean;
  screenReaderOptimised: boolean;
  visualJourneyAlerts: boolean;
  vibrationAlerts: VibrationAlertMode;
  textAnnouncementEquivalent: boolean;
  simplifiedJourney: boolean;
  alwaysShowNextAction: boolean;
  plainLanguage: boolean;
  confirmImportantActions: boolean;
  largerControls: boolean;
  longerMessageDuration: boolean;
  reducedMotion: boolean;
  warnBusApproaching: boolean;
  warnBusArrives: boolean;
  warnTwoStopsBeforeDestination: boolean;
  warnDestinationNext: boolean;
  repeatAudio: boolean;
  themeMode: "light" | "dark";
}

/** @deprecated Use AccessibilityPreferences. */
export type AppAccessibilityPreferences = AccessibilityPreferences;

export interface PassengerProfile {
  profileId: string;
  displayName: string;
  email: string;
  verificationStatus: AccessibilityVerificationStatus;
  verificationMethod?: VerificationMethod;
  verifiedCredentialLast4?: string;
  verifiedAt?: string;
  accessibilityPreferences: AccessibilityPreferences;
  /** Legacy fields are read only while migrating older saved profiles. */
  assistanceDefaults?: AccessibilityRequirements;
  appPreferences?: Partial<AccessibilityPreferences>;
  createdAt: string;
  updatedAt: string;
}

export interface PassengerAssistanceRequest {
  requestId: string;
  sessionId: string;
  busService: string;
  busId: string;
  boardingStop: string;
  destination: string;
  stopCode?: string;
  assistanceTypes: AssistanceType[];
  source: AssistanceSource;
  boardingOrAlighting: AssistancePhase;
  accessibilityVerificationStatus?: AccessibilityVerificationStatus;
  verificationMethod?: VerificationMethod;
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
  stopCode?: string;
  assistanceTypes: AssistanceType[];
  source?: AssistanceSource;
  boardingOrAlighting: AssistancePhase;
  accessibilityVerificationStatus?: AccessibilityVerificationStatus;
  verificationMethod?: VerificationMethod;
}

export interface AssistanceRequestInput {
  sessionId?: string;
  busId: string;
  busService: string;
  boardingStop?: string;
  destination?: string;
  stopCode?: string;
  assistanceType: AssistanceType;
  boardingOrAlighting?: AssistancePhase;
  source: AssistanceSource;
  accessibilityVerificationStatus?: AccessibilityVerificationStatus;
  verificationMethod?: VerificationMethod;
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
  services: string[];
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
  destination?: string;
  buses: ArrivalBus[];
}

export interface BusStopSearchResponse {
  stops: BusStop[];
  query: string;
  total: number;
}

export interface BusStopBoundsResponse {
  stops: BusStop[];
  total: number;
  truncated: boolean;
}

export interface BusStopDetailResponse {
  stop: BusStop;
}

export interface BusRoutePattern {
  serviceNo: string;
  direction: number;
  stopCodes: string[];
}

export interface BusServiceRouteOption {
  serviceNo: string;
  direction: number;
  destination: BusStop;
  stops: RouteStop[];
}

export interface BusStopServiceRoutesResponse {
  busStop: BusStop;
  serviceNo: string;
  routes: BusServiceRouteOption[];
}

export interface BusStopArrivalsResponse {
  busStop: BusStop;
  services: BusArrivalService[];
}

export interface RouteStop extends Omit<BusStop, "services"> {
  sequence: number;
  services?: string[];
}

export function remainingRouteStops(
  routeStops: RouteStop[],
  currentStopIndex: number,
): RouteStop[] {
  return routeStops.filter((stop) => stop.sequence > currentStopIndex);
}

export function isSelectedStopNext(
  routeStops: RouteStop[],
  currentStopIndex: number,
  selectedStopCode?: string,
): boolean {
  if (!selectedStopCode) {
    return false;
  }

  return routeStops[currentStopIndex + 1]?.busStopCode === selectedStopCode;
}

export function isSelectedStopReached(
  routeStops: RouteStop[],
  currentStopIndex: number,
  selectedStopCode?: string,
): boolean {
  if (!selectedStopCode) {
    return false;
  }

  return routeStops[currentStopIndex]?.busStopCode === selectedStopCode;
}

export function assistanceTypesForPhase(
  preferences: AssistancePreferences,
  phase: AssistancePhase,
): AssistanceType[] {
  const types: AssistanceType[] = [];

  if (preferences.wheelchairRamp) {
    types.push("WHEELCHAIR_RAMP");
  }
  if (phase === "BOARDING" && preferences.busAudioIdentification) {
    types.push("BUS_AUDIO_IDENTIFICATION");
  }
  if (preferences.extendedDwellTime) {
    types.push("EXTENDED_DWELL_TIME");
  }

  return types;
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
