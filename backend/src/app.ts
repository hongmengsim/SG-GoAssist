import express from "express";
import cors from "cors";
import { router as assistanceRouter } from "./routes/assistance";
import { router as locationRouter } from "./routes/location";
import { router as busStopsRouter } from "./routes/busStops";
import { router as operationsRouter } from "./routes/operations";
import { router as busOperationsRouter } from "./routes/busOperations";
import { clearBusOperationsData } from "./busOperations/composition";
import { router as assistantDiagnosticsRouter } from "./routes/assistantDiagnostics";
import { router as passengerRouter } from "./routes/passenger";
import { router as journeysRouter } from "./routes/journeys";
import { getConnectedClientCount } from "./services/websocket";
import { logger } from "./services/logger";
import { clearAllRequests, getAllRequests } from "./services/aviator";
import { clearOperations, listCases } from "./services/assistanceCaseService";

export function createApp() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const ALLOWED_ORIGINS = (
    process.env.ALLOWED_ORIGINS || "http://localhost:8081,http://localhost:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const app = express();

  app.use(
    express.json({
      verify(req, _res, buffer) {
        // Device signatures cover the exact bytes sent over the wire. Keeping the
        // original body prevents JSON parsing/serialization from changing values
        // such as 1.00 before HMAC verification.
        (req as express.Request & { rawBody?: Buffer }).rawBody =
          Buffer.from(buffer);
      },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(
          null,
          !origin ||
            ALLOWED_ORIGINS.includes(origin) ||
            (NODE_ENV !== "production" && isLoopbackDevelopmentOrigin(origin)),
        );
      },
      credentials: true,
    }),
  );

  app.use("/api/assistance", assistanceRouter);
  app.use("/api/location", locationRouter);
  app.use("/api/bus-stops", busStopsRouter);
  app.use("/api/operations", busOperationsRouter);
  app.use("/api/operations", operationsRouter);
  app.use("/api/assistant", assistantDiagnosticsRouter);
  app.use("/api/passenger", passengerRouter);
  app.use("/api/journeys", journeysRouter);

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      connectedWebSocketClients: getConnectedClientCount(),
      activeRequests: getAllRequests().length,
      activeAssistanceCases: listCases().filter(
        (item) => !["COMPLETED", "FAILED", "CANCELLED"].includes(item.state),
      ).length,
    });
  });

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    const token = process.env.OPERATOR_API_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.status(401).json({ error: "Operator authentication required" });
      return;
    }
    next();
  };

  app.get("/admin/logs", requireAdmin, (req, res) => {
    res.json({
      logs: logger.getLogs(),
    });
  });

  app.post("/admin/reset", requireAdmin, async (req, res, next) => {
    try {
      clearAllRequests();
      clearOperations();
      await clearBusOperationsData();
      res.json({
        message: "All requests cleared",
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: "Endpoint not found",
      path: req.path,
      method: req.method,
    });
  });

  app.use(
    (
      error: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // Client mistakes (for example malformed JSON, which the body parser reports with a
      // 4xx status) must not be reported as server failures.
      const clientStatus =
        Number.isInteger(error?.status) &&
        error.status >= 400 &&
        error.status < 500
          ? error.status
          : undefined;
      if (clientStatus !== undefined) {
        res.status(clientStatus).json({ error: "Invalid request" });
        return;
      }

      logger.error("Unhandled error", undefined, {
        message: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: "Internal server error",
        message: NODE_ENV === "development" ? error.message : undefined,
      });
    },
  );

  return app;
}

export function isLoopbackDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      Boolean(url.port)
    );
  } catch {
    return false;
  }
}
