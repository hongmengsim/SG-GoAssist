import {
  AssistanceRequestStatus,
  AssistanceType,
  ExternalAnnouncementMessage,
  PassengerAssistanceRequest,
  SimulatorCommand,
  StatusUpdateMessage,
  VehicleSimulatorCommand,
  VehicleStatus,
  VehicleStatusUpdateMessage,
  canTransitionAssistanceRequestStatus,
  canTransitionVehicleStatus,
} from "@buspass/shared";
import { logger } from "./logger";
import { synchronizeLegacyCaseStatus } from "./assistanceCaseService";

const activeRequests: Map<string, PassengerAssistanceRequest> = new Map();
const vehicleStatuses: Map<string, VehicleStatus> = new Map();
const announcementEvents: ExternalAnnouncementMessage[] = [];

type EventListener = (message: StatusUpdateMessage) => void;
const listeners: Set<EventListener> = new Set();

export function onAssistanceEvent(callback: EventListener) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function waitForRequestStatus(
  requestId: string,
  status: AssistanceRequestStatus,
  timeoutMs: number
): Promise<PassengerAssistanceRequest | undefined> {
  const existing = getRequest(requestId);
  if (existing?.status === status) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(getRequest(requestId));
    }, timeoutMs);

    const unsubscribe = onAssistanceEvent((message) => {
      if (
        message.type === "REQUEST_STATUS" &&
        message.requestId === requestId &&
        message.status === status
      ) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(getRequest(requestId));
      }
    });
  });
}

function emit(message: StatusUpdateMessage) {
  listeners.forEach((callback) => {
    try {
      callback(message);
    } catch (error) {
      logger.error("Error notifying listener", "requestId" in message ? message.requestId : undefined, {
        error: String(error),
      });
    }
  });
}

function requestStatusMessage(request: PassengerAssistanceRequest): StatusUpdateMessage {
  return {
    type: "REQUEST_STATUS",
    requestId: request.requestId,
    status: request.status,
    timestamp: new Date().toISOString(),
    assistanceTypes: request.assistanceTypes,
    source: request.source,
    busId: request.busId,
    busService: request.busService,
    message: `Request status: ${request.status}`,
  };
}

export function createRequest(request: PassengerAssistanceRequest): PassengerAssistanceRequest {
  const duplicate = findDuplicateActiveRequest(
    request.busId,
    request.assistanceTypes,
    request.boardingOrAlighting
  );

  if (duplicate) {
    logger.warn("Duplicate active assistance request prevented", duplicate.requestId, {
      busId: request.busId,
      assistanceTypes: request.assistanceTypes,
      source: request.source,
    });
    return duplicate;
  }

  request.status = AssistanceRequestStatus.SENDING;
  request.createdAt = new Date().toISOString();

  activeRequests.set(request.requestId, request);
  logger.info("Assistance request created", request.requestId, {
    busService: request.busService,
    busId: request.busId,
    assistanceTypes: request.assistanceTypes,
    source: request.source,
  });

  emit(requestStatusMessage(request));
  return request;
}

export function findDuplicateActiveRequest(
  busId: string,
  assistanceTypes: AssistanceType[],
  phase?: PassengerAssistanceRequest["boardingOrAlighting"]
): PassengerAssistanceRequest | undefined {
  return Array.from(activeRequests.values()).find(
    (request) =>
      request.busId === busId &&
      (!phase || request.boardingOrAlighting === phase) &&
      request.status !== AssistanceRequestStatus.CANCELLED &&
      request.status !== AssistanceRequestStatus.FAILED &&
      assistanceTypes.every((type) => request.assistanceTypes.includes(type))
  );
}

export function getRequest(requestId: string): PassengerAssistanceRequest | undefined {
  return activeRequests.get(requestId);
}

export function getAllRequests(): PassengerAssistanceRequest[] {
  return Array.from(activeRequests.values());
}

export function getAnnouncementEvents(): ExternalAnnouncementMessage[] {
  return announcementEvents;
}

function updateRequestStatus(
  requestId: string,
  newStatus: AssistanceRequestStatus
): PassengerAssistanceRequest | null {
  const request = activeRequests.get(requestId);
  if (!request) {
    logger.warn("Request not found for status update", requestId);
    return null;
  }

  if (request.status === newStatus) {
    return request;
  }

  if (!canTransitionAssistanceRequestStatus(request.status, newStatus)) {
    logger.warn(
      `Ignored invalid request status transition: ${request.status} -> ${newStatus}`,
      requestId
    );
    return request;
  }

  const oldStatus = request.status;
  request.status = newStatus;

  const now = new Date().toISOString();
  if (newStatus === AssistanceRequestStatus.ACKNOWLEDGED) {
    request.acknowledgedAt = now;
    logger.info("Assistance request acknowledged", requestId);
  }
  if (newStatus === AssistanceRequestStatus.CANCELLED) {
    request.cancelledAt = now;
    logger.info("Assistance request cancelled", requestId);
  }
  if (newStatus === AssistanceRequestStatus.FAILED) {
    request.failedAt = now;
    logger.info("Assistance request failed", requestId);
  }

  activeRequests.set(requestId, request);
  if (
    request.caseId &&
    (newStatus === AssistanceRequestStatus.CANCELLED ||
      newStatus === AssistanceRequestStatus.FAILED)
  ) {
    synchronizeLegacyCaseStatus(request.caseId, newStatus);
  }
  logger.info(`Request status transition: ${oldStatus} -> ${newStatus}`, requestId);
  emit(requestStatusMessage(request));
  return request;
}

export function processSimulatorCommand(command: SimulatorCommand): {
  success: boolean;
  message: string;
  request?: PassengerAssistanceRequest;
} {
  const commandToStatus: Record<SimulatorCommand["command"], AssistanceRequestStatus> = {
    ACKNOWLEDGE: AssistanceRequestStatus.ACKNOWLEDGED,
    FAIL: AssistanceRequestStatus.FAILED,
    CANCEL: AssistanceRequestStatus.CANCELLED,
  };

  const currentRequest = getRequest(command.requestId);
  if (!currentRequest) {
    return {
      success: false,
      message: `Request ${command.requestId} not found`,
    };
  }

  const nextStatus = commandToStatus[command.command];
  if (currentRequest.status === nextStatus) {
    return {
      success: true,
      message: `Request is already ${nextStatus}`,
      request: currentRequest,
    };
  }

  if (!canTransitionAssistanceRequestStatus(currentRequest.status, nextStatus)) {
    logger.warn(
      `Ignored invalid request status transition: ${currentRequest.status} -> ${nextStatus}`,
      command.requestId,
    );
    return {
      success: false,
      message: `Request remains ${currentRequest.status}`,
      request: currentRequest,
    };
  }

  const request = updateRequestStatus(command.requestId, nextStatus);

  return {
    success: true,
    message: `Request status updated to ${request?.status ?? currentRequest.status}`,
    request: request ?? currentRequest,
  };
}

export function cancelRequest(requestId: string) {
  return processSimulatorCommand({ requestId, command: "CANCEL" });
}

export function processVehicleCommand(command: VehicleSimulatorCommand): {
  success: boolean;
  message: string;
  vehicleEvent: VehicleStatusUpdateMessage;
  announcement?: ExternalAnnouncementMessage;
} {
  const previousStatus = vehicleStatuses.get(command.busId);
  if (previousStatus === command.status) {
    return {
      success: true,
      message: `Vehicle ${command.busId} is already ${previousStatus}`,
      vehicleEvent: {
        type: "VEHICLE_STATUS",
        busId: command.busId,
        busService:
          Array.from(activeRequests.values()).find(
            (request) => request.busId === command.busId,
          )?.busService ?? "UNKNOWN",
        status: previousStatus,
        timestamp: new Date().toISOString(),
        message: `Vehicle status remains ${previousStatus}`,
      },
    };
  }
  if (
    previousStatus &&
    !canTransitionVehicleStatus(previousStatus, command.status)
  ) {
    logger.warn(
      `Ignored invalid vehicle status transition: ${previousStatus} -> ${command.status}`,
      command.busId,
    );
    return {
      success: false,
      message: `Vehicle ${command.busId} remains ${previousStatus}`,
      vehicleEvent: {
        type: "VEHICLE_STATUS",
        busId: command.busId,
        busService:
          Array.from(activeRequests.values()).find(
            (request) => request.busId === command.busId,
          )?.busService ?? "UNKNOWN",
        status: previousStatus,
        timestamp: new Date().toISOString(),
        message: `Vehicle status remains ${previousStatus}`,
      },
    };
  }

  vehicleStatuses.set(command.busId, command.status);

  const busRequest = Array.from(activeRequests.values()).find(
    (request) => request.busId === command.busId
  );
  const busService = busRequest?.busService ?? "UNKNOWN";

  const vehicleEvent: VehicleStatusUpdateMessage = {
    type: "VEHICLE_STATUS",
    busId: command.busId,
    busService,
    status: command.status,
    timestamp: new Date().toISOString(),
    message: `Vehicle status: ${command.status}`,
  };

  logger.info(`Vehicle status: ${command.status}`, command.busId, { busService });
  emit(vehicleEvent);

  const announcement =
    command.status === VehicleStatus.APPROACHING
      ? triggerAudioIdentificationIfNeeded(command.busId)
      : undefined;

  return {
    success: true,
    message: `Vehicle ${command.busId} status updated to ${command.status}`,
    vehicleEvent,
    announcement,
  };
}

function triggerAudioIdentificationIfNeeded(busId: string): ExternalAnnouncementMessage | undefined {
  const request = Array.from(activeRequests.values()).find(
    (candidate) =>
      candidate.busId === busId &&
      candidate.status === AssistanceRequestStatus.ACKNOWLEDGED &&
      candidate.assistanceTypes.includes("BUS_AUDIO_IDENTIFICATION")
  );

  if (!request) {
    return undefined;
  }

  const event: ExternalAnnouncementMessage = {
    type: "EXTERNAL_ANNOUNCEMENT",
    busId: request.busId,
    busService: request.busService,
    requestId: request.requestId,
    assistanceType: "BUS_AUDIO_IDENTIFICATION",
    announcement: `Bus ${request.busService}`,
    timestamp: new Date().toISOString(),
  };

  announcementEvents.push(event);
  logger.info("External announcement triggered", request.requestId, {
    busService: request.busService,
    busId: request.busId,
  });
  emit(event);
  return event;
}

export function clearAllRequests() {
  activeRequests.clear();
  vehicleStatuses.clear();
  announcementEvents.length = 0;
  logger.info("Cleared all requests and simulator events");
}
