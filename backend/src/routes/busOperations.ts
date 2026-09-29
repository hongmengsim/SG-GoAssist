import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";
import { BusOperationsValidationError } from "../busOperations/busOperationsService";
import { getBusOperations } from "../busOperations/composition";
import { getRequest, processSimulatorCommand } from "../services/aviator";
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
