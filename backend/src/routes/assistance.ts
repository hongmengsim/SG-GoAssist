import { Router, Request, Response } from "express";
import {
  AssistanceRequestResponse,
  AssistanceRequestStatus,
  AssistancePhase,
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
  waitForRequestStatus,
} from "../services/aviator";
import {
  createStandardizedAssistanceRequestBundle,
  createStandardizedAssistanceRequest,
  isAssistanceType,
  supportedAssistanceTypes,
} from "../services/assistanceRequestService";
import { logger } from "../services/logger";
import { isAutoAcknowledgeEnabled } from "../services/autoAcknowledge";
import { getBusesByService, mockBuses } from "../data/buses.mock";

export const router = Router();

router.get("/buses/mock", (req: Request, res: Response) => {
  const service =
    typeof req.query.service === "string" ? req.query.service : undefined;
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
  if (!isAutoAcknowledgeEnabled() && req.body?.command === "ACKNOWLEDGE") {
    return res.status(403).json({
      error: "Acknowledgement must come from the bus",
    });
  }
  const result = processSimulatorCommand(req.body);
  res.status(result.success ? 200 : 400).json(result);
});

router.post("/simulator/vehicle", (req: Request, res: Response) => {
  const { busId, status, busService, stopCode } = req.body;

  if (!busId || !Object.values(VehicleStatus).includes(status)) {
    return res.status(400).json({
      error: "Invalid vehicle command",
      required: ["busId", "status"],
      allowedStatuses: Object.values(VehicleStatus),
    });
  }

  const result = processVehicleCommand({ busId, status, busService, stopCode });
  res.status(result.success ? 200 : 409).json(result);
});

router.post("/request", (req: Request, res: Response) => {
  try {
    const payload: CreateAssistanceRequestPayload = req.body;

    if (
      !payload.busService ||
      !payload.busId ||
      !payload.boardingStop ||
      (payload.boardingOrAlighting === "ALIGHTING" && !payload.destination) ||
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
          "assistanceTypes",
          "boardingOrAlighting",
          ...(payload.boardingOrAlighting === "ALIGHTING"
            ? ["destination"]
            : []),
        ],
      });
    }

    const invalidTypes = payload.assistanceTypes.filter(
      (type) => !isAssistanceType(type),
    );
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        error: "Unsupported assistance type",
        invalidTypes,
        supportedAssistanceTypes,
      });
    }

    const validPhases: AssistancePhase[] = ["BOARDING", "ALIGHTING"];
    if (!validPhases.includes(payload.boardingOrAlighting)) {
      return res.status(400).json({
        error: "Unsupported assistance phase",
        invalidPhase: payload.boardingOrAlighting,
        supportedAssistancePhases: validPhases,
      });
    }

    const { request: savedRequest, duplicateOfRequestId } =
      createStandardizedAssistanceRequestBundle({
        sessionId: payload.sessionId ?? "demo-session",
        busService: payload.busService,
        busId: payload.busId,
        boardingStop: payload.boardingStop,
        destination: payload.destination,
        stopCode: payload.stopCode,
        assistanceTypes: payload.assistanceTypes,
        boardingOrAlighting: payload.boardingOrAlighting,
        source: payload.source ?? "MOBILE_APP",
        accessibilityVerificationStatus:
          payload.accessibilityVerificationStatus,
        verificationMethod: payload.verificationMethod,
      });

    const response: AssistanceRequestResponse = {
      requestId: savedRequest.requestId,
      caseId: savedRequest.caseId,
      assistanceCaseState: savedRequest.assistanceCaseState,
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
    });
  }
});

router.post(
  "/hardware/physical-button/wheelchair-ramp",
  async (req: Request, res: Response) => {
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

      const { request, duplicateOfRequestId } =
        createStandardizedAssistanceRequest({
          sessionId: `PHYSICAL_BUTTON:${payload.busId}`,
          busId: payload.busId,
          busService: payload.busService,
          boardingStop: payload.boardingStop,
          assistanceType: "WHEELCHAIR_RAMP",
          source: "PHYSICAL_BUTTON",
        });

      const acknowledgedRequest = await waitForRequestStatus(
        request.requestId,
        AssistanceRequestStatus.ACKNOWLEDGED,
        2000,
      );
      const status = acknowledgedRequest?.status ?? request.status;

      const response: PhysicalButtonRequestResponse = {
        requestId: request.requestId,
        caseId: request.caseId,
        status,
        source: "PHYSICAL_BUTTON",
        duplicateOfRequestId,
        feedback: {
          led: status === "ACKNOWLEDGED" ? "CONFIRMATION_ON" : "ERROR_BLINK",
          buzzer: status === "ACKNOWLEDGED" ? "SHORT_CONFIRMATION" : undefined,
          message:
            status === "ACKNOWLEDGED"
              ? `Bus ${request.busService} acknowledged wheelchair ramp request.`
              : `Bus ${request.busService} request sent, acknowledgement pending.`,
        },
      };

      res.status(duplicateOfRequestId ? 200 : 201).json(response);
    } catch (error) {
      logger.error("Physical button request failed", undefined, {
        error: String(error),
      });
      res.status(400).json({
        error: "Unable to create physical assistance request",
        feedback: {
          led: "ERROR_BLINK",
          message: "Unable to send wheelchair ramp request.",
        },
      });
    }
  },
);

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
          ? new Date(request.acknowledgedAt).getTime() -
            new Date(request.createdAt).getTime()
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
