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
import crypto from "crypto";
import { withLock } from "../concurrency/locks";
import { getEventHub } from "../events/eventHub";
import { topic } from "../events/topics";
import { logger } from "./logger";
import {
  setRequestCloser,
  synchronizeLegacyCaseStatus,
} from "./assistanceCaseService";
import { TERMINAL_CASE_STATES } from "../cases/ports";
import { getAuditLog, getOperationsData } from "./operationsData";

/** How often a waiter re-reads the request, in case the push came from another process or was lost. */
const WAIT_POLL_MS = 250;
/** Reads that must stay bounded, whatever is stored; the retention policy keeps far fewer. */
const REQUEST_LIST_LIMIT = 5_000;
const ANNOUNCEMENT_LIST_LIMIT = 5_000;
const BUS_REQUEST_LIMIT = 500;

type EventListener = (message: StatusUpdateMessage) => void;
const listeners: Set<EventListener> = new Set();

export function onAssistanceEvent(callback: EventListener) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export async function waitForRequestStatus(
  requestId: string,
  status: AssistanceRequestStatus,
  timeoutMs: number,
): Promise<PassengerAssistanceRequest | undefined> {
  const existing = await getRequest(requestId);
  if (existing?.status === status) return existing;

  // The status change may be made by another backend process, so listen on the shared event
  // bus and also re-read the request now and then (a broker push is best effort).
  return new Promise((resolve) => {
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearInterval(poll);
      unsubscribe();
      getRequest(requestId).then(resolve, () => resolve(undefined));
    };
    const timeout = setTimeout(finish, timeoutMs);
    const poll = setInterval(() => {
      getRequest(requestId).then(
        (current) => {
          if (current?.status === status) finish();
        },
        () => undefined,
      );
    }, WAIT_POLL_MS);
    const unsubscribe = getEventHub().subscribe(
      topic.request(requestId),
      (message) => {
        if (
          message.type === "REQUEST_STATUS" &&
          message.requestId === requestId &&
          message.status === status
        )
          finish();
      },
    );
  });
}

function emit(message: StatusUpdateMessage) {
  listeners.forEach((callback) => {
    try {
      callback(message);
    } catch (error) {
      logger.error(
        "Error notifying listener",
        "requestId" in message ? message.requestId : undefined,
        {
          error: String(error),
        },
      );
    }
  });
}

function requestStatusMessage(
  request: PassengerAssistanceRequest,
): StatusUpdateMessage {
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

/**
 * Creates a request unless the bus already has an equivalent active one, in which case that
 * one is returned. The check and the write are one step under a per-bus lock, so a double tap
 * or a button bounce cannot make two.
 */
export function createRequest(
  request: PassengerAssistanceRequest,
): Promise<PassengerAssistanceRequest> {
  return withLock(`dup:${request.busId}`, () => createRequestUnlocked(request));
}

async function createRequestUnlocked(
  request: PassengerAssistanceRequest,
): Promise<PassengerAssistanceRequest> {
  const duplicate = await findDuplicateActiveRequest(
    request.busId,
    request.assistanceTypes,
    request.boardingOrAlighting,
  );

  if (duplicate) {
    logger.warn(
      "Duplicate active assistance request prevented",
      duplicate.requestId,
      {
        busId: request.busId,
        assistanceTypes: request.assistanceTypes,
        source: request.source,
      },
    );
    return duplicate;
  }

  request.status = AssistanceRequestStatus.SENDING;
  request.createdAt = new Date().toISOString();

  await (await getOperationsData()).requests.put(request);
  logger.info("Assistance request created", request.requestId, {
    busService: request.busService,
    busId: request.busId,
    assistanceTypes: request.assistanceTypes,
    source: request.source,
  });

  emit(requestStatusMessage(request));
  return request;
}

/**
 * Stores a request whose fields the caller changed. Requests come back from storage as
 * copies, so a change is only kept once it is saved.
 */
export async function saveRequest(
  request: PassengerAssistanceRequest,
): Promise<void> {
  await (await getOperationsData()).requests.put(request);
}

/**
 * Records which case a request became, without overwriting a status change that another
 * process may have made since the request was created: it reads the current request under
 * the request's lock, sets the two fields, and writes it back.
 */
export function attachCaseToRequest(
  requestId: string,
  caseId: string,
  caseState: PassengerAssistanceRequest["assistanceCaseState"],
): Promise<PassengerAssistanceRequest | undefined> {
  return withLock(`request:${requestId}`, async () => {
    const current = await getRequest(requestId);
    if (!current) return undefined;
    current.caseId = caseId;
    current.assistanceCaseState = caseState;
    await saveRequest(current);
    return current;
  });
}

export async function findDuplicateActiveRequest(
  busId: string,
  assistanceTypes: AssistanceType[],
  phase?: PassengerAssistanceRequest["boardingOrAlighting"],
): Promise<PassengerAssistanceRequest | undefined> {
  // Only the active states are read, through the (bus, status) index, so a bus with a long
  // history of finished requests costs nothing here and none of them can hide a live one.
  for (const status of [
    AssistanceRequestStatus.SENDING,
    AssistanceRequestStatus.ACKNOWLEDGED,
  ]) {
    for (const request of await getRequestsForBusWithStatus(busId, status)) {
      if (phase && request.boardingOrAlighting !== phase) continue;
      if (
        !assistanceTypes.every((type) => request.assistanceTypes.includes(type))
      )
        continue;
      // A request whose case is over (an operator cancelled it, or it finished) no longer stands
      // for anyone. Merging a new request into it would publish nothing, and the bus would never
      // hear about the passenger.
      if (await caseIsOver(request.caseId)) continue;
      return request;
    }
  }
  return undefined;
}

export async function caseIsOver(caseId: string | undefined): Promise<boolean> {
  if (!caseId) return false;
  const item = await (await getOperationsData()).cases.get(caseId);
  return item !== undefined && TERMINAL_CASE_STATES.includes(item.state);
}

export async function getRequest(
  requestId: string,
): Promise<PassengerAssistanceRequest | undefined> {
  return await (await getOperationsData()).requests.get(requestId);
}

/** Requests in the order they were created, at most `limit`. */
export async function getAllRequests(
  limit = REQUEST_LIST_LIMIT,
): Promise<PassengerAssistanceRequest[]> {
  return await (await getOperationsData()).requests.list(limit);
}

/** One bus's requests in one status, oldest first, found through the (bus, status) index. */
export async function getRequestsForBusWithStatus(
  busId: string,
  status: AssistanceRequestStatus,
  limit = BUS_REQUEST_LIMIT,
): Promise<PassengerAssistanceRequest[]> {
  return (await getOperationsData()).requests.find(
    "busStatus",
    `${busId}:${status}`,
    limit,
  );
}

/** Some requests for one bus (the oldest, up to `limit`): only for reading a field they all share. */
export async function getRequestsForBus(
  busId: string,
  limit = BUS_REQUEST_LIMIT,
): Promise<PassengerAssistanceRequest[]> {
  return await (await getOperationsData()).requests.find("busId", busId, limit);
}

export async function countRequests(): Promise<number> {
  return await (await getOperationsData()).requests.count();
}

export async function getAnnouncementEvents(): Promise<
  ExternalAnnouncementMessage[]
> {
  return await (
    await getOperationsData()
  ).announcements.list(ANNOUNCEMENT_LIST_LIMIT);
}

/**
 * Who made a request status change. Only a signed bus may be recorded as "VEHICLE"; the
 * auto-acknowledge timer and the simulator route are recorded under their own names, so the
 * audit log can show whether a "Confirmed by bus" came from a bus.
 */
export type StatusActor = "VEHICLE" | "AUTO_ACK" | "SIMULATOR";

async function updateRequestStatus(
  requestId: string,
  newStatus: AssistanceRequestStatus,
  actor: StatusActor,
): Promise<PassengerAssistanceRequest | null> {
  return await withLock(
    `request:${requestId}`,
    async () => await updateRequestStatusUnlocked(requestId, newStatus, actor),
  );
}

async function updateRequestStatusUnlocked(
  requestId: string,
  newStatus: AssistanceRequestStatus,
  actor: StatusActor,
): Promise<PassengerAssistanceRequest | null> {
  const request = await getRequest(requestId);
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
      requestId,
    );
    return request;
  }

  const oldStatus = request.status;
  request.status = newStatus;

  const now = new Date().toISOString();
  if (newStatus === AssistanceRequestStatus.ACKNOWLEDGED) {
    request.acknowledgedAt = now;
    logger.info("Assistance request acknowledged", requestId);
    getAuditLog().append({
      eventId: `EVENT-${crypto.randomUUID()}`,
      eventType: "REQUEST_ACKNOWLEDGED",
      caseId: request.caseId,
      busId: request.busId,
      actor,
      timestamp: now,
      detail: { requestId },
    });
  }
  if (newStatus === AssistanceRequestStatus.CANCELLED) {
    request.cancelledAt = now;
    logger.info("Assistance request cancelled", requestId);
  }
  if (newStatus === AssistanceRequestStatus.FAILED) {
    request.failedAt = now;
    logger.info("Assistance request failed", requestId);
  }

  await saveRequest(request);
  if (
    request.caseId &&
    (newStatus === AssistanceRequestStatus.CANCELLED ||
      newStatus === AssistanceRequestStatus.FAILED)
  ) {
    await synchronizeLegacyCaseStatus(request.caseId, newStatus);
  }
  logger.info(
    `Request status transition: ${oldStatus} -> ${newStatus}`,
    requestId,
  );
  emit(requestStatusMessage(request));
  return request;
}

/**
 * Marks the requests of a cancelled case CANCELLED, so none of them still reads as live. It does not go
 * through updateRequestStatus: that would ask the case to cancel itself again, and the case is already over
 * (and holds its lock while this runs).
 */
async function closeRequestsOfCancelledCase(
  requestIds: string[],
): Promise<void> {
  for (const requestId of new Set(requestIds)) {
    await withLock(`request:${requestId}`, async () => {
      const request = await getRequest(requestId);
      if (
        !request ||
        request.status === AssistanceRequestStatus.CANCELLED ||
        !canTransitionAssistanceRequestStatus(
          request.status,
          AssistanceRequestStatus.CANCELLED,
        )
      ) {
        return;
      }
      request.status = AssistanceRequestStatus.CANCELLED;
      request.cancelledAt = new Date().toISOString();
      await saveRequest(request);
      logger.info(
        "Assistance request closed with its cancelled case",
        requestId,
      );
      emit(requestStatusMessage(request));
    });
  }
}
setRequestCloser(closeRequestsOfCancelledCase);

export async function processSimulatorCommand(
  command: SimulatorCommand,
  actor: StatusActor = "SIMULATOR",
): Promise<{
  success: boolean;
  message: string;
  request?: PassengerAssistanceRequest;
}> {
  const commandToStatus: Record<
    SimulatorCommand["command"],
    AssistanceRequestStatus
  > = {
    ACKNOWLEDGE: AssistanceRequestStatus.ACKNOWLEDGED,
    FAIL: AssistanceRequestStatus.FAILED,
    CANCEL: AssistanceRequestStatus.CANCELLED,
  };

  const currentRequest = await getRequest(command.requestId);
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

  if (
    !canTransitionAssistanceRequestStatus(currentRequest.status, nextStatus)
  ) {
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

  const request = await updateRequestStatus(
    command.requestId,
    nextStatus,
    actor,
  );

  return {
    success: true,
    message: `Request status updated to ${request?.status ?? currentRequest.status}`,
    request: request ?? currentRequest,
  };
}

export async function cancelRequest(requestId: string) {
  return await processSimulatorCommand({ requestId, command: "CANCEL" });
}

type VehicleCommandResult = {
  success: boolean;
  message: string;
  vehicleEvent: VehicleStatusUpdateMessage;
  announcement?: ExternalAnnouncementMessage;
};

export async function processVehicleCommand(
  command: VehicleSimulatorCommand,
): Promise<VehicleCommandResult> {
  return await withLock(
    `vehicle-status:${command.busId}`,
    async () => await processVehicleCommandUnlocked(command),
  );
}

async function busServiceOfRequests(
  busId: string,
): Promise<string | undefined> {
  return (await getRequestsForBus(busId, 1))[0]?.busService;
}

async function processVehicleCommandUnlocked(
  command: VehicleSimulatorCommand,
): Promise<VehicleCommandResult> {
  const data = await getOperationsData();
  const previousStatus = (await data.vehicleStatuses.get(command.busId))
    ?.status;
  if (previousStatus === command.status) {
    return {
      success: true,
      message: `Vehicle ${command.busId} is already ${previousStatus}`,
      vehicleEvent: {
        type: "VEHICLE_STATUS",
        busId: command.busId,
        busService:
          command.busService ??
          (await busServiceOfRequests(command.busId)) ??
          "UNKNOWN",
        status: previousStatus,
        stopCode: command.stopCode,
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
          command.busService ??
          (await busServiceOfRequests(command.busId)) ??
          "UNKNOWN",
        status: previousStatus,
        stopCode: command.stopCode,
        timestamp: new Date().toISOString(),
        message: `Vehicle status remains ${previousStatus}`,
      },
    };
  }

  await data.vehicleStatuses.put({
    busId: command.busId,
    status: command.status,
  });

  const busService =
    command.busService ??
    (await busServiceOfRequests(command.busId)) ??
    "UNKNOWN";

  const vehicleEvent: VehicleStatusUpdateMessage = {
    type: "VEHICLE_STATUS",
    busId: command.busId,
    busService,
    stopCode: command.stopCode,
    status: command.status,
    timestamp: new Date().toISOString(),
    message: `Vehicle status: ${command.status}`,
  };

  logger.info(`Vehicle status: ${command.status}`, command.busId, {
    busService,
  });
  emit(vehicleEvent);

  const announcement =
    command.status === VehicleStatus.APPROACHING
      ? await triggerAudioIdentificationIfNeeded(command.busId)
      : undefined;

  return {
    success: true,
    message: `Vehicle ${command.busId} status updated to ${command.status}`,
    vehicleEvent,
    announcement,
  };
}

async function triggerAudioIdentificationIfNeeded(
  busId: string,
): Promise<ExternalAnnouncementMessage | undefined> {
  const request = (
    await getRequestsForBusWithStatus(
      busId,
      AssistanceRequestStatus.ACKNOWLEDGED,
    )
  ).find((candidate) =>
    candidate.assistanceTypes.includes("BUS_AUDIO_IDENTIFICATION"),
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

  await (await getOperationsData()).announcements.put(event);
  logger.info("External announcement triggered", request.requestId, {
    busService: request.busService,
    busId: request.busId,
  });
  emit(event);
  return event;
}

export async function clearAllRequests(): Promise<void> {
  const data = await getOperationsData();
  await data.requests.clear();
  await data.vehicleStatuses.clear();
  await data.announcements.clear();
}
