import WebSocket from "ws";
import http from "http";
import { StatusUpdateMessage } from "@buspass/shared";
import { logger } from "./logger";
import {
  DEVICE_SUBSCRIBE_BODY,
  deviceSecretFor,
  safeEqual,
  verifyDeviceSignature,
} from "../routes/auth";
import { getRequest, onAssistanceEvent } from "./aviator";
import { getCase, onOperationsEvent } from "./assistanceCaseService";
import { listStopVehiclePresence } from "./stopVehiclePresenceService";
import { ALL_TOPICS, type Unsubscribe } from "../events/eventBus";
import { getEventHub, publishEvent } from "../events/eventHub";
import { topic } from "../events/topics";
import type { BusEvent } from "../events/types";

/** Most buses or stops one operator socket may name in its scope. */
const MAX_OPERATOR_SCOPE_ENTRIES = 200;

interface WebSocketClient {
  ws: WebSocket;
  requestId?: string;
  busId?: string;
  caseId?: string;
  stopCode?: string;
  /** Live topic subscriptions, keyed by slot so a re-subscribe replaces the old one. */
  subscriptions: Map<string, Unsubscribe>;
  deliver: (message: BusEvent) => void;
}

const clients: Set<WebSocketClient> = new Set();

/** The largest message a client may send, and how many sockets one address may hold open. */
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_CONNECTIONS_PER_ADDRESS = 100;
/** Ids in subscribe messages are short; anything longer is refused rather than stored. */
const MAX_ID_LENGTH = 80;

const isId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH;
let stateChangeListenerReady = false;

// One JSON string per message, shared by every client that receives it.
const serialized = new WeakMap<object, string>();

function serialize(message: BusEvent): string {
  let json = serialized.get(message);
  if (json === undefined) {
    json = JSON.stringify(message);
    serialized.set(message, json);
  }
  return json;
}

function setSubscription(
  client: WebSocketClient,
  slot: string,
  subscribeTo?: string,
): void {
  client.subscriptions.get(slot)?.();
  client.subscriptions.delete(slot);
  if (subscribeTo !== undefined) {
    client.subscriptions.set(
      slot,
      getEventHub().subscribe(subscribeTo, client.deliver),
    );
  }
}

function clearSubscriptions(client: WebSocketClient, slotPrefix = ""): void {
  for (const [slot, unsubscribe] of [...client.subscriptions]) {
    if (!slot.startsWith(slotPrefix)) continue;
    unsubscribe();
    client.subscriptions.delete(slot);
  }
}

type OperatorScope =
  { valid: true; buses: string[]; stops: string[] } | { valid: false };

function idList(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_OPERATOR_SCOPE_ENTRIES
  )
    return null;
  const ids = value.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry.length <= 80,
  );
  return ids.length === value.length ? ids : null;
}

function parseOperatorScope(message: Record<string, unknown>): OperatorScope {
  const buses = idList(message.buses);
  const stops = idList(message.stops);
  if (buses === null || stops === null) return { valid: false };
  return { valid: true, buses: buses ?? [], stops: stops ?? [] };
}

export function initializeWebSocketServer(
  httpServer: http.Server,
  port: number,
) {
  // Messages here are small commands; refuse anything larger than a few KB (ws defaults to 100 MiB).
  const wss = new WebSocket.Server({
    server: httpServer,
    maxPayload: MAX_MESSAGE_BYTES,
  });
  const perAddress = new Map<string, number>();

  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const address = req.socket.remoteAddress ?? "unknown";
    const open = perAddress.get(address) ?? 0;
    if (open >= MAX_CONNECTIONS_PER_ADDRESS) {
      ws.close(1013, "Too many connections from this address");
      return;
    }
    perAddress.set(address, open + 1);
    ws.on("close", () => {
      const left = (perAddress.get(address) ?? 1) - 1;
      if (left <= 0) perAddress.delete(address);
      else perAddress.set(address, left);
    });
    const client: WebSocketClient = {
      ws,
      subscriptions: new Map(),
      deliver: (message) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(serialize(message));
      },
    };
    clients.add(client);
    logger.info("WebSocket client connected");

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBE") {
          if (!isId(message.requestId)) {
            ws.send(JSON.stringify({ type: "INVALID_SUBSCRIPTION" }));
            return;
          }
          client.requestId = message.requestId;
          // Listen first, then read the current status: a change made between the two is
          // delivered instead of lost.
          setSubscription(client, "request", topic.request(message.requestId));
          const request = await getRequest(message.requestId);
          if (ws.readyState !== WebSocket.OPEN) return;
          client.busId = request?.busId;
          setSubscription(
            client,
            "bus",
            client.busId ? topic.bus(client.busId) : undefined,
          );

          ws.send(
            JSON.stringify({
              type: "SUBSCRIBED",
              requestId: message.requestId,
              busId: client.busId,
            }),
          );

          if (request) {
            ws.send(
              JSON.stringify({
                type: "REQUEST_STATUS",
                requestId: request.requestId,
                status: request.status,
                timestamp: new Date().toISOString(),
                assistanceTypes: request.assistanceTypes,
                source: request.source,
                busId: request.busId,
                busService: request.busService,
                message: `Current request status: ${request.status}`,
              }),
            );
          }
        }
        if (message.type === "SUBSCRIBE_CASE") {
          if (!isId(message.caseId)) {
            ws.send(JSON.stringify({ type: "INVALID_SUBSCRIPTION" }));
            return;
          }
          client.caseId = message.caseId;
          // Only what the server knows about the case decides which bus is followed; a client
          // cannot name any bus it likes.
          client.busId = undefined;
          setSubscription(client, "case", topic.case(message.caseId));
          ws.send(
            JSON.stringify({ type: "SUBSCRIBED_CASE", caseId: client.caseId }),
          );
          const caseRecord = await getCase(message.caseId);
          if (ws.readyState !== WebSocket.OPEN) return;
          if (caseRecord) {
            client.busId = caseRecord.busId;
            ws.send(
              JSON.stringify({
                type: "CASE_STATUS",
                caseId: caseRecord.caseId,
                busId: caseRecord.busId,
                stopCode: caseRecord.stopCode,
                state: caseRecord.state,
                passengerCount: caseRecord.passengerCount,
                assistanceTypes: caseRecord.assistanceTypes,
                escalationReason: caseRecord.escalationReason,
                timestamp: new Date().toISOString(),
              }),
            );
          }
          setSubscription(
            client,
            "bus",
            typeof client.busId === "string" && client.busId
              ? topic.bus(client.busId)
              : undefined,
          );
        }
        if (message.type === "SUBSCRIBE_STOP") {
          const stopCode =
            typeof message.stopCode === "string"
              ? message.stopCode.trim().slice(0, 40)
              : "";
          if (!stopCode) {
            ws.send(JSON.stringify({ type: "INVALID_STOP_SUBSCRIPTION" }));
          } else {
            client.stopCode = stopCode;
            setSubscription(client, "stop", topic.stop(stopCode));
            ws.send(JSON.stringify({ type: "SUBSCRIBED_STOP", stopCode }));
            const present = await listStopVehiclePresence(stopCode);
            if (ws.readyState !== WebSocket.OPEN) return;
            present.forEach((vehicle) => {
              ws.send(
                JSON.stringify({
                  type: "STOP_VEHICLE_PRESENCE",
                  stopCode,
                  vehicle,
                  timestamp: new Date().toISOString(),
                }),
              );
            });
          }
        }
        if (message.type === "SUBSCRIBE_DEVICE") {
          // A bus subscribes to its own bus only, proving who it is with the device secret
          // instead of holding the operator token.
          const busId = message.busId;
          const valid =
            typeof busId === "string" && busId.length > 0 && busId.length <= 64;
          const secret = valid ? deviceSecretFor(busId) : undefined;
          if (!valid) {
            ws.send(JSON.stringify({ type: "INVALID_DEVICE_SUBSCRIPTION" }));
          } else if (
            secret &&
            !(
              message.deviceId === busId &&
              verifyDeviceSignature({
                secret,
                deviceId: String(message.deviceId),
                timestamp: String(message.timestamp ?? ""),
                signature: String(message.signature ?? ""),
                body: DEVICE_SUBSCRIBE_BODY,
              })
            )
          ) {
            ws.send(JSON.stringify({ type: "AUTH_REQUIRED" }));
          } else {
            clearSubscriptions(client, "ops:");
            setSubscription(
              client,
              `ops:${topic.operatorBus(busId)}`,
              topic.operatorBus(busId),
            );
            ws.send(JSON.stringify({ type: "SUBSCRIBED_DEVICE", busId }));
          }
        }
        if (message.type === "SUBSCRIBE_OPERATIONS") {
          const expectedToken = process.env.OPERATOR_API_TOKEN;
          if (
            expectedToken &&
            !safeEqual(String(message.token ?? ""), expectedToken)
          ) {
            ws.send(JSON.stringify({ type: "AUTH_REQUIRED" }));
          } else {
            const scope = parseOperatorScope(message);
            if (!scope.valid) {
              ws.send(
                JSON.stringify({
                  type: "INVALID_OPERATIONS_SCOPE",
                  maxEntries: MAX_OPERATOR_SCOPE_ENTRIES,
                }),
              );
            } else {
              clearSubscriptions(client, "ops:");
              const scoped = scope.buses.length > 0 || scope.stops.length > 0;
              if (!scoped) {
                setSubscription(client, `ops:${ALL_TOPICS}`, ALL_TOPICS);
              } else {
                for (const busId of scope.buses)
                  setSubscription(
                    client,
                    `ops:${topic.operatorBus(busId)}`,
                    topic.operatorBus(busId),
                  );
                for (const stopCode of scope.stops)
                  setSubscription(
                    client,
                    `ops:${topic.operatorStop(stopCode)}`,
                    topic.operatorStop(stopCode),
                  );
              }
              ws.send(
                JSON.stringify({ type: "SUBSCRIBED_OPERATIONS", scoped }),
              );
            }
          }
        }
      } catch (error) {
        logger.error("Error processing WebSocket message", undefined, {
          error: String(error),
        });
      }
    });

    ws.on("close", () => {
      clearSubscriptions(client);
      clients.delete(client);
      logger.info("WebSocket client disconnected");
    });

    ws.on("error", (error: Error) => {
      logger.error("WebSocket error", undefined, {
        error: error.message,
      });
    });
  });

  logger.info(`WebSocket server listening on shared HTTP port ${port}`);
}

export function setupStateChangeListener() {
  if (stateChangeListenerReady) {
    return;
  }
  stateChangeListenerReady = true;

  onAssistanceEvent((message) => {
    broadcastStatusUpdate(message);
  });
  onOperationsEvent((message) => {
    broadcastStatusUpdate(message);
  });
}

/** Kept for existing callers; routing now happens through the event hub. */
export function broadcastStatusUpdate(message: StatusUpdateMessage) {
  publishEvent(message);
}

export function getConnectedClientCount(): number {
  return clients.size;
}
