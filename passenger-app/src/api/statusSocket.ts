import type { StatusUpdateMessage, StopVehiclePresence } from "@buspass/shared";
import { WS_BASE_URL } from "../config";

type StatusSocketOptions = {
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onConnected?: () => void;
  caseId?: string;
};

const requestStatuses = new Set([
  "SENDING",
  "ACKNOWLEDGED",
  "CANCELLED",
  "FAILED",
]);
const vehicleStatuses = new Set(["APPROACHING", "ARRIVED", "DEPARTED"]);
const autonomousDriveStates = new Set([
  "IDLE",
  "ROUTE_ASSIGNED",
  "EN_ROUTE",
  "APPROACHING_STOP",
  "PRECISION_STOPPING",
  "STOPPED_SECURE",
  "DOORS_OPEN",
  "READY_TO_DEPART",
  "DEPARTING",
  "MANUAL_OVERRIDE",
  "EMERGENCY_STOP",
  "BLOCKED",
]);
const assistanceCaseStates = new Set([
  "REQUESTED",
  "VALIDATED",
  "VEHICLE_ASSIGNED",
  "SAFE_TO_ACTUATE",
  "ACTUATING",
  "READY",
  "COMPLETED",
  "NEEDS_CONFIRMATION",
  "ESCALATED",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
]);
const rampPositions = new Set([
  "STOWED",
  "DEPLOYING",
  "DEPLOYED",
  "RETRACTING",
  "FAULT",
  "UNKNOWN",
]);
const actuatorStates = new Set([
  "ISSUED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "BLOCKED",
  "FAILED",
]);

function parseStatusUpdate(
  value: unknown,
  requestId: string,
  expectedBusId?: string,
  caseId?: string,
): StatusUpdateMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as Record<string, unknown>;
  if (
    typeof message.type !== "string" ||
    typeof message.timestamp !== "string"
  ) {
    return null;
  }

  if (message.type === "REQUEST_STATUS") {
    if (
      message.requestId !== requestId ||
      typeof message.busId !== "string" ||
      typeof message.busService !== "string" ||
      typeof message.status !== "string" ||
      !requestStatuses.has(message.status)
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "VEHICLE_STATUS") {
    if (
      !expectedBusId ||
      message.busId !== expectedBusId ||
      typeof message.busService !== "string" ||
      typeof message.status !== "string" ||
      !vehicleStatuses.has(message.status)
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "EXTERNAL_ANNOUNCEMENT") {
    if (
      message.requestId !== requestId ||
      typeof message.busId !== "string" ||
      typeof message.busService !== "string" ||
      message.assistanceType !== "BUS_AUDIO_IDENTIFICATION" ||
      typeof message.announcement !== "string"
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "CASE_STATUS") {
    if (
      !caseId ||
      message.caseId !== caseId ||
      typeof message.state !== "string" ||
      !assistanceCaseStates.has(message.state) ||
      typeof message.stopCode !== "string"
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "AUTONOMY_STATUS") {
    const autonomy = message.autonomy as Record<string, unknown> | undefined;
    if (
      !expectedBusId ||
      message.busId !== expectedBusId ||
      typeof message.busService !== "string" ||
      !autonomy ||
      autonomy.busId !== expectedBusId ||
      typeof autonomy.state !== "string" ||
      !autonomousDriveStates.has(autonomy.state)
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "SAFETY_TELEMETRY") {
    const telemetry = message.telemetry as Record<string, unknown> | undefined;
    if (
      !expectedBusId ||
      message.busId !== expectedBusId ||
      typeof message.fresh !== "boolean" ||
      !telemetry ||
      telemetry.busId !== expectedBusId ||
      typeof telemetry.vehicleStopped !== "boolean" ||
      typeof telemetry.parkingBrakeActive !== "boolean" ||
      typeof telemetry.doorOpen !== "boolean" ||
      typeof telemetry.deploymentPathClear !== "boolean" ||
      typeof telemetry.rampPosition !== "string" ||
      !rampPositions.has(telemetry.rampPosition) ||
      typeof telemetry.observedAt !== "string"
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "ACTUATOR_STATUS") {
    const status = message.status as Record<string, unknown> | undefined;
    if (
      !caseId ||
      message.caseId !== caseId ||
      typeof message.busId !== "string" ||
      !status ||
      typeof status.state !== "string" ||
      !actuatorStates.has(status.state)
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  if (message.type === "OPERATOR_ESCALATION") {
    if (
      !caseId ||
      message.caseId !== caseId ||
      typeof message.stopCode !== "string" ||
      typeof message.reason !== "string"
    ) {
      return null;
    }
    return message as unknown as StatusUpdateMessage;
  }

  return null;
}

export function subscribeToRequestStatus(
  requestId: string,
  onUpdate: (message: StatusUpdateMessage) => void,
  onError: () => void,
  options: StatusSocketOptions = {},
) {
  const initialReconnectDelayMs = options.initialReconnectDelayMs ?? 750;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10_000;
  let activeSocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let outageReported = false;
  let subscribedBusId: string | undefined;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) {
      return;
    }

    const delay = Math.min(
      initialReconnectDelayMs * 2 ** reconnectAttempt,
      maxReconnectDelayMs,
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const reportOutage = () => {
    if (stopped || outageReported) {
      return;
    }
    outageReported = true;
    onError();
  };

  function connect() {
    if (stopped) {
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_BASE_URL);
    } catch {
      reportOutage();
      scheduleReconnect();
      return;
    }
    activeSocket = socket;

    socket.onopen = () => {
      if (stopped || socket !== activeSocket) {
        return;
      }
      reconnectAttempt = 0;
      outageReported = false;
      options.onConnected?.();
      socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          requestId,
        }),
      );
      if (options.caseId) {
        socket.send(
          JSON.stringify({
            type: "SUBSCRIBE_CASE",
            caseId: options.caseId,
          }),
        );
      }
    };

    socket.onmessage = (event) => {
      if (stopped || socket !== activeSocket) {
        return;
      }

      try {
        const message = parseStatusUpdate(
          JSON.parse(String(event.data)),
          requestId,
          subscribedBusId,
          options.caseId,
        );
        if (message) {
          if (message.type === "REQUEST_STATUS") {
            subscribedBusId = message.busId;
          }
          onUpdate(message);
        }
      } catch {
        // Ignore malformed server frames and keep the live subscription running.
      }
    };

    socket.onerror = reportOutage;
    socket.onclose = () => {
      if (socket === activeSocket) {
        activeSocket = null;
      }
      if (!stopped) {
        reportOutage();
        scheduleReconnect();
      }
    };
  }

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const socket = activeSocket;
    activeSocket = null;
    socket?.close();
  };
}

export function subscribeToStopVehiclePresence(
  stopCode: string,
  onUpdate: (vehicle: StopVehiclePresence) => void,
  onError: () => void,
  options: Pick<
    StatusSocketOptions,
    "initialReconnectDelayMs" | "maxReconnectDelayMs" | "onConnected"
  > = {},
) {
  const initialReconnectDelayMs = options.initialReconnectDelayMs ?? 750;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10_000;
  let activeSocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let outageReported = false;

  const reportOutage = () => {
    if (stopped || outageReported) return;
    outageReported = true;
    onError();
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(
      initialReconnectDelayMs * 2 ** reconnectAttempt,
      maxReconnectDelayMs,
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  function connect() {
    if (stopped) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_BASE_URL);
    } catch {
      reportOutage();
      scheduleReconnect();
      return;
    }
    activeSocket = socket;
    socket.onopen = () => {
      if (stopped || socket !== activeSocket) return;
      reconnectAttempt = 0;
      outageReported = false;
      options.onConnected?.();
      socket.send(JSON.stringify({ type: "SUBSCRIBE_STOP", stopCode }));
    };
    socket.onmessage = (event) => {
      if (stopped || socket !== activeSocket) return;
      try {
        const message = JSON.parse(String(event.data)) as Record<
          string,
          unknown
        >;
        const vehicle = message.vehicle as Record<string, unknown> | undefined;
        if (
          message.type !== "STOP_VEHICLE_PRESENCE" ||
          message.stopCode !== stopCode ||
          typeof message.timestamp !== "string" ||
          !vehicle ||
          typeof vehicle.busId !== "string" ||
          typeof vehicle.busService !== "string" ||
          vehicle.stopCode !== stopCode ||
          !["APPROACHING", "PARKED", "DEPARTED"].includes(
            String(vehicle.state),
          ) ||
          typeof vehicle.wheelchairAccessible !== "boolean" ||
          typeof vehicle.observedAt !== "string" ||
          typeof vehicle.fresh !== "boolean"
        ) {
          return;
        }
        onUpdate(vehicle as unknown as StopVehiclePresence);
      } catch {
        // Ignore malformed frames and keep the stop subscription alive.
      }
    };
    socket.onerror = reportOutage;
    socket.onclose = () => {
      if (socket === activeSocket) activeSocket = null;
      if (!stopped) {
        reportOutage();
        scheduleReconnect();
      }
    };
  }

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const socket = activeSocket;
    activeSocket = null;
    socket?.close();
  };
}
