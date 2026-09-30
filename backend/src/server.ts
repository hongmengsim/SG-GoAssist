/**
 * Main Express Server
 *
 * Starts:
 * - HTTP server on PORT (default 3000)
 * - WebSocket server on WS_PORT (default 3001)
 * - REST API routes
 * - Health check endpoint
 */

import http from "http";
import dotenv from "dotenv";
import {
  initializeWebSocketServer,
  setupStateChangeListener,
} from "./services/websocket";
import { logger } from "./services/logger";
import { createApp } from "./app";
import { flushBusOperationsAudit } from "./busOperations/composition";
import { busStopRepository } from "./bus-stops/repository";
import { getOperationsData } from "./services/operationsData";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || "http://localhost:8081,http://localhost:3000"
).split(",");

const app = createApp();

logger.info("[BusStops] Regional dataset initialized", undefined, {
  available: busStopRepository.available,
  stopCount: busStopRepository.size,
  stopsWithServices: busStopRepository.metadata?.stopsWithServices ?? 0,
});

// Create HTTP server (for WebSocket support)
const httpServer = http.createServer(app);

// Initialize WebSocket server
initializeWebSocketServer(httpServer, parseInt(String(PORT), 10));

// Set up listener for request state changes
setupStateChangeListener();

// Start serving only once the operations data is ready (old data imported, retention applied).
getOperationsData()
  .then(() => {
    httpServer.listen(PORT, () => {
      logger.info(`Backend server running on http://localhost:${PORT}`);
      logger.info(`WebSocket endpoint running on ws://localhost:${PORT}`);
      logger.info(`Health check: GET http://localhost:${PORT}/health`);
      logger.info(`Admin endpoints: /admin/logs, /admin/reset`);
      logger.info(`CORS enabled for: ${ALLOWED_ORIGINS.join(", ")}`);
    });
  })
  .catch((error: unknown) => {
    logger.error("Could not open the operations data", undefined, {
      error: String(error),
    });
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  flushBusOperationsAudit();
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});

// Ctrl+C: write any audit events still waiting to be batched before exiting.
process.on("SIGINT", () => {
  flushBusOperationsAudit();
  process.exit(0);
});
