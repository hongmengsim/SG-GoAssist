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
import { busStopRepository } from "./bus-stops/repository";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8081,http://localhost:3000").split(",");

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

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Backend server running on http://localhost:${PORT}`);
  logger.info(`WebSocket endpoint running on ws://localhost:${PORT}`);
  logger.info(`Health check: GET http://localhost:${PORT}/health`);
  logger.info(`Admin endpoints: /admin/logs, /admin/reset`);
  logger.info(`CORS enabled for: ${ALLOWED_ORIGINS.join(", ")}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
});
