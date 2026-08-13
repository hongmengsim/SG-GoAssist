import { Router, Request, Response } from "express";
import {
  AssistanceRequestResponse,
  CreateAssistanceRequestPayload,
  PhysicalButtonRequestPayload,
  PhysicalButtonRequestResponse,
  VehicleStatus,
} from "@buspass/shared";
import {
  cancelRequest,
  getAllRequests,
  getAnnouncementEvents,
  getRequest,
  processSimulatorCommand,
  processVehicleCommand,
} from "../services/aviator";
import {
  createStandardizedAssistanceRequest,
  isAssistanceType,
  supportedAssistanceTypes,
} from "../services/assistanceRequestService";
import { logger } from "../services/logger";
import { getBusesByService, mockBuses } from "../data/buses.mock";

export const router = Router();

router.get("/buses/mock", (req: Request, res: Response) => {
  const service = typeof req.query.service === "string" ? req.query.service : undefined;
  const buses = service ? getBusesByService(service) : mockBuses;

  res.json({
    count: buses.length,
    buses,
  });
});

router.get("/simulator/announcements", (req: Request, res: Response) => {
  res.json({
    count: getAnnouncementEvents().length,
    announcements: getAnnouncementEvents(),
  });
});

router.post("/simulator/command", (req: Request, res: Response) => {
  const result = processSimulatorCommand(req.body);
  res.status(result.success ? 200 : 400).json(result);
});

router.post("/simulator/vehicle", (req: Request, res: Response) => {
  const { busId, status } = req.body;

  if (!busId || !Object.values(VehicleStatus).includes(status)) {
    return res.status(400).json({
      error: "Invalid vehicle command",
      required: ["busId", "status"],
      allowedStatuses: Object.values(VehicleStatus),
    });
  }

  res.json(processVehicleCommand({ busId, status }));
});

router.post("/request", (req: Request, res: Response) => {
  try {
    const payload: CreateAssistanceRequestPayload = req.body;

    if (
      !payload.busService ||
      !payload.busId ||
      !payload.boardingStop ||
      !payload.destination ||
      !Array.isArray(payload.assistanceTypes) ||
      payload.assistanceTypes.length === 0 ||
      !payload.boardingOrAlighting
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        required: [
          "busService",
          "busId",
          "boardingStop",
          "destination",
          "assistanceTypes",
          "boardingOrAlighting",
        ],
      });
    }

    const invalidTypes = payload.assistanceTypes.filter((type) => !isAssistanceType(type));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        error: "Unsupported assistance type",
        invalidTypes,
        supportedAssistanceTypes,
      });
    }

    const created = payload.assistanceTypes.map((assistanceType) =>
      createStandardizedAssistanceRequest({
        sessionId: payload.sessionId ?? "demo-session",
        busService: payload.busService,
        busId: payload.busId,
        boardingStop: payload.boardingStop,
        destination: payload.destination,
        assistanceType,
        source: payload.source ?? "MOBILE_APP",
      })
    );

    const primary = created[0];
    const savedRequest = primary.request;
    const duplicateOfRequestId = primary.duplicateOfRequestId;

    const response: AssistanceRequestResponse = {
      requestId: savedRequest.requestId,
      status: savedRequest.status,
      createdAt: savedRequest.createdAt,
      duplicateOfRequestId,
    };

    logger.info("API: Assistance request received", savedRequest.requestId, {
      busService: payload.busService,
      busId: payload.busId,
      assistanceTypes: payload.assistanceTypes,
      source: payload.source ?? "MOBILE_APP",
    });

    res.status(duplicateOfRequestId ? 200 : 201).json(response);
  } catch (error) {
    logger.error("Error creating assistance request", undefined, {
      error: String(error),
    });
    res.status(500).json({
      error: "Internal server error",
      message: String(error),
    });
  }
});

router.post("/hardware/physical-button/wheelchair-ramp", (req: Request, res: Response) => {
  try {
    const payload: PhysicalButtonRequestPayload = req.body;

    if (!payload.busId || !payload.busService) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["busId", "busService"],
        feedback: {
          led: "ERROR_BLINK",
          message: "Request missing bus identifier.",
        },
      });
    }

    const { request, duplicateOfRequestId } = createStandardizedAssistanceRequest({
      sessionId: `PHYSICAL_BUTTON:${payload.busId}`,
      busId: payload.busId,
      busService: payload.busService,
      boardingStop: payload.boardingStop,
      assistanceType: "WHEELCHAIR_RAMP",
      source: "PHYSICAL_BUTTON",
    });

    const response: PhysicalButtonRequestResponse = {
      requestId: request.requestId,
      status: request.status,
      source: "PHYSICAL_BUTTON",
      duplicateOfRequestId,
      feedback: {
        led: "CONFIRMATION_ON",
        buzzer: "SHORT_CONFIRMATION",
        message: `Bus ${request.busService} received wheelchair ramp request.`,
      },
    };

    res.status(duplicateOfRequestId ? 200 : 201).json(response);
  } catch (error) {
    logger.error("Physical button request failed", undefined, { error: String(error) });
    res.status(400).json({
      error: String(error),
      feedback: {
        led: "ERROR_BLINK",
        message: "Unable to send wheelchair ramp request.",
      },
    });
  }
});

router.post("/:requestId/cancel", (req: Request, res: Response) => {
  const result = cancelRequest(req.params.requestId);
  res.status(result.success ? 200 : 404).json(result);
});

router.get("/:requestId/logs", (req: Request, res: Response) => {
  const request = getRequest(req.params.requestId);
  if (!request) {
    return res.status(404).json({
      error: "Request not found",
      requestId: req.params.requestId,
    });
  }

  res.json({
    requestId: request.requestId,
    status: request.status,
    timestamps: {
      createdAt: request.createdAt,
      acknowledgedAt: request.acknowledgedAt,
      cancelledAt: request.cancelledAt,
      failedAt: request.failedAt,
    },
    metrics: {
      timeToAcknowledgeMs:
        request.acknowledgedAt && request.createdAt
          ? new Date(request.acknowledgedAt).getTime() - new Date(request.createdAt).getTime()
          : undefined,
    },
  });
});

router.get("/:requestId", (req: Request, res: Response) => {
  const request = getRequest(req.params.requestId);
  if (!request) {
    return res.status(404).json({
      error: "Request not found",
      requestId: req.params.requestId,
    });
  }

  res.json(request);
});

router.get("/", (req: Request, res: Response) => {
  const requests = getAllRequests();
  res.json({
    count: requests.length,
    requests,
  });
});
