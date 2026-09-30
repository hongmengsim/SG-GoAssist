import WebSocket from "ws";
import http from "http";
import { StatusUpdateMessage } from "@buspass/shared";
import { logger } from "./logger";
import { DEVICE_SUBSCRIBE_BODY, verifyDeviceSignature } from "../routes/auth";
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
  const wss = new WebSocket.Server({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
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
          client.requestId = message.requestId;
          const request = getRequest(message.requestId);
          client.busId = request?.busId;
          setSubscription(
            client,
            "request",
            typeof message.requestId === "string"
              ? topic.request(message.requestId)
              : undefined,
          );
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
          client.caseId = message.caseId;
          client.busId = message.busId;
          ws.send(
            JSON.stringify({ type: "SUBSCRIBED_CASE", caseId: client.caseId }),
          );
          const caseRecord = await getCase(message.caseId);
          if (caseRecord) {
            client.busId = caseRecord.busId ?? client.busId;
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
            "case",
            typeof client.caseId === "string"
              ? topic.case(client.caseId)
              : undefined,
          );
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
            (await listStopVehiclePresence(stopCode)).forEach((vehicle) => {
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
          const secret = process.env.DEVICE_SHARED_SECRET;
          const valid =
            typeof busId === "string" && busId.length > 0 && busId.length <= 64;
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
          if (expectedToken && message.token !== expectedToken) {
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
