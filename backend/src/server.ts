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
import {
  configureLock,
  getLock,
  lockFromEnvironment,
} from "./concurrency/locks";
import {
  closeOperationsData,
  getAuditLog,
  getOperationsData,
} from "./services/operationsData";
import { assertSecureStart } from "./startupGuard";
import { configureEventHub, eventBusFromEnvironment } from "./events/eventHub";

// Load environment variables
dotenv.config();

// A server that would be open to anyone by accident does not start (see startupGuard.ts).
try {
  const openProblems = assertSecureStart(process.env);
  for (const problem of openProblems)
    logger.warn(
      `Running open on purpose (GOASSIST_ALLOW_INSECURE): ${problem}`,
    );
} catch (error) {
  logger.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}

// A promise nobody handled is a bug worth knowing about, but it must not take the whole server
// (and every bus's connection) down with it.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", undefined, {
    error:
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason),
  });
});

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

// Choose how events are shared: in this process (default) or through Redis for several processes.
configureEventHub(eventBusFromEnvironment());

// Initialize WebSocket server
initializeWebSocketServer(httpServer, parseInt(String(PORT), 10));

// Set up listener for request state changes
setupStateChangeListener();

// Start serving only once the operations data is ready (old data imported, retention applied).
getOperationsData()
  .then((data) => {
    // Locks: in this process (default) or shared through the database for several processes.
    configureLock(lockFromEnvironment(process.env, data.leases));
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

// Graceful shutdown: stop taking connections, write what is still buffered (audit events),
// give back the lock leases this process holds so peers do not wait for them to expire, and
// close the storage. A second signal, or ten seconds, ends it.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received: shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  try {
    await new Promise<void>((done) => {
      httpServer.close(() => done());
      httpServer.closeAllConnections?.();
    });
    flushBusOperationsAudit();
    await getAuditLog().flush?.();
    await getLock().close?.();
    closeOperationsData();
  } catch (error) {
    logger.error("Error during shutdown", undefined, { error: String(error) });
  }
  logger.info("Shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
