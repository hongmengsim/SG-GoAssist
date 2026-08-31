import WebSocket from "ws";
import http from "http";
import { StatusUpdateMessage } from "@buspass/shared";
import { logger } from "./logger";
import { getRequest, onAssistanceEvent } from "./aviator";
import { getCase, onOperationsEvent } from "./assistanceCaseService";

interface WebSocketClient {
  ws: WebSocket;
  requestId?: string;
  busId?: string;
  caseId?: string;
  operations?: boolean;
}

const clients: Set<WebSocketClient> = new Set();
let stateChangeListenerReady = false;

export function initializeWebSocketServer(httpServer: http.Server, port: number) {
  const wss = new WebSocket.Server({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    const client: WebSocketClient = { ws };
    clients.add(client);
    logger.info("WebSocket client connected");

    ws.on("message", (data: string) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBE") {
          client.requestId = message.requestId;
          const request = getRequest(message.requestId);
          client.busId = request?.busId;

          ws.send(
            JSON.stringify({
              type: "SUBSCRIBED",
              requestId: message.requestId,
              busId: client.busId,
            })
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
              })
            );
          }
        }
        if (message.type === "SUBSCRIBE_CASE") {
          client.caseId = message.caseId;
          client.busId = message.busId;
          ws.send(JSON.stringify({ type: "SUBSCRIBED_CASE", caseId: client.caseId }));
          const caseRecord = getCase(message.caseId);
          if (caseRecord) {
            client.busId = caseRecord.busId ?? client.busId;
            ws.send(JSON.stringify({
              type: "CASE_STATUS",
              caseId: caseRecord.caseId,
              busId: caseRecord.busId,
              stopCode: caseRecord.stopCode,
              state: caseRecord.state,
              passengerCount: caseRecord.passengerCount,
              assistanceTypes: caseRecord.assistanceTypes,
              escalationReason: caseRecord.escalationReason,
              timestamp: new Date().toISOString(),
            }));
          }
        }
        if (message.type === "SUBSCRIBE_OPERATIONS") {
          const expectedToken = process.env.OPERATOR_API_TOKEN;
          if (expectedToken && message.token !== expectedToken) {
            ws.send(JSON.stringify({ type: "AUTH_REQUIRED" }));
          } else {
            client.operations = true;
            ws.send(JSON.stringify({ type: "SUBSCRIBED_OPERATIONS" }));
          }
        }
      } catch (error) {
        logger.error("Error processing WebSocket message", undefined, {
          error: String(error),
        });
      }
    });

    ws.on("close", () => {
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

export function broadcastStatusUpdate(message: StatusUpdateMessage) {
  clients.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const shouldSend =
      client.operations === true ||
      ("caseId" in message && message.caseId === client.caseId) ||
      ("requestId" in message && message.requestId === client.requestId) ||
      ("busId" in message && message.busId === client.busId);

    if (shouldSend) {
      client.ws.send(JSON.stringify(message));
    }
  });
}

export function getConnectedClientCount(): number {
  return clients.size;
}
