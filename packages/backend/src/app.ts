import express from "express";
import cors from "cors";
import { router as assistanceRouter } from "./routes/assistance";
import { router as locationRouter } from "./routes/location";
import { getConnectedClientCount } from "./services/websocket";
import { logger } from "./services/logger";
import { clearAllRequests, getAllRequests } from "./services/aviator";

export function createApp() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const ALLOWED_ORIGINS = (
    process.env.ALLOWED_ORIGINS || "http://localhost:8081,http://localhost:3000"
  ).split(",");

  const app = express();

  app.use(express.json());
  app.use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
    })
  );

  app.use("/api/assistance", assistanceRouter);
  app.use("/api/location", locationRouter);

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      connectedWebSocketClients: getConnectedClientCount(),
      activeRequests: getAllRequests().length,
    });
  });

  app.get("/admin/logs", (req, res) => {
    res.json({
      logs: logger.getLogs(),
    });
  });

  app.post("/admin/reset", (req, res) => {
    clearAllRequests();
    res.json({
      message: "All requests cleared",
    });
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
      next: express.NextFunction
    ) => {
      logger.error("Unhandled error", undefined, {
        message: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        error: "Internal server error",
        message: NODE_ENV === "development" ? error.message : undefined,
      });
    }
  );

  return app;
}
