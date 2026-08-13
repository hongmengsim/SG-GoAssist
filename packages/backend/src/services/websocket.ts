import WebSocket from "ws";
import http from "http";
import { StatusUpdateMessage } from "@buspass/shared";
import { logger } from "./logger";
import { getRequest, onAssistanceEvent } from "./aviator";

interface WebSocketClient {
  ws: WebSocket;
  requestId?: string;
  busId?: string;
}

const clients: Set<WebSocketClient> = new Set();

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
  onAssistanceEvent((message) => {
    broadcastStatusUpdate(message);
  });
}

export function broadcastStatusUpdate(message: StatusUpdateMessage) {
  clients.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const shouldSend =
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
