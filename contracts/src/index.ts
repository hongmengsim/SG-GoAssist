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

export type SupportedAssistantLocale = "en-SG" | "zh-SG" | "ms-SG" | "ta-SG";

export interface AccessibilityPreferences {
  assistantLocale?: SupportedAssistantLocale;
  assistantDiagnosticsConsent?: boolean;
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
  /** Rich lifecycle record created by the operations orchestrator. */
  caseId?: string;
  assistanceCaseState?: AssistanceCaseState;
  sessionId: string;
  busService: string;
  busId: string;
  boardingStop: string;
  destination?: string;
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
  destination?: string;
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
  caseId?: string;
  assistanceCaseState?: AssistanceCaseState;
  status: AssistanceRequestStatus;
  createdAt: string;
  duplicateOfRequestId?: string;
}

/** Sources accepted by the intent-first sensor-fusion layer. */
export type SignalSource =
  | "APP"
  | "PHYSICAL_BUTTON"
  | "NFC"
  | "CAMERA"
  | "PRESSURE_SENSOR"
  | "DISTANCE_SENSOR"
  | "OPERATOR";

export type SignalKind =
  | "EXPLICIT_ASSISTANCE_REQUEST"
  | "WHEELCHAIR_DETECTED"
  | "WALKING_AID_DETECTED"
  | "STROLLER_DETECTED"
  | "LUGGAGE_DETECTED"
  | "PASSENGER_IN_BOARDING_ZONE"
  | "BOARDING_COMPLETE"
  | "ALIGHTING_COMPLETE"
  | "HUMAN_HELP_REQUESTED";

export interface SignalObservation {
  signalId: string;
  idempotencyKey?: string;
  source: SignalSource;
  kind: SignalKind;
  stopCode: string;
  busCandidate?: string;
  busService?: string;
  assistanceCandidates: AssistanceType[];
  confidence: number;
  /** Anonymous rotating token; never a face, name, or medical identifier. */
  anonymousToken: string;
  phase?: AssistancePhase;
  confirmed?: boolean;
  observedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type BoardingIntentDecision =
  "CONFIRMED" | "LIKELY" | "UNCONFIRMED" | "DECLINED";

export interface BoardingIntentEvidence {
  signalId: string;
  source: SignalSource;
  kind: SignalKind;
  confidence: number;
  confirmed: boolean;
  observedAt: string;
}

/**
 * Auditable intent result. Perception may increase confidence, but only an
 * explicit passenger or operator confirmation may produce CONFIRMED.
 */
export interface BoardingIntentAssessment {
  decision: BoardingIntentDecision;
  confidence: number;
  targetBusId?: string;
  reason: string;
  evidence: BoardingIntentEvidence[];
  assessedAt: string;
}

export type AssistanceCaseState =
  | "REQUESTED"
  | "VALIDATED"
  | "VEHICLE_ASSIGNED"
  | "SAFE_TO_ACTUATE"
  | "ACTUATING"
  | "READY"
  | "COMPLETED"
  | "NEEDS_CONFIRMATION"
  | "ESCALATED"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED";

export interface AssistanceIntent {
  intentId: string;
  signalId: string;
  source: SignalSource;
  anonymousToken: string;
  assistanceTypes: AssistanceType[];
  confidence: number;
  confirmed: boolean;
  createdAt: string;
  confirmedAt?: string;
}

export interface AssistanceActionPlanItem {
  assistanceType: AssistanceType;
  action:
    | "DEPLOY_RAMP"
    | "RETRACT_RAMP"
    | "PLAY_EXTERNAL_AUDIO"
    | "SHOW_VISUAL_MESSAGE"
    | "VIBRATE_STOP_CONTROL"
    | "EXTEND_DWELL";
  requiresSafetyClearance: boolean;
  status: "PLANNED" | "COMMAND_ISSUED" | "READY" | "COMPLETED" | "BLOCKED";
  commandId?: string;
}

export interface AssistanceOutcome {
  caseId: string;
  acknowledgedLatencyMs?: number;
  completionTimeMs?: number;
  operatorInterventions: number;
  safetyBlocks: number;
  failures: string[];
  passengerFeedbackScore?: 1 | 2 | 3 | 4 | 5;
  completedAt?: string;
}

export interface AssistanceCase {
  caseId: string;
  stopCode: string;
  busId?: string;
  busService?: string;
  phase: AssistancePhase;
  intents: AssistanceIntent[];
  assistanceTypes: AssistanceType[];
  passengerCount: number;
  confidence: number;
  boardingIntent: BoardingIntentAssessment;
  state: AssistanceCaseState;
  escalationReason?: string;
  actionPlan: AssistanceActionPlanItem[];
  outcome: AssistanceOutcome;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  completionDetectedAt?: string;
  completionConfidence?: number;
  completionConfirmed?: boolean;
  cancellationRequestedAt?: string;
}

export type PerceptionNeedClass =
  | "WHEELCHAIR"
  | "WALKING_AID"
  | "STROLLER"
  | "LUGGAGE"
  | "PASSENGER_IN_BOARDING_ZONE";

export interface PerceptionEvaluationSample {
  sampleId: string;
  predicted: PerceptionNeedClass[];
  actual: PerceptionNeedClass[];
  confidence?: Partial<Record<PerceptionNeedClass, number>>;
  scenario?: string;
  observedAt: string;
}

export interface PerceptionClassMetrics {
  className: PerceptionNeedClass;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision?: number;
  recall?: number;
}

export interface PerceptionEvaluationMetrics {
  sampleCount: number;
  microPrecision?: number;
  microRecall?: number;
  classes: PerceptionClassMetrics[];
}

export interface VehicleCapability {
  busId: string;
  busService?: string;
  autonomous?: boolean;
  autonomyLevel?: "MOCK_ROUTE_AUTOMATION";
  ramp: boolean;
  externalAudio: boolean;
  visualDisplay: boolean;
  dwellControl: boolean;
  wheelchairSpaceCapacity: number;
  supportedTelemetry: Array<
    keyof Omit<SafetyTelemetry, "busId" | "observedAt">
  >;
  updatedAt: string;
}

export type RampPosition =
  "STOWED" | "DEPLOYING" | "DEPLOYED" | "RETRACTING" | "FAULT" | "UNKNOWN";

export type RampObstacleClass =
  | "NONE"
  | "LIGHT_DEBRIS"
  | "PERSON"
  | "MOBILITY_DEVICE"
  | "LUGGAGE"
  | "ANIMAL"
  | "UNKNOWN";

export interface RampObstacleRanging {
  laserHealthy: boolean;
  objectDetected: boolean;
  nearestDistanceMm?: number;
  occupiedZoneCount: number;
  criticalZoneOccupied: boolean;
  observedAt: string;
}

export interface RampObstacleClassification {
  busId: string;
  classification: RampObstacleClass;
  confidence: number;
  observedAt: string;
}

export interface RampObstacleAssessment extends RampObstacleRanging {
  classification: RampObstacleClass;
  classificationConfidence: number;
  classificationObservedAt?: string;
  blocksDeployment: boolean;
  reason: string;
}

export interface SafetyTelemetry {
  busId: string;
  stopCode?: string;
  vehicleStopped: boolean;
  parkingBrakeActive: boolean;
  doorOpen: boolean;
  deploymentPathClear: boolean;
  rampObstacle?: RampObstacleAssessment;
  rampPosition: RampPosition;
  wheelchairSpaceOccupied?: boolean;
  prioritySeatOccupied?: boolean;
  passengerSeated?: boolean;
  boardingComplete?: boolean;
  networkOnline?: boolean;
  observedAt: string;
}

export interface PrecisionDockingObservation {
  busId: string;
  stopCode: string;
  markerId: number;
  markerDetected: boolean;
  markerRangeMm?: number;
  lateralOffsetMm?: number;
  headingErrorDegrees?: number;
  tofDistanceMm?: number;
  tofHealthy: boolean;
  confidence: number;
  observedAt: string;
}

export interface PrecisionDockingAssessment extends PrecisionDockingObservation {
  fresh: boolean;
  aligned: boolean;
  reason: string;
}

/**
 * Prototype-only route automation. It models the decisions and safety gates of
 * an autonomous shuttle without commanding a real steering or braking system.
 */
export type AutonomousDriveMode = "MANUAL" | "AUTONOMOUS" | "REMOTE_ASSIST";

export type AutonomousDriveState =
  | "IDLE"
  | "ROUTE_ASSIGNED"
  | "EN_ROUTE"
  | "APPROACHING_STOP"
  | "PRECISION_STOPPING"
  | "STOPPED_SECURE"
  | "DOORS_OPEN"
  | "READY_TO_DEPART"
  | "DEPARTING"
  | "MANUAL_OVERRIDE"
  | "EMERGENCY_STOP"
  | "BLOCKED";

export interface AutonomousVehicleState {
  busId: string;
  busService: string;
  routeId: string;
  routeStopCodes: string[];
  targetStopIndex: number;
  targetStopCode: string;
  mode: AutonomousDriveMode;
  state: AutonomousDriveState;
  distanceToTargetMeters: number;
  speedKph: number;
  localizationAccuracyMeters: number;
  obstacleDetected: boolean;
  remoteOverride: boolean;
  docking?: PrecisionDockingAssessment;
  blockReason?: string;
  updatedAt: string;
}

export interface AutonomousRouteAssignment {
  busService: string;
  routeId: string;
  routeStopCodes: string[];
  initialDistanceMeters: number;
}

export interface AutonomousMotionUpdate {
  distanceToTargetMeters: number;
  speedKph: number;
  localizationAccuracyMeters: number;
  obstacleDetected?: boolean;
}

export type ActuatorCommandType =
  | "DEPLOY_RAMP"
  | "RETRACT_RAMP"
  | "EXTEND_DWELL"
  | "PLAY_EXTERNAL_AUDIO"
  | "SHOW_VISUAL_MESSAGE"
  | "VIBRATE_STOP_CONTROL";

export interface ActuatorCommand {
  commandId: string;
  caseId: string;
  busId: string;
  stopCode: string;
  command: ActuatorCommandType;
  payload?: Record<string, string | number | boolean>;
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
}

export type ActuatorExecutionState =
  | "ISSUED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "BLOCKED"
  | "FAILED";

export interface ActuatorStatus {
  commandId: string;
  caseId: string;
  busId: string;
  state: ActuatorExecutionState;
  detail?: string;
  rampPosition?: RampPosition;
  updatedAt: string;
}

export interface DeviceHealth {
  deviceId: string;
  deviceType: "BUS_STOP" | "MOCK_BUS" | "SENSOR" | "ACTUATOR";
  busId?: string;
  stopCode?: string;
  batteryPercent?: number;
  networkOnline: boolean;
  sensorHealth: Record<string, "OK" | "DEGRADED" | "FAILED">;
  actuatorCycleCount?: number;
  firmwareVersion?: string;
  observedAt: string;
}

export interface AssistanceMetrics {
  totalCases: number;
  activeCases: number;
  completedCases: number;
  escalatedCases: number;
  failedCases: number;
  explicitRequests: number;
  sensorObservations: number;
  acknowledgementP95Ms?: number;
  medianCompletionMs?: number;
  operatorInterventionRate: number;
  safetyBlocks: number;
  averagePassengerFeedback?: number;
}

/**
 * Integration additions: bus movement, single-bay coordination, the Pi's
 * halt/continue decision, and the simulated ramp. All additive; existing
 * statuses and unions are unchanged (StatusUpdateMessage in particular must
 * not grow; see OperatorStatusUpdateMessage). Wrapper messages below keep
 * busId nested (not top-level) so passenger sockets never receive them: the
 * broadcaster only sends top-level busId/caseId/requestId matches to
 * non-operator clients.
 */
export const BUS_MOVEMENT_STATES = [
  "TRAVELLING_TO_STOP",
  "WAITING_FOR_BAY",
  "POSITIONED_AT_STOP",
  "DEPARTING",
] as const;
export type BusMovementState = (typeof BUS_MOVEMENT_STATES)[number];

/** Movement only; request status, ramp state and faults are separate. */
export interface BusStatus {
  busId: string;
  busService: string;
  stopCode?: string;
  bayId?: string;
  movement: BusMovementState;
  /** True when this bus's movement or sensors are simulated (for example Bus 2). */
  simulated: boolean;
  observedAt: string;
}

/** One bay per stop. A waiting bus may enter only after the controller grants it. */
export interface BayStatus {
  stopCode: string;
  bayId: string;
  occupantBusId: string | null;
  /** First in, first out. */
  waitingBusIds: string[];
  /** Bus the controller has told to enter the now-free bay; null when none. */
  grantedBusId: string | null;
  updatedAt: string;
}

/** The ramp is simulated in this project; nothing here is physically verified. */
export const SIMULATED_RAMP_STATES = [
  "STOWED",
  "DEPLOYMENT_REQUESTED",
  "DEPLOYING",
  "DEPLOYED",
  "HALTED",
] as const;
export type SimulatedRampState = (typeof SIMULATED_RAMP_STATES)[number];

export const ZONE_STATES = ["CLEAR", "OCCUPIED", "UNCERTAIN"] as const;
export type ZoneState = (typeof ZONE_STATES)[number];

export const RAMP_PERMISSIONS = ["CONTINUE", "HALT"] as const;
export type RampPermission = (typeof RAMP_PERMISSIONS)[number];

export const HALT_REASONS = [
  "OBJECT_IN_ZONE",
  "TOF_BLOCKED",
  "TOF_UNAVAILABLE",
  "TOF_NOT_CALIBRATED",
  "CAMERA_DEGRADED",
  "SENSORS_DISAGREE",
  "BUS_NOT_AT_BOARDING_POSITION",
  "WAITING_FOR_BAY",
  "NO_ACCEPTED_REQUEST",
  "OPERATOR_HALT",
  "DEPLOYMENT_TIMEOUT",
] as const;
export type HaltReason = (typeof HALT_REASONS)[number];

export const TOF_BEAM_STATES = [
  "BEAM_CLEAR",
  "BLOCKED",
  "CHECKING",
  "UNCALIBRATED",
  "UNKNOWN",
] as const;
export type TofBeamState = (typeof TOF_BEAM_STATES)[number];

export type ObjectSafety = "SAFE" | "UNSAFE";

/**
 * The Pi's local decision. CONTINUE only when zoneState is CLEAR and every
 * check passed. Missing, stale or invalid sensor data is never CLEAR.
 */
export interface RampSafetyDecision {
  busId: string;
  zoneState: ZoneState;
  permission: RampPermission;
  reasons: HaltReason[];
  tof: {
    state: TofBeamState;
    distanceMm?: number;
    simulated: boolean;
  };
  camera: {
    imageOk: boolean;
    degradedReason?: string;
  };
  objectsInZone: Array<{
    className: string;
    safety: ObjectSafety;
    confidence: number;
  }>;
  /** True when any input on this bus is simulated. */
  simulated: boolean;
  observedAt: string;
}

export interface RampSimulationStatus {
  busId: string;
  caseId?: string;
  state: SimulatedRampState;
  /** Literal true: this project never claims physical ramp verification. */
  simulated: true;
  haltReasons?: HaltReason[];
  observedAt: string;
}

export const HELP_REASONS = [
  "DEPLOYMENT_TIMEOUT",
  "OBSTRUCTION_PERSISTENT",
  "SENSOR_UNAVAILABLE",
  "OTHER",
] as const;
export type HelpReason = (typeof HELP_REASONS)[number];

export interface HelpRequired {
  busId: string;
  caseId?: string;
  reason: HelpReason;
  state: SimulatedRampState;
  detail?: string;
  observedAt: string;
}

export interface BusStatusUpdateMessage {
  type: "BUS_STATUS";
  status: BusStatus;
  timestamp: string;
}

export interface BayStatusUpdateMessage {
  type: "BAY_STATUS";
  bay: BayStatus;
  timestamp: string;
}

export interface RampSimulationUpdateMessage {
  type: "RAMP_SIMULATION";
  ramp: RampSimulationStatus;
  timestamp: string;
}

export interface RampSafetyUpdateMessage {
  type: "RAMP_SAFETY";
  decision: RampSafetyDecision;
  timestamp: string;
}

export interface HelpRequiredMessage {
  type: "HELP_REQUIRED";
  help: HelpRequired;
  timestamp: string;
}

/**
 * An operator halt on one bus. While on, the bus gate halts with OPERATOR_HALT and the
 * simulated ramp will not move. It can only ever add a halt, never remove a safety reason.
 */
export interface OperatorHalt {
  busId: string;
  halted: boolean;
  reason?: string;
  setAt: string;
}

/** Pushed to the halted bus (its own subscription) and to operators. */
export interface OperatorHaltMessage {
  type: "OPERATOR_HALT";
  halt: OperatorHalt;
  timestamp: string;
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
  stopCode?: string;
  status: VehicleStatus;
  timestamp: string;
  message?: string;
}

export type StopVehiclePresenceState = "APPROACHING" | "PARKED" | "DEPARTED";

/** Passenger-safe, anonymous vehicle presence at one bus stop. */
export interface StopVehiclePresence {
  busId: string;
  busService: string;
  stopCode: string;
  state: StopVehiclePresenceState;
  destination?: string;
  wheelchairAccessible: boolean;
  observedAt: string;
  fresh: boolean;
}

export interface StopVehiclePresenceResponse {
  stopCode: string;
  vehicles: StopVehiclePresence[];
}

export interface StopVehiclePresenceUpdateMessage {
  type: "STOP_VEHICLE_PRESENCE";
  stopCode: string;
  vehicle: StopVehiclePresence;
  timestamp: string;
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

export interface AssistanceCaseUpdateMessage {
  type: "CASE_STATUS";
  caseId: string;
  busId?: string;
  stopCode: string;
  state: AssistanceCaseState;
  passengerCount: number;
  assistanceTypes: AssistanceType[];
  escalationReason?: string;
  timestamp: string;
}

export interface SafetyTelemetryUpdateMessage {
  type: "SAFETY_TELEMETRY";
  busId: string;
  stopCode?: string;
  telemetry: SafetyTelemetry;
  fresh: boolean;
  timestamp: string;
}

export interface ActuatorStatusUpdateMessage {
  type: "ACTUATOR_STATUS";
  caseId: string;
  busId: string;
  status: ActuatorStatus;
  timestamp: string;
}

export interface OperatorEscalationMessage {
  type: "OPERATOR_ESCALATION";
  caseId: string;
  busId?: string;
  stopCode: string;
  reason: string;
  timestamp: string;
}

export interface DeviceHealthUpdateMessage {
  type: "DEVICE_HEALTH";
  busId?: string;
  stopCode?: string;
  health: DeviceHealth;
  timestamp: string;
}

export interface AutonomyStatusUpdateMessage {
  type: "AUTONOMY_STATUS";
  busId: string;
  busService: string;
  autonomy: AutonomousVehicleState;
  timestamp: string;
}

export type StatusUpdateMessage =
  | RequestStatusUpdateMessage
  | VehicleStatusUpdateMessage
  | StopVehiclePresenceUpdateMessage
  | ExternalAnnouncementMessage
  | AssistanceCaseUpdateMessage
  | SafetyTelemetryUpdateMessage
  | ActuatorStatusUpdateMessage
  | OperatorEscalationMessage
  | DeviceHealthUpdateMessage
  | AutonomyStatusUpdateMessage;

/**
 * Operator-only messages. Deliberately NOT part of StatusUpdateMessage: the
 * passenger app narrows that union exhaustively (its describeEvent falls
 * through to DEVICE_HEALTH), so adding members there would break the app.
 */
/**
 * What a bus needs to know about a passenger request. No session id or other passenger
 * identity is included.
 */
export interface AssistRequestForBus {
  requestId: string;
  caseId?: string;
  busId: string;
  busService: string;
  boardingStop: string;
  stopCode?: string;
  destination?: string;
  assistanceTypes: AssistanceType[];
  boardingOrAlighting: AssistancePhase;
  createdAt: string;
}

/** Pushed to the addressed bus (operator-style scoped subscription); never to passengers. */
export interface AssistRequestedMessage {
  type: "ASSIST_REQUESTED";
  request: AssistRequestForBus;
  timestamp: string;
}

/**
 * Bodies a bus posts. The bus id travels in the URL path, so the body omits it; these are
 * what the JSON Schemas in contracts/schema describe and what the Pi agent must emit.
 */
export type BusStatusReport = Omit<BusStatus, "busId">;
export type RampSimulationReport = Omit<RampSimulationStatus, "busId">;
export type RampSafetyReport = Omit<RampSafetyDecision, "busId">;
export type HelpRequiredReport = Omit<HelpRequired, "busId">;
export type SafetyTelemetryReport = Omit<SafetyTelemetry, "busId">;

export type OperatorStatusUpdateMessage =
  | OperatorHaltMessage
  | AssistRequestedMessage
  | BusStatusUpdateMessage
  | BayStatusUpdateMessage
  | RampSimulationUpdateMessage
  | RampSafetyUpdateMessage
  | HelpRequiredMessage;

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

export type DataProvenanceKind =
  "LIVE" | "VERIFIED_FIXTURE" | "CACHED" | "UNAVAILABLE";

export interface DataProvenance {
  kind: DataProvenanceKind;
  sourceLabel: string;
  observedAt?: string;
  staleAfter?: string;
}

export type StopAmenityAvailability = "YES" | "NO" | "UNKNOWN";

export interface StopAmenityProfile {
  stopCode: string;
  shelter: StopAmenityAvailability;
  seating: StopAmenityAvailability;
  lighting: StopAmenityAvailability;
  tactilePaving: StopAmenityAvailability;
  stepFreeKerb: StopAmenityAvailability;
  audioBeacon: StopAmenityAvailability;
  physicalAssistButton: StopAmenityAvailability;
  provenance: DataProvenance;
}

export type ServiceAdvisorySeverity = "INFO" | "DELAY" | "DISRUPTION";

export interface ServiceAdvisory {
  id: string;
  severity: ServiceAdvisorySeverity;
  title: string;
  affectedServices: string[];
  affectedStops: string[];
  startsAt: string;
  endsAt?: string;
  provenance: DataProvenance;
}

export interface PassengerStopContext {
  stop: NearbyBusStop;
  distanceMeters: number;
  walkingMinutes: number;
  arrivals: BusArrivalService[];
  amenities: StopAmenityProfile;
  vehicles: StopVehiclePresence[];
}

export interface PassengerContextSnapshot {
  generatedAt: string;
  radiusMeters: number;
  nearbyStops: PassengerStopContext[];
  advisories: ServiceAdvisory[];
  provenance: DataProvenance;
}

export type JourneyPlanLegType = "WALK" | "BUS" | "TRANSFER";

export interface JourneyPlanLeg {
  type: JourneyPlanLegType;
  summary: string;
  serviceNo?: string;
  fromStopCode?: string;
  toStopCode?: string;
  stopCount?: number;
  distanceMeters?: number;
  durationMinutes: number;
}

export interface JourneyPlanOption {
  id: string;
  title: string;
  legs: JourneyPlanLeg[];
  totalMinutes: number;
  walkingMinutes: number;
  transferCount: number;
  accessibilityFit: "VERIFIED" | "PARTIAL" | "UNKNOWN";
  shelterCoverage: "FULL" | "PARTIAL" | "UNVERIFIED";
  advisories: ServiceAdvisory[];
  boardingStop: BusStop;
  destinationStop: BusStop;
}

export interface JourneyPlanRequest {
  origin: { latitude: number; longitude: number; label?: string };
  destination: { latitude: number; longitude: number; label?: string };
  preferences?: {
    wheelchairRouting?: boolean;
    preferAccessibleStops?: boolean;
    avoidSteepSlopes?: boolean;
    preferSmoothSurfaces?: boolean;
  };
}

export interface JourneyPlanResponse {
  generatedAt: string;
  options: JourneyPlanOption[];
  provenance: DataProvenance;
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
  busService?: string;
  stopCode?: string;
}

export interface PhysicalButtonRequestPayload {
  busId: string;
  busService: string;
  boardingStop?: string;
}

export interface PhysicalButtonRequestResponse {
  requestId: string;
  caseId?: string;
  status: AssistanceRequestStatus;
  source: "PHYSICAL_BUTTON";
  feedback: {
    led: "CONFIRMATION_ON" | "ERROR_BLINK";
    buzzer?: "SHORT_CONFIRMATION";
    message: string;
  };
  duplicateOfRequestId?: string;
}
