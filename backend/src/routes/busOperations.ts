import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";
import { AssistanceRequestStatus } from "@buspass/shared";
import {
  BusOperationsConflictError,
  BusOperationsValidationError,
} from "../busOperations/busOperationsService";
import { getOperationsStore } from "../services/operationsStore";
import { getBusOperations } from "../busOperations/composition";
import {
  getAllRequests,
  getRequest,
  processSimulatorCommand,
} from "../services/aviator";
import { toBusRequest } from "../services/busRequest";
import { requireOperator, verifyDeviceRequest } from "./auth";

/**
 * Bus movement and status. Buses post their own status (signed device requests);
 * operators read it. Mounted under /api/operations.
 */
export const router = Router();

function handle(
  work: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    work(req, res).catch((error: unknown) => {
      if (error instanceof BusOperationsValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof BusOperationsConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    });
  };
}

router.post(
  "/vehicles/:busId/status",
  verifyDeviceRequest,
  handle(async (req, res) => {
    const result = await getBusOperations().reportBusStatus(
      req.body,
      req.params.busId,
    );
    res.status(202).json({ outcome: result.outcome });
  }),
);

router.post(
  "/vehicles/:busId/assist-ack",
  verifyDeviceRequest,
  (req: Request, res: Response) => {
    const requestId = req.body?.requestId;
    if (typeof requestId !== "string" || !requestId) {
      res.status(400).json({ error: "requestId is required" });
      return;
    }
    const request = getRequest(requestId);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (request.busId !== req.params.busId) {
      res.status(409).json({ error: "Request belongs to a different bus" });
      return;
    }
    const result = processSimulatorCommand({
      requestId,
      command: "ACKNOWLEDGE",
    });
    res.status(result.success ? 200 : 409).json({
      success: result.success,
      status: result.request?.status,
    });
  },
);

/** Fallback for a bus that missed the push (reconnect, restart): requests still waiting for it. */
router.get(
  "/vehicles/:busId/requests",
  verifyDeviceRequest,
  (req: Request, res: Response) => {
    const requested = Number(queryText(req.query.limit));
    const limit =
      Number.isFinite(requested) && requested >= 1
        ? Math.min(Math.trunc(requested), MAX_WAITING_REQUESTS)
        : MAX_WAITING_REQUESTS;
    const requests = getAllRequests()
      .filter(
        (request) =>
          request.busId === req.params.busId &&
          request.status === AssistanceRequestStatus.SENDING,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map(toBusRequest);
    res.json({ count: requests.length, requests });
  },
);

router.get(
  "/vehicles/:busId/status",
  requireOperator,
  handle(async (req, res) => {
    const status = await getBusOperations().getBusStatus(req.params.busId);
    if (!status) {
      res.status(404).json({ error: "Bus status not found" });
      return;
    }
    res.json(status);
  }),
);

router.get(
  "/bus-status",
  requireOperator,
  handle(async (req, res) => {
    const stop =
      typeof req.query.stop === "string" && req.query.stop
        ? req.query.stop
        : undefined;
    const requested =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const statuses = await getBusOperations().listBusStatus({
      stopCode: stop,
      limit: requested,
    });
    res.json({ count: statuses.length, statuses });
  }),
);

router.get(
  "/bays/:stopCode",
  requireOperator,
  handle(async (req, res) => {
    res.json(await getBusOperations().getBay(req.params.stopCode));
  }),
);

router.post(
  "/bays/:stopCode/proceed",
  requireOperator,
  handle(async (req, res) => {
    res.json(await getBusOperations().grantBayEntry(req.params.stopCode));
  }),
);

const DEFAULT_AUDIT_LIMIT = 100;
const MAX_WAITING_REQUESTS = 50;
const MAX_AUDIT_LIMIT = 500;

function queryText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

router.get("/audit", requireOperator, (req: Request, res: Response) => {
  const requested = Number(queryText(req.query.limit));
  const limit =
    Number.isFinite(requested) && requested >= 1
      ? Math.min(Math.trunc(requested), MAX_AUDIT_LIMIT)
      : DEFAULT_AUDIT_LIMIT;
  const events = getOperationsStore().readAudit({
    limit,
    caseId: queryText(req.query.caseId),
    busId: queryText(req.query.busId),
  });
  res.json({ count: events.length, events });
});
