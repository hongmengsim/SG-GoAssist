import crypto from "crypto";
import {
  ActuatorCommand,
  ActuatorCommandType,
  ActuatorStatus,
  AssistanceActionPlanItem,
  AssistanceCase,
  AssistanceCaseState,
  AssistanceMetrics,
  AssistanceType,
  BoardingIntentAssessment,
  DeviceHealth,
  AssistanceRequestStatus,
  PassengerAssistanceRequest,
  SafetyTelemetry,
  SignalObservation,
  SignalSource,
  StatusUpdateMessage,
  VehicleCapability,
} from "@buspass/shared";
import { getBusById } from "../data/buses.mock";
import { logger } from "./logger";
import { getOperationsData, resetOperationsData } from "./operationsData";
import { fuseRampObstacleAssessment } from "./rampObstacleService";
import {
  createDepartedStopVehiclePresence,
  deriveStopVehiclePresence,
} from "./stopVehiclePresenceService";

const TERMINAL_STATES: AssistanceCaseState[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];
/** Reads that must stay bounded, whatever is stored. Retention keeps the real numbers far lower. */
const CASE_LIST_LIMIT = 10_000;
const METRICS_CASE_LIMIT = 50_000;
const OPEN_CASE_LIMIT = 10_000;
const OPEN_COMMAND_LIMIT = 10_000;
const FLEET_LIST_LIMIT = 5_000;
const PER_CASE_LIMIT = 1_000;
const SENSOR_SOURCES: SignalSource[] = [
  "CAMERA",
  "PRESSURE_SENSOR",
  "DISTANCE_SENSOR",
];
const TELEMETRY_FRESHNESS_MS = Number(
  process.env.GOASSIST_TELEMETRY_FRESHNESS_MS ?? 5_000,
);
const SENSOR_OBSERVATION_MAX_AGE_MS = Number(
  process.env.GOASSIST_SENSOR_MAX_AGE_MS ?? 30_000,
);

type OperationsListener = (message: StatusUpdateMessage) => void;
const listeners = new Set<OperationsListener>();

export class OperationsValidationError extends Error {}
export class OperationsNotFoundError extends Error {}

export function onOperationsEvent(listener: OperationsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(message: StatusUpdateMessage): void {
  listeners.forEach((listener) => listener(message));
}

export function publishOperationsEvent(message: StatusUpdateMessage): void {
  emit(message);
}

export function submitSignalObservation(
  input: SignalObservation,
): AssistanceCase {
  validateObservation(input);
  const observation = sanitizeObservation(input);
  const now = new Date().toISOString();
  const data = getOperationsData();
  const duplicate =
    data.observations.get(observation.signalId) ??
    (observation.idempotencyKey
      ? data.observations.findOne("idempotencyKey", observation.idempotencyKey)
      : undefined);
  if (duplicate) {
    const existing = data.cases.findBySignalId(duplicate.signalId);
    if (existing) return existing;
  }

  if (["BOARDING_COMPLETE", "ALIGHTING_COMPLETE"].includes(observation.kind)) {
    const completionCase = data.cases.findOpen({
      stopCode: observation.stopCode,
      ...(observation.busCandidate ? { busId: observation.busCandidate } : {}),
    });
    if (!completionCase) {
      throw new OperationsNotFoundError(
        "No active assistance case matches the completion signal",
      );
    }
    data.observations.put(observation);
    completionCase.completionDetectedAt = observation.observedAt;
    completionCase.completionConfidence = observation.confidence;
    completionCase.completionConfirmed = observation.confidence >= 0.9;
    if (observation.confidence < 0.9) {
      completionCase.state = "NEEDS_CONFIRMATION";
      completionCase.escalationReason =
        "Boarding completion confidence is too low";
      return saveAndPublish(completionCase);
    }
    audit(
      "ASSISTANCE_COMPLETION_DETECTED",
      observation.source,
      completionCase.caseId,
      completionCase.busId,
    );
    return progressTerminalTransition(completionCase, "COMPLETED", now);
  }

  const explicit = !SENSOR_SOURCES.includes(observation.source);
  const confirmed = observation.confirmed ?? explicit;
  let target = data.cases.findOpen({
    stopCode: observation.stopCode,
    phase: observation.phase ?? "BOARDING",
    busId: observation.busCandidate ?? null,
  });

  if (!target) {
    target = {
      caseId: createId("CASE"),
      stopCode: observation.stopCode,
      busId: observation.busCandidate,
      busService: observation.busService,
      phase: observation.phase ?? "BOARDING",
      intents: [],
      assistanceTypes: [],
      passengerCount: 0,
      confidence: observation.confidence,
      boardingIntent: emptyBoardingIntent(observation.busCandidate, now),
      state: "REQUESTED",
      actionPlan: [],
      outcome: {
        caseId: "",
        operatorInterventions: 0,
        safetyBlocks: 0,
        failures: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    target.outcome.caseId = target.caseId;
  }

  const intent = {
    intentId: createId("INTENT"),
    signalId: observation.signalId,
    source: observation.source,
    anonymousToken: observation.anonymousToken,
    assistanceTypes: [...new Set(observation.assistanceCandidates)],
    confidence: observation.confidence,
    confirmed,
    createdAt: now,
    confirmedAt: confirmed ? now : undefined,
  };
  target.intents.push(intent);
  target.assistanceTypes = unique(
    target.intents.flatMap((candidate) => candidate.assistanceTypes),
  );
  target.passengerCount = new Set(
    target.intents.map((candidate) => candidate.anonymousToken),
  ).size;
  target.confidence = Math.max(
    ...target.intents.map((candidate) => candidate.confidence),
  );
  target.actionPlan = mergeActionPlan(target);
  target.state = confirmed ? "VALIDATED" : "NEEDS_CONFIRMATION";
  target.updatedAt = now;

  data.observations.put(observation);
  data.cases.upsert(target);
  audit("SIGNAL_ACCEPTED", observation.source, target.caseId, target.busId, {
    signalId: observation.signalId,
    confirmed,
    assistanceTypes: observation.assistanceCandidates,
  });
  if (observation.kind === "HUMAN_HELP_REQUESTED") {
    return escalate(target, "Passenger requested immediate human help");
  }
  return evaluateCase(target.caseId);
}

export function recordPassengerRequest(
  request: PassengerAssistanceRequest,
): AssistanceCase {
  ensureMockVehicleCapability(request.busId, request.busService);
  const sourceMap: Record<PassengerAssistanceRequest["source"], SignalSource> =
    {
      MOBILE_APP: "APP",
      PHYSICAL_BUTTON: "PHYSICAL_BUTTON",
      RFID: "NFC",
      AUTOMATIC_DETECTION: "CAMERA",
    };
  const caseRecord = submitSignalObservation({
    signalId: request.requestId,
    idempotencyKey: request.requestId,
    source: sourceMap[request.source],
    kind:
      request.source === "AUTOMATIC_DETECTION"
        ? "PASSENGER_IN_BOARDING_ZONE"
        : "EXPLICIT_ASSISTANCE_REQUEST",
    stopCode: request.stopCode ?? request.boardingStop,
    busCandidate: request.busId,
    busService: request.busService,
    assistanceCandidates: request.assistanceTypes,
    confidence: request.source === "AUTOMATIC_DETECTION" ? 0.75 : 1,
    anonymousToken: request.sessionId,
    phase: request.boardingOrAlighting,
    confirmed: request.source !== "AUTOMATIC_DETECTION",
    observedAt: request.createdAt,
  });
  return caseRecord;
}

export function synchronizeLegacyCaseStatus(
  caseId: string,
  status: AssistanceRequestStatus,
): AssistanceCase {
  const item = requireCase(caseId);
  if (TERMINAL_STATES.includes(item.state)) {
    audit(
      `LEGACY_REQUEST_${status}_IGNORED`,
      "REQUEST_API",
      caseId,
      item.busId,
      { terminalState: item.state },
    );
    return item;
  }
  if (status === AssistanceRequestStatus.CANCELLED) {
    item.cancellationRequestedAt = new Date().toISOString();
    audit(`LEGACY_REQUEST_${status}`, "REQUEST_API", caseId, item.busId);
    return progressTerminalTransition(item, "CANCELLED");
  } else if (status === AssistanceRequestStatus.FAILED) {
    item.state = "FAILED";
    const reason = "Passenger request delivery failed";
    item.escalationReason = reason;
    if (!item.outcome.failures.includes(reason))
      item.outcome.failures.push(reason);
  } else {
    return item;
  }
  item.updatedAt = new Date().toISOString();
  saveCase(item);
  audit(`LEGACY_REQUEST_${status}`, "REQUEST_API", caseId, item.busId);
  return publishCase(item);
}

export function registerVehicleCapability(
  capability: VehicleCapability,
): VehicleCapability {
  if (
    !capability.busId ||
    [
      capability.ramp,
      capability.externalAudio,
      capability.visualDisplay,
      capability.dwellControl,
    ].some((value) => typeof value !== "boolean") ||
    !Number.isInteger(capability.wheelchairSpaceCapacity) ||
    capability.wheelchairSpaceCapacity < 0 ||
    !Array.isArray(capability.supportedTelemetry)
  ) {
    throw new OperationsValidationError("Invalid vehicle capability payload");
  }
  const normalized = { ...capability, updatedAt: new Date().toISOString() };
  getOperationsData().capabilities.put(normalized);
  audit("VEHICLE_CAPABILITY_UPDATED", "VEHICLE", undefined, capability.busId);
  listCases({ busId: capability.busId, refresh: false })
    .filter((item) => !TERMINAL_STATES.includes(item.state))
    .forEach((item) => evaluateCase(item.caseId));
  return normalized;
}

export function ingestSafetyTelemetry(input: SafetyTelemetry): SafetyTelemetry {
  if (
    !input.busId ||
    [
      input.vehicleStopped,
      input.parkingBrakeActive,
      input.doorOpen,
      input.deploymentPathClear,
    ].some((value) => typeof value !== "boolean") ||
    ![
      "STOWED",
      "DEPLOYING",
      "DEPLOYED",
      "RETRACTING",
      "FAULT",
      "UNKNOWN",
    ].includes(input.rampPosition)
  ) {
    throw new OperationsValidationError("Invalid safety telemetry payload");
  }
  let telemetry = input;
  if (input.rampObstacle) {
    try {
      const classification = getOperationsData().rampClassifications.get(
        input.busId,
      );
      telemetry = {
        ...input,
        rampObstacle: fuseRampObstacleAssessment(
          input.rampObstacle,
          classification,
        ),
      };
    } catch {
      throw new OperationsValidationError("Invalid ramp obstacle telemetry");
    }
  }
  validateIsoDate(telemetry.observedAt, "observedAt");
  const current = getOperationsData().telemetry.get(input.busId);
  if (
    current &&
    new Date(telemetry.observedAt) < new Date(current.observedAt)
  ) {
    throw new OperationsValidationError(
      "Stale telemetry cannot replace newer telemetry",
    );
  }
  getOperationsData().telemetry.put(telemetry);
  emit({
    type: "SAFETY_TELEMETRY",
    busId: telemetry.busId,
    stopCode: telemetry.stopCode,
    telemetry,
    fresh: isTelemetryFresh(telemetry),
    timestamp: new Date().toISOString(),
  });
  const presence = deriveStopVehiclePresence(telemetry);
  if (presence) {
    emit({
      type: "STOP_VEHICLE_PRESENCE",
      stopCode: presence.stopCode,
      vehicle: presence,
      timestamp: new Date().toISOString(),
    });
  }
  if (current?.stopCode && current.stopCode !== telemetry.stopCode) {
    const departed = createDepartedStopVehiclePresence(current);
    if (departed) {
      emit({
        type: "STOP_VEHICLE_PRESENCE",
        stopCode: departed.stopCode,
        vehicle: departed,
        timestamp: new Date().toISOString(),
      });
    }
  }
  audit("SAFETY_TELEMETRY_RECEIVED", "VEHICLE", undefined, telemetry.busId, {
    stopCode: telemetry.stopCode,
    rampPosition: telemetry.rampPosition,
    rampObstacle: telemetry.rampObstacle?.reason,
  });
  listCases({ busId: telemetry.busId, refresh: false })
    .filter((item) => !TERMINAL_STATES.includes(item.state))
    .forEach((item) => evaluateCase(item.caseId));
  return telemetry;
}

export function updateActuatorStatus(input: ActuatorStatus): AssistanceCase {
  if (
    ![
      "ISSUED",
      "ACCEPTED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "BLOCKED",
      "FAILED",
    ].includes(input.state)
  ) {
    throw new OperationsValidationError("Invalid actuator state");
  }
  validateIsoDate(input.updatedAt, "updatedAt");
  const data = getOperationsData();
  const command = data.commands.get(input.commandId);
  if (!command) throw new OperationsNotFoundError("Actuator command not found");
  if (command.caseId !== input.caseId || command.busId !== input.busId) {
    throw new OperationsValidationError(
      "Actuator status does not match its command",
    );
  }
  const currentStatus = data.statuses.get(input.commandId);
  if (
    currentStatus &&
    ["COMPLETED", "CANCELLED", "BLOCKED", "FAILED"].includes(
      currentStatus.state,
    ) &&
    currentStatus.state !== input.state
  ) {
    throw new OperationsValidationError(
      "Terminal actuator status cannot be changed",
    );
  }
  if (
    new Date(input.updatedAt).getTime() >
      new Date(command.expiresAt).getTime() &&
    (!currentStatus ||
      ["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(currentStatus.state))
  ) {
    expireActuatorCommands(new Date(input.updatedAt).getTime());
    throw new OperationsValidationError(
      "Actuator command expired before this status update",
    );
  }
  if (
    currentStatus &&
    new Date(input.updatedAt) < new Date(currentStatus.updatedAt)
  ) {
    throw new OperationsValidationError("Stale actuator status rejected");
  }
  data.putStatus(input);
  emit({
    type: "ACTUATOR_STATUS",
    caseId: input.caseId,
    busId: input.busId,
    status: input,
    timestamp: new Date().toISOString(),
  });
  audit("ACTUATOR_STATUS_UPDATED", "ACTUATOR", input.caseId, input.busId, {
    commandId: input.commandId,
    state: input.state,
    detail: input.detail,
  });
  return evaluateCase(input.caseId);
}

export function applyOperatorAction(
  caseId: string,
  action: "CONFIRM" | "ESCALATE" | "CANCEL" | "COMPLETE" | "RETRY",
  reason?: string,
): AssistanceCase {
  const item = requireCase(caseId);
  const now = new Date().toISOString();
  if (action === "CONFIRM") {
    item.intents = item.intents.map((intent) => ({
      ...intent,
      confirmed: true,
      confirmedAt: intent.confirmedAt ?? now,
    }));
    if (item.completionDetectedAt) item.completionConfirmed = true;
    item.state = "VALIDATED";
  } else if (action === "ESCALATE") {
    item.state = "ESCALATED";
    item.escalationReason = reason ?? "Operator review requested";
  } else if (action === "CANCEL") {
    item.cancellationRequestedAt = now;
    item.state = "ACTUATING";
  } else if (action === "COMPLETE") {
    item.completionDetectedAt = item.completionDetectedAt ?? now;
    item.completionConfidence = item.completionConfidence ?? 1;
    item.completionConfirmed = true;
    item.state = "ACTUATING";
  } else {
    item.state = item.intents.some((intent) => intent.confirmed)
      ? "VALIDATED"
      : "NEEDS_CONFIRMATION";
    item.escalationReason = undefined;
  }
  item.outcome.operatorInterventions += 1;
  item.updatedAt = now;
  saveCase(item);
  audit(`OPERATOR_${action}`, "OPERATOR", caseId, item.busId, { reason });
  if (action === "ESCALATE") emitEscalation(item);
  if (["CONFIRM", "RETRY", "CANCEL", "COMPLETE"].includes(action)) {
    return evaluateCase(caseId);
  }
  return publishCase(item);
}

export function assignCaseVehicle(
  caseId: string,
  busId: string,
  busService?: string,
): AssistanceCase {
  if (!busId) throw new OperationsValidationError("busId is required");
  const item = requireCase(caseId);
  item.busId = busId;
  item.busService = busService ?? item.busService;
  item.state = item.intents.some((intent) => intent.confirmed)
    ? "VALIDATED"
    : "NEEDS_CONFIRMATION";
  item.escalationReason = undefined;
  item.outcome.operatorInterventions += 1;
  item.updatedAt = new Date().toISOString();
  saveCase(item);
  audit("OPERATOR_ASSIGN_VEHICLE", "OPERATOR", caseId, busId, { busService });
  return evaluateCase(caseId);
}

export function recordDeviceHeartbeat(input: DeviceHealth): DeviceHealth {
  validateIsoDate(input.observedAt, "observedAt");
  getOperationsData().devices.put(input);
  emit({
    type: "DEVICE_HEALTH",
    busId: input.busId,
    stopCode: input.stopCode,
    health: input,
    timestamp: new Date().toISOString(),
  });
  return input;
}

export function recordPassengerFeedback(
  caseId: string,
  score: 1 | 2 | 3 | 4 | 5,
): AssistanceCase {
  if (![1, 2, 3, 4, 5].includes(score)) {
    throw new OperationsValidationError("Feedback score must be from 1 to 5");
  }
  const item = requireCase(caseId);
  item.outcome.passengerFeedbackScore = score;
  item.updatedAt = new Date().toISOString();
  saveCase(item);
  audit("PASSENGER_FEEDBACK_RECORDED", "PASSENGER", caseId, item.busId, {
    score,
  });
  return item;
}

export function getCase(
  caseId: string,
  refresh = true,
): AssistanceCase | undefined {
  if (refresh) refreshStaleCases();
  return getOperationsData().cases.get(caseId);
}

export function listCases(
  options: {
    busId?: string;
    state?: AssistanceCaseState;
    refresh?: boolean;
  } = {},
): AssistanceCase[] {
  if (options.refresh !== false) refreshStaleCases();
  return getOperationsData().cases.list({
    ...(options.busId ? { busId: options.busId } : {}),
    ...(options.state ? { state: options.state } : {}),
    limit: CASE_LIST_LIMIT,
  });
}

export function listVehicleCapabilities(): VehicleCapability[] {
  return getOperationsData().capabilities.list(FLEET_LIST_LIMIT);
}

export function getLatestSafetyTelemetry(
  busId: string,
): SafetyTelemetry | undefined {
  return getOperationsData().telemetry.get(busId);
}

export function listPendingActuatorCommands(busId?: string): ActuatorCommand[] {
  refreshStaleCases();
  expireActuatorCommands();
  const data = getOperationsData();
  return data.openCommands(OPEN_COMMAND_LIMIT).filter((command) => {
    if (busId && command.busId !== busId) return false;
    const status = data.statuses.get(command.commandId);
    return (
      !status || ["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(status.state)
    );
  });
}

export function listDevices(): DeviceHealth[] {
  return getOperationsData().devices.list(FLEET_LIST_LIMIT);
}

export function getAssistanceMetrics(): AssistanceMetrics {
  refreshStaleCases();
  const data = getOperationsData();
  const cases = data.cases.list({ limit: METRICS_CASE_LIMIT });
  const acknowledgements = cases
    .map((item) => item.outcome.acknowledgedLatencyMs)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const completionTimes = cases
    .map((item) => item.outcome.completionTimeMs)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);
  const feedback: number[] = cases.flatMap((item) =>
    item.outcome.passengerFeedbackScore === undefined
      ? []
      : [item.outcome.passengerFeedbackScore],
  );
  const interventions = cases.reduce(
    (sum, item) => sum + item.outcome.operatorInterventions,
    0,
  );
  const byState = data.cases.countByState();
  const sensorObservations = SENSOR_SOURCES.reduce(
    (sum, source) => sum + data.observations.countBy("source", source),
    0,
  );
  return {
    totalCases: data.cases.count(),
    activeCases: cases.filter((item) => !TERMINAL_STATES.includes(item.state))
      .length,
    completedCases: byState.COMPLETED ?? 0,
    escalatedCases: byState.ESCALATED ?? 0,
    failedCases: byState.FAILED ?? 0,
    explicitRequests: data.observations.count() - sensorObservations,
    sensorObservations,
    acknowledgementP95Ms: percentile(acknowledgements, 0.95),
    medianCompletionMs: percentile(completionTimes, 0.5),
    operatorInterventionRate:
      cases.length === 0 ? 0 : interventions / cases.length,
    safetyBlocks: cases.reduce(
      (sum, item) => sum + item.outcome.safetyBlocks,
      0,
    ),
    averagePassengerFeedback:
      feedback.length === 0
        ? undefined
        : feedback.reduce((sum, value) => sum + value, 0) / feedback.length,
  };
}

export function clearOperations(removePersistentFiles = false): void {
  resetOperationsData(removePersistentFiles);
}

function evaluateCase(caseId: string): AssistanceCase {
  const item = requireCase(caseId);
  if (TERMINAL_STATES.includes(item.state)) return item;
  if (item.cancellationRequestedAt) {
    return progressTerminalTransition(item, "CANCELLED");
  }
  if (item.completionDetectedAt) {
    if (!item.completionConfirmed) {
      item.state = "NEEDS_CONFIRMATION";
      item.escalationReason =
        "Boarding or alighting completion needs confirmation";
      return saveAndPublish(item);
    }
    return progressTerminalTransition(item, "COMPLETED");
  }
  const now = new Date().toISOString();
  const confirmedTypes = unique(
    item.intents
      .filter((intent) => intent.confirmed)
      .flatMap((intent) => intent.assistanceTypes),
  );
  const unconfirmedUnsafeIntent = item.intents.some(
    (intent) =>
      !intent.confirmed &&
      intent.assistanceTypes.some((type) => type !== "EXTENDED_DWELL_TIME"),
  );
  if (confirmedTypes.length === 0 && unconfirmedUnsafeIntent) {
    item.state = "NEEDS_CONFIRMATION";
    item.escalationReason =
      "Sensor-only assistance requires passenger or operator confirmation";
    return saveAndPublish(item);
  }
  if (!item.busId) {
    item.state = "NEEDS_CONFIRMATION";
    item.escalationReason = "A specific vehicle has not been confirmed";
    return saveAndPublish(item);
  }
  const capability = getOperationsData().capabilities.get(item.busId);
  if (!capability) {
    return escalate(item, "Vehicle capabilities are unavailable");
  }
  const unsupported = item.assistanceTypes.filter(
    (type) => !capabilitySupports(capability, type),
  );
  if (unsupported.length) {
    return escalate(item, `Vehicle cannot provide: ${unsupported.join(", ")}`);
  }
  if (
    item.assistanceTypes.includes("WHEELCHAIR_RAMP") &&
    capability.wheelchairSpaceCapacity < 1
  ) {
    return escalate(
      item,
      "No wheelchair space is available on the assigned vehicle",
    );
  }

  item.state = "VEHICLE_ASSIGNED";
  item.escalationReason = undefined;
  if (!item.acknowledgedAt) {
    item.acknowledgedAt = now;
    item.outcome.acknowledgedLatencyMs =
      Date.now() - new Date(item.createdAt).getTime();
  }
  issueNonRampCommands(item);

  if (item.assistanceTypes.includes("WHEELCHAIR_RAMP")) {
    if (!confirmedTypes.includes("WHEELCHAIR_RAMP")) {
      item.state = "NEEDS_CONFIRMATION";
      item.escalationReason =
        "Ramp deployment requires confirmed passenger intent";
      return saveAndPublish(item);
    }
    const telemetry = getLatestSafetyTelemetry(item.busId);
    if (!telemetry) {
      return block(item, "Vehicle safety telemetry is unavailable");
    }
    if (!isTelemetryFresh(telemetry)) {
      return block(item, "Vehicle safety telemetry is stale");
    }
    const safetyFailure = rampSafetyFailure(item, telemetry);
    if (safetyFailure) return block(item, safetyFailure);
    item.state = "SAFE_TO_ACTUATE";
    issueCommand(item, "DEPLOY_RAMP", { phase: item.phase });
  }

  return finishFromActuatorStatuses(item);
}

function progressTerminalTransition(
  item: AssistanceCase,
  terminalState: "COMPLETED" | "CANCELLED",
  requestedAt = new Date().toISOString(),
): AssistanceCase {
  const data = getOperationsData();
  const deployCommand = data.commands.findOne(
    "caseCommand",
    `${item.caseId}:DEPLOY_RAMP`,
  );
  if (!item.assistanceTypes.includes("WHEELCHAIR_RAMP") || !deployCommand) {
    return finalizeTerminalTransition(item, terminalState, requestedAt);
  }

  const deployStatus = data.statuses.get(deployCommand.commandId);
  if (
    terminalState === "CANCELLED" &&
    (!deployStatus || deployStatus.state === "ISSUED")
  ) {
    cancelUnstartedRampDeployment(item, deployCommand);
  }
  const telemetry = item.busId
    ? getLatestSafetyTelemetry(item.busId)
    : undefined;
  if (!telemetry || !isTelemetryFresh(telemetry)) {
    return block(
      item,
      "Ramp position cannot be verified before closing the assistance case",
    );
  }
  if (telemetry.rampPosition === "STOWED") {
    return finalizeTerminalTransition(item, terminalState, requestedAt);
  }
  if (
    telemetry.rampPosition === "FAULT" ||
    telemetry.rampPosition === "UNKNOWN"
  ) {
    return block(
      item,
      "Ramp must be inspected because its stowed position is not verified",
    );
  }
  if (telemetry.rampPosition === "DEPLOYING") {
    item.state = "ACTUATING";
    item.escalationReason =
      "Waiting for ramp deployment to stop before safe retraction";
    return saveAndPublish(item);
  }

  const safetyFailure = rampRetractionSafetyFailure(item, telemetry);
  if (safetyFailure) return block(item, safetyFailure);
  ensureRampRetractionPlan(item);
  const retractCommand = issueCommand(item, "RETRACT_RAMP", {
    terminalState,
    phase: item.phase,
  });
  const retractStatus = data.statuses.get(retractCommand.commandId);
  if (retractStatus?.state === "FAILED") {
    return fail(item, retractStatus.detail ?? "Ramp retraction failed");
  }
  if (retractStatus?.state === "BLOCKED") {
    return block(item, retractStatus.detail ?? "Ramp retraction was blocked");
  }
  item.state = "ACTUATING";
  item.escalationReason =
    terminalState === "CANCELLED"
      ? "Request cancelled; safely stowing the ramp"
      : "Boarding verified; safely stowing the ramp";
  if (
    retractStatus?.state === "COMPLETED" &&
    Date.now() - Date.parse(retractStatus.updatedAt) > 2_000
  ) {
    return block(
      item,
      "Ramp controller completed but the stowed limit switch was not verified",
    );
  }
  return saveAndPublish(item);
}

function finalizeTerminalTransition(
  item: AssistanceCase,
  terminalState: "COMPLETED" | "CANCELLED",
  requestedAt: string,
): AssistanceCase {
  const now = new Date().toISOString();
  item.state = terminalState;
  item.escalationReason = undefined;
  item.actionPlan = item.actionPlan.map((plan) =>
    plan.action === "RETRACT_RAMP" || terminalState === "COMPLETED"
      ? { ...plan, status: "COMPLETED" }
      : plan,
  );
  if (terminalState === "COMPLETED") {
    item.outcome.completedAt = now;
    item.outcome.completionTimeMs =
      Date.parse(now) - new Date(item.createdAt).getTime();
  } else {
    item.cancellationRequestedAt = item.cancellationRequestedAt ?? requestedAt;
  }
  audit(
    terminalState === "COMPLETED"
      ? "ASSISTANCE_COMPLETED_RAMP_STOWED"
      : "ASSISTANCE_CANCELLED_RAMP_SAFE",
    "ORCHESTRATOR",
    item.caseId,
    item.busId,
  );
  return saveAndPublish(item);
}

function ensureRampRetractionPlan(item: AssistanceCase): void {
  if (item.actionPlan.some((plan) => plan.action === "RETRACT_RAMP")) return;
  item.actionPlan.push({
    assistanceType: "WHEELCHAIR_RAMP",
    action: "RETRACT_RAMP",
    requiresSafetyClearance: true,
    status: "PLANNED",
  });
}

function cancelUnstartedRampDeployment(
  item: AssistanceCase,
  command: ActuatorCommand,
): void {
  const now = new Date().toISOString();
  const data = getOperationsData();
  if (!data.statuses.get(command.commandId)) {
    data.putStatus({
      commandId: command.commandId,
      caseId: item.caseId,
      busId: command.busId,
      state: "CANCELLED",
      detail: "Passenger cancelled before ramp movement began",
      updatedAt: now,
    });
  }
  audit("RAMP_DEPLOYMENT_CANCELLED", "ORCHESTRATOR", item.caseId, item.busId, {
    commandId: command.commandId,
  });
}

function rampRetractionSafetyFailure(
  item: AssistanceCase,
  telemetry: SafetyTelemetry,
): string | undefined {
  if (telemetry.stopCode && telemetry.stopCode !== item.stopCode) {
    return "Vehicle is at a different stop";
  }
  if (!telemetry.vehicleStopped) return "Vehicle moved before ramp retraction";
  if (!telemetry.parkingBrakeActive)
    return "Parking brake released before ramp retraction";
  if (!telemetry.doorOpen) return "Door closed before ramp retraction";
  if (!telemetry.deploymentPathClear)
    return "Passenger or object remains in the ramp path";
  if (telemetry.rampObstacle?.blocksDeployment)
    return telemetry.rampObstacle.reason;
  if (telemetry.networkOnline === false) return "Vehicle controller is offline";
  return undefined;
}

function finishFromActuatorStatuses(item: AssistanceCase): AssistanceCase {
  const data = getOperationsData();
  const commands = data.commands.find("caseId", item.caseId, PER_CASE_LIMIT);
  const statuses = commands.map((command) => ({
    command,
    status: data.statuses.get(command.commandId),
  }));
  const failure = statuses.find(
    ({ status }) => status && ["BLOCKED", "FAILED"].includes(status.state),
  );
  if (failure?.status) {
    return failure.status.state === "FAILED"
      ? fail(item, failure.status.detail ?? "Actuator reported a fault")
      : block(item, failure.status.detail ?? "Actuator was blocked");
  }
  if (commands.length === 0) return saveAndPublish(item);
  item.state = "ACTUATING";
  const allComplete = statuses.every(
    ({ status }) => status?.state === "COMPLETED",
  );
  if (!allComplete) return saveAndPublish(item);
  if (commands.some((command) => command.command === "DEPLOY_RAMP")) {
    const telemetry = item.busId
      ? getLatestSafetyTelemetry(item.busId)
      : undefined;
    if (
      !telemetry ||
      !isTelemetryFresh(telemetry) ||
      telemetry.rampPosition !== "DEPLOYED"
    ) {
      return block(
        item,
        "Ramp completion was not verified by the deployed limit switch",
      );
    }
  }
  item.state = "READY";
  item.actionPlan = item.actionPlan.map((plan) => ({
    ...plan,
    status: "READY",
  }));
  return saveAndPublish(item);
}

function expireActuatorCommands(nowMs = Date.now()): void {
  const data = getOperationsData();
  const expired = data.openCommands(OPEN_COMMAND_LIMIT).filter((command) => {
    if (new Date(command.expiresAt).getTime() >= nowMs) return false;
    const status = data.statuses.get(command.commandId);
    return (
      !status || ["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(status.state)
    );
  });
  if (expired.length === 0) return;

  const updatedAt = new Date(nowMs).toISOString();
  for (const command of expired) {
    const failedStatus: ActuatorStatus = {
      commandId: command.commandId,
      caseId: command.caseId,
      busId: command.busId,
      state: "FAILED",
      detail: "Actuator command expired before completion",
      updatedAt,
    };
    data.putStatus(failedStatus);
  }

  for (const command of expired) {
    audit(
      "ACTUATOR_COMMAND_EXPIRED",
      "ORCHESTRATOR",
      command.caseId,
      command.busId,
      {
        commandId: command.commandId,
        command: command.command,
        expiresAt: command.expiresAt,
      },
    );
    evaluateCase(command.caseId);
  }
}

function issueNonRampCommands(item: AssistanceCase): void {
  if (item.assistanceTypes.includes("EXTENDED_DWELL_TIME")) {
    issueCommand(item, "EXTEND_DWELL", { seconds: 30 });
  }
  if (item.assistanceTypes.includes("BUS_AUDIO_IDENTIFICATION")) {
    issueCommand(item, "PLAY_EXTERNAL_AUDIO", {
      message: `Bus ${item.busService ?? item.busId ?? "assigned"}`,
    });
    issueCommand(item, "SHOW_VISUAL_MESSAGE", {
      message: `Bus ${item.busService ?? item.busId ?? "assigned"}`,
    });
    issueCommand(item, "VIBRATE_STOP_CONTROL", { pattern: "BUS_APPROACHING" });
  }
}

function issueCommand(
  item: AssistanceCase,
  commandType: ActuatorCommandType,
  payload?: Record<string, string | number | boolean>,
): ActuatorCommand {
  const data = getOperationsData();
  const existing = data.commands.findOne(
    "caseCommand",
    `${item.caseId}:${commandType}`,
  );
  if (existing) return existing;
  const issuedAt = new Date().toISOString();
  const command: ActuatorCommand = {
    commandId: createId("CMD"),
    caseId: item.caseId,
    busId: item.busId!,
    stopCode: item.stopCode,
    command: commandType,
    payload,
    idempotencyKey: `${item.caseId}:${commandType}`,
    issuedAt,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
  data.putCommand(command);
  const plan = item.actionPlan.find(
    (candidate) =>
      candidate.action === commandType && candidate.status === "PLANNED",
  );
  if (plan) {
    plan.status = "COMMAND_ISSUED";
    plan.commandId = command.commandId;
  }
  audit("ACTUATOR_COMMAND_ISSUED", "ORCHESTRATOR", item.caseId, item.busId, {
    commandId: command.commandId,
    command: command.command,
  });
  return command;
}

function rampSafetyFailure(
  item: AssistanceCase,
  telemetry: SafetyTelemetry,
): string | undefined {
  if (telemetry.stopCode && telemetry.stopCode !== item.stopCode)
    return "Vehicle is at a different stop";
  if (!telemetry.vehicleStopped) return "Vehicle is not stopped";
  if (!telemetry.parkingBrakeActive) return "Parking brake is not active";
  if (!telemetry.doorOpen) return "Door is not open";
  if (!telemetry.deploymentPathClear)
    return "Ramp deployment path is obstructed";
  if (telemetry.rampObstacle?.blocksDeployment) {
    return telemetry.rampObstacle.reason;
  }
  if (telemetry.rampPosition === "FAULT")
    return "Ramp position sensor reports a fault";
  if (telemetry.wheelchairSpaceOccupied) return "Wheelchair space is occupied";
  if (telemetry.networkOnline === false) return "Vehicle controller is offline";
  return undefined;
}

function block(item: AssistanceCase, reason: string): AssistanceCase {
  const isNewBlock =
    item.state !== "BLOCKED" || item.escalationReason !== reason;
  item.state = "BLOCKED";
  item.escalationReason = reason;
  item.actionPlan = item.actionPlan.map((plan) =>
    ["DEPLOY_RAMP", "RETRACT_RAMP"].includes(plan.action)
      ? { ...plan, status: "BLOCKED" }
      : plan,
  );
  if (isNewBlock) item.outcome.safetyBlocks += 1;
  const saved = saveAndPublish(item);
  emitEscalation(saved);
  return saved;
}

function fail(item: AssistanceCase, reason: string): AssistanceCase {
  item.state = "FAILED";
  item.escalationReason = reason;
  if (!item.outcome.failures.includes(reason))
    item.outcome.failures.push(reason);
  const saved = saveAndPublish(item);
  emitEscalation(saved);
  return saved;
}

function escalate(item: AssistanceCase, reason: string): AssistanceCase {
  item.state = "ESCALATED";
  item.escalationReason = reason;
  const saved = saveAndPublish(item);
  emitEscalation(saved);
  return saved;
}

function emitEscalation(item: AssistanceCase): void {
  emit({
    type: "OPERATOR_ESCALATION",
    caseId: item.caseId,
    busId: item.busId,
    stopCode: item.stopCode,
    reason: item.escalationReason ?? "Operator attention required",
    timestamp: new Date().toISOString(),
  });
}

function publishCase(item: AssistanceCase): AssistanceCase {
  emit({
    type: "CASE_STATUS",
    caseId: item.caseId,
    busId: item.busId,
    stopCode: item.stopCode,
    state: item.state,
    passengerCount: item.passengerCount,
    assistanceTypes: item.assistanceTypes,
    escalationReason: item.escalationReason,
    timestamp: new Date().toISOString(),
  });
  return item;
}

function saveAndPublish(item: AssistanceCase): AssistanceCase {
  item.updatedAt = new Date().toISOString();
  saveCase(item);
  return publishCase(item);
}

function saveCase(item: AssistanceCase): void {
  item.boardingIntent = deriveBoardingIntent(item);
  getOperationsData().cases.upsert(item);
}

function emptyBoardingIntent(
  targetBusId: string | undefined,
  assessedAt: string,
): BoardingIntentAssessment {
  return {
    decision: "UNCONFIRMED",
    confidence: 0,
    targetBusId,
    reason: "Waiting for passenger intent evidence",
    evidence: [],
    assessedAt,
  };
}

function deriveBoardingIntent(item: AssistanceCase): BoardingIntentAssessment {
  const stored = getOperationsData().observations;
  const observations = item.intents.flatMap((intent) => {
    const observation = stored.get(intent.signalId);
    return observation ? [observation] : [];
  });
  const evidence = observations.map((observation) => {
    const intent = item.intents.find(
      (candidate) => candidate.signalId === observation.signalId,
    );
    return {
      signalId: observation.signalId,
      source: observation.source,
      kind: observation.kind,
      confidence: observation.confidence,
      confirmed: intent?.confirmed ?? false,
      observedAt: observation.observedAt,
    };
  });
  const assessedAt = new Date().toISOString();
  if (item.cancellationRequestedAt || item.state === "CANCELLED") {
    return {
      decision: "DECLINED",
      confidence: 1,
      targetBusId: item.busId,
      reason: "Passenger or operator cancelled the boarding intent",
      evidence,
      assessedAt,
    };
  }
  const confirmed = evidence.filter((candidate) => candidate.confirmed);
  if (confirmed.length > 0) {
    return {
      decision: "CONFIRMED",
      confidence: Math.max(
        ...confirmed.map((candidate) => candidate.confidence),
      ),
      targetBusId: item.busId,
      reason: "Passenger or operator explicitly confirmed this vehicle",
      evidence,
      assessedAt,
    };
  }
  const boardingZone = evidence.find(
    (candidate) => candidate.kind === "PASSENGER_IN_BOARDING_ZONE",
  );
  const mobilityIndicator = evidence.find((candidate) =>
    [
      "WHEELCHAIR_DETECTED",
      "WALKING_AID_DETECTED",
      "STROLLER_DETECTED",
    ].includes(candidate.kind),
  );
  const telemetry = item.busId
    ? getLatestSafetyTelemetry(item.busId)
    : undefined;
  const assignedBusAtStop = Boolean(
    telemetry &&
    isTelemetryFresh(telemetry) &&
    telemetry.vehicleStopped &&
    (!telemetry.stopCode || telemetry.stopCode === item.stopCode),
  );
  if (boardingZone && (mobilityIndicator || assignedBusAtStop)) {
    const confidence = Math.min(
      0.89,
      Math.max(boardingZone.confidence, mobilityIndicator?.confidence ?? 0),
    );
    return {
      decision: "LIKELY",
      confidence,
      targetBusId: item.busId,
      reason:
        "Perception suggests boarding intent, but explicit confirmation is still required",
      evidence,
      assessedAt,
    };
  }
  return {
    decision: "UNCONFIRMED",
    confidence: evidence.length
      ? Math.min(
          0.79,
          Math.max(...evidence.map((candidate) => candidate.confidence)),
        )
      : 0,
    targetBusId: item.busId,
    reason:
      "Presence or mobility detection alone does not prove boarding intent",
    evidence,
    assessedAt,
  };
}

function refreshStaleCases(): void {
  const data = getOperationsData();
  for (const item of data.cases.listOpen(OPEN_CASE_LIMIT)) {
    if (
      item.assistanceTypes.includes("WHEELCHAIR_RAMP") &&
      ["SAFE_TO_ACTUATE", "ACTUATING"].includes(item.state)
    ) {
      const telemetry = item.busId ? data.telemetry.get(item.busId) : undefined;
      if (telemetry && !isTelemetryFresh(telemetry)) {
        block(item, "Vehicle safety telemetry is stale");
      }
    }
  }
}

function requireCase(caseId: string): AssistanceCase {
  const item = getOperationsData().cases.get(caseId);
  if (!item) throw new OperationsNotFoundError("Assistance case not found");
  return item;
}

function ensureMockVehicleCapability(busId: string, busService?: string): void {
  if (getOperationsData().capabilities.get(busId)) return;
  const bus = getBusById(busId);
  registerVehicleCapability({
    busId,
    busService,
    ramp: bus?.isAccessible ?? false,
    externalAudio: true,
    visualDisplay: true,
    dwellControl: true,
    wheelchairSpaceCapacity: bus?.wheelchairSpaces ?? 0,
    supportedTelemetry: [
      "stopCode",
      "vehicleStopped",
      "parkingBrakeActive",
      "doorOpen",
      "deploymentPathClear",
      "rampPosition",
      "wheelchairSpaceOccupied",
      "networkOnline",
    ],
    updatedAt: new Date().toISOString(),
  });
}

function capabilitySupports(
  capability: VehicleCapability,
  type: AssistanceType,
): boolean {
  if (type === "WHEELCHAIR_RAMP") return capability.ramp;
  if (type === "BUS_AUDIO_IDENTIFICATION") {
    return capability.externalAudio && capability.visualDisplay;
  }
  return capability.dwellControl;
}

function mergeActionPlan(item: AssistanceCase): AssistanceCase["actionPlan"] {
  const desired: Array<Omit<AssistanceActionPlanItem, "status" | "commandId">> =
    [];
  item.assistanceTypes.forEach((type) => {
    if (type === "WHEELCHAIR_RAMP") {
      desired.push({
        assistanceType: type,
        action: "DEPLOY_RAMP",
        requiresSafetyClearance: true,
      });
      return;
    }
    if (type === "EXTENDED_DWELL_TIME") {
      desired.push({
        assistanceType: type,
        action: "EXTEND_DWELL",
        requiresSafetyClearance: false,
      });
      return;
    }
    desired.push(
      {
        assistanceType: type,
        action: "PLAY_EXTERNAL_AUDIO" as const,
        requiresSafetyClearance: false,
      },
      {
        assistanceType: type,
        action: "SHOW_VISUAL_MESSAGE" as const,
        requiresSafetyClearance: false,
      },
      {
        assistanceType: type,
        action: "VIBRATE_STOP_CONTROL" as const,
        requiresSafetyClearance: false,
      },
    );
  });
  return desired.map((candidate) => {
    const existing = item.actionPlan.find(
      (plan) => plan.action === candidate.action,
    );
    return existing ?? { ...candidate, status: "PLANNED" as const };
  });
}

function validateObservation(input: SignalObservation): void {
  if (!input.signalId || !input.stopCode || !input.anonymousToken) {
    throw new OperationsValidationError(
      "signalId, stopCode and anonymousToken are required",
    );
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new OperationsValidationError("confidence must be between 0 and 1");
  }
  if (
    !input.assistanceCandidates.length &&
    ![
      "PASSENGER_IN_BOARDING_ZONE",
      "BOARDING_COMPLETE",
      "ALIGHTING_COMPLETE",
      "HUMAN_HELP_REQUESTED",
    ].includes(input.kind)
  ) {
    throw new OperationsValidationError(
      "At least one assistance candidate is required",
    );
  }
  const allowedSources: SignalSource[] = [
    "APP",
    "PHYSICAL_BUTTON",
    "NFC",
    "CAMERA",
    "PRESSURE_SENSOR",
    "DISTANCE_SENSOR",
    "OPERATOR",
  ];
  if (!allowedSources.includes(input.source)) {
    throw new OperationsValidationError("Unsupported signal source");
  }
  const allowedTypes: AssistanceType[] = [
    "WHEELCHAIR_RAMP",
    "BUS_AUDIO_IDENTIFICATION",
    "EXTENDED_DWELL_TIME",
  ];
  if (input.assistanceCandidates.some((type) => !allowedTypes.includes(type))) {
    throw new OperationsValidationError("Unsupported assistance candidate");
  }
  validateIsoDate(input.observedAt, "observedAt");
  if (
    SENSOR_SOURCES.includes(input.source) &&
    Date.now() - new Date(input.observedAt).getTime() >
      SENSOR_OBSERVATION_MAX_AGE_MS
  ) {
    throw new OperationsValidationError("Stale sensor observation rejected");
  }
}

function sanitizeObservation(input: SignalObservation): SignalObservation {
  const metadata = Object.fromEntries(
    Object.entries(input.metadata ?? {}).filter(
      ([key]) => !/(image|photo|frame|face|biometric|video)/i.test(key),
    ),
  );
  return { ...input, metadata };
}

function validateIsoDate(value: string, field: string): void {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    throw new OperationsValidationError(
      `${field} must be a valid ISO timestamp`,
    );
  }
}

function isTelemetryFresh(telemetry: SafetyTelemetry): boolean {
  return (
    Math.abs(Date.now() - new Date(telemetry.observedAt).getTime()) <=
    TELEMETRY_FRESHNESS_MS
  );
}

function audit(
  eventType: string,
  actor: string,
  caseId?: string,
  busId?: string,
  detail?: Record<string, unknown>,
): void {
  getOperationsData().audit.append({
    eventId: createId("EVENT"),
    eventType,
    caseId,
    busId,
    actor,
    timestamp: new Date().toISOString(),
    detail,
  });
  logger.info(eventType, caseId, { busId, actor });
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function percentile(
  values: number[],
  percentileValue: number,
): number | undefined {
  if (!values.length) return undefined;
  const index = Math.min(
    values.length - 1,
    Math.ceil(values.length * percentileValue) - 1,
  );
  return values[index];
}
