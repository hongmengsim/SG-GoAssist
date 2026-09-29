import {
  NextFunction,
  Request,
  RequestHandler,
  Response,
  Router,
} from "express";
import { BusOperationsValidationError } from "../busOperations/busOperationsService";
import { getBusOperations } from "../busOperations/composition";
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
