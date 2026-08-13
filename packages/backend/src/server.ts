/**
 * Main Express Server
 * 
 * Starts:
 * - HTTP server on PORT (default 3000)
 * - WebSocket server on WS_PORT (default 3001)
 * - REST API routes
 * - Health check endpoint
 */

import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { router as assistanceRouter } from "./routes/assistance";
import { router as locationRouter } from "./routes/location";
import {
  initializeWebSocketServer,
  setupStateChangeListener,
  getConnectedClientCount,
} from "./services/websocket";
import { logger } from "./services/logger";
import { getAllRequests, clearAllRequests } from "./services/aviator";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8081,http://localhost:3000").split(",");

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

// Routes
app.use("/api/assistance", assistanceRouter);
app.use("/api/location", locationRouter);

/**
 * Health Check Endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    connectedWebSocketClients: getConnectedClientCount(),
    activeRequests: getAllRequests().length,
  });
});

/**
 * Admin: Get all logs
 * (In production: Restrict to authorized users only)
 */
app.get("/admin/logs", (req, res) => {
  res.json({
    logs: logger.getLogs(),
  });
});

/**
 * Admin: Clear all requests
 * (In production: Restrict to authorized users only)
 */
app.post("/admin/reset", (req, res) => {
  clearAllRequests();
  res.json({
    message: "All requests cleared",
  });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
  });
});

/**
 * Error Handler
 */
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled error", undefined, {
    message: error.message,
    stack: error.stack,
  });

  res.status(500).json({
    error: "Internal server error",
    message: NODE_ENV === "development" ? error.message : undefined,
  });
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
