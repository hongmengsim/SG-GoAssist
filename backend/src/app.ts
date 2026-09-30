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
import { clearAllRequests, countRequests } from "./services/aviator";
import { clearOperations } from "./services/assistanceCaseService";
import { getEventHub } from "./events/eventHub";
import { getOperationsData } from "./services/operationsData";
import { getBusOperations } from "./busOperations/composition";
import { Metrics } from "./platform/metrics";
import {
  DEFAULT_LIMITS,
  RateLimiter,
  classifyRequest,
  type LimitConfig,
} from "./platform/rateLimit";
import { parseRoles } from "./platform/roles";

export interface AppOptions {
  /** Which workloads this process serves (default: GOASSIST_ROLES, else all). */
  roles?: string;
  /** Limits per request class, or false to switch rate limiting off. */
  rateLimit?: LimitConfig | false;
}

/** Off in tests unless asked for, so rapid test traffic is never throttled by accident. */
function defaultRateLimit(): LimitConfig | false {
  if (process.env.GOASSIST_RATE_LIMIT === "off") return false;
  if (process.env.NODE_TEST_CONTEXT && process.env.GOASSIST_RATE_LIMIT !== "on")
    return false;
  return DEFAULT_LIMITS;
}

const READ_ONLY_CACHE_SECONDS = 300;

export function createApp(options: AppOptions = {}) {
  const roles = parseRoles(options.roles ?? process.env.GOASSIST_ROLES);
  const limits =
    options.rateLimit === undefined ? defaultRateLimit() : options.rateLimit;
  const metrics = new Metrics();
  const limiter = limits ? new RateLimiter(limits) : undefined;
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

  // Metrics and load shedding see every request. Devices are keyed by their id (or address),
  // everyone else by address, so one noisy client cannot use up another's allowance.
  app.use((req, res, next) => {
    const klass = classifyRequest(req.method, req.path);
    const started = process.hrtime.bigint();
    metrics.started();
    limiter?.enter();
    res.on("finish", () => {
      metrics.finished();
      limiter?.leave();
      metrics.record(
        klass,
        res.statusCode,
        Number(process.hrtime.bigint() - started) / 1e6,
      );
    });
    if (limiter) {
      const key = String(req.headers["x-device-id"] ?? req.ip ?? "unknown");
      const admission = limiter.admit(klass, key);
      if (!admission.ok) {
        res.setHeader("Retry-After", String(admission.retryAfterSeconds));
        res
          .status(429)
          .json({ error: "Too many requests", reason: admission.reason });
        return;
      }
    }
    next();
  });

  if (roles.has("passenger")) {
    app.use("/api/assistance", assistanceRouter);
    app.use("/api/location", locationRouter);
    // Static reference data: safe to cache and to answer with 304 (Express adds the ETag).
    app.use("/api/bus-stops", (req, res, next) => {
      if (req.method === "GET") {
        res.setHeader(
          "Cache-Control",
          `public, max-age=${READ_ONLY_CACHE_SECONDS}`,
        );
      }
      next();
    });
    app.use("/api/bus-stops", busStopsRouter);
    app.use("/api/assistant", assistantDiagnosticsRouter);
    app.use("/api/passenger", passengerRouter);
    app.use("/api/journeys", journeysRouter);
  }
  if (roles.has("operations")) {
    app.use("/api/operations", busOperationsRouter);
    app.use("/api/operations", operationsRouter);
  }

  app.get("/health", async (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      connectedWebSocketClients: getConnectedClientCount(),
      activeRequests: await countRequests(),
      activeAssistanceCases: await countActiveCases(),
    });
  });

  // Liveness (/health) says the process is up; readiness says its stores answer.
  app.get("/ready", async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      await (await getOperationsData()).ping();
      checks.operationsStore = "ok";
    } catch (error) {
      checks.operationsStore = `failed: ${String(error)}`;
    }
    try {
      await getBusOperations().listBusStatus({ limit: 1 });
      checks.busOperations = "ok";
    } catch (error) {
      checks.busOperations = `failed: ${String(error)}`;
    }
    const ready = Object.values(checks).every((value) => value === "ok");
    res.status(ready ? 200 : 503).json({ ready, checks });
  });

  const requireAdmin: express.RequestHandler = (req, res, next) => {
    const token = process.env.OPERATOR_API_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.status(401).json({ error: "Operator authentication required" });
      return;
    }
    next();
  };

  app.get("/admin/metrics", requireAdmin, (_req, res) => {
    const hub = getEventHub();
    res.json({
      ...metrics.snapshot(),
      connectedWebSocketClients: getConnectedClientCount(),
      eventSubscribers: hub.subscriberCount(),
      eventTopics: hub.topicCount(),
    });
  });

  app.get("/admin/logs", requireAdmin, (req, res) => {
    res.json({
      logs: logger.getLogs(),
    });
  });

  app.post("/admin/reset", requireAdmin, async (req, res, next) => {
    try {
      await clearAllRequests();
      await clearOperations();
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

/** Cases that still need someone, counted from the per-state totals (no case is read). */
async function countActiveCases(): Promise<number> {
  const byState = await (await getOperationsData()).cases.countByState();
  const finished = ["COMPLETED", "FAILED", "CANCELLED"] as const;
  const total = Object.values(byState).reduce((sum, n) => sum + (n ?? 0), 0);
  return (
    total - finished.reduce((sum, state) => sum + (byState[state] ?? 0), 0)
  );
}
