import type { StatusUpdateMessage } from "@buspass/shared";
import { WS_BASE_URL } from "../config";

type StatusSocketOptions = {
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  onConnected?: () => void;
};

const requestStatuses = new Set([
  "SENDING",
  "ACKNOWLEDGED",
  "CANCELLED",
  "FAILED",
]);
const vehicleStatuses = new Set(["APPROACHING", "ARRIVED", "DEPARTED"]);

function parseStatusUpdate(
  value: unknown,
  requestId: string,
  expectedBusId?: string,
): StatusUpdateMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as Record<string, unknown>;
  if (
    typeof message.type !== "string" ||
    typeof message.busId !== "string" ||
    typeof message.busService !== "string" ||
    typeof message.timestamp !== "string"
  ) {
    return null;
  }

  if (message.type === "REQUEST_STATUS") {
    if (
      message.requestId !== requestId ||
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
      message.assistanceType !== "BUS_AUDIO_IDENTIFICATION" ||
      typeof message.announcement !== "string"
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
  options: StatusSocketOptions = {}
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
      maxReconnectDelayMs
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
        })
      );
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
