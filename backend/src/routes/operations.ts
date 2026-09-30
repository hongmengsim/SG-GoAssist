import crypto from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import {
  ActuatorStatus,
  AssistanceCaseState,
  DeviceHealth,
  PerceptionEvaluationSample,
  SafetyTelemetry,
  SignalObservation,
  VehicleCapability,
} from "@buspass/shared";
import {
  OperationsNotFoundError,
  OperationsValidationError,
  applyOperatorAction,
  assignCaseVehicle,
  getAssistanceMetrics,
  getCase,
  getLatestSafetyTelemetry,
  ingestSafetyTelemetry,
  listCases,
  listDevices,
  listPendingActuatorCommands,
  listVehicleCapabilities,
  recordDeviceHeartbeat,
  recordPassengerFeedback,
  registerVehicleCapability,
  submitSignalObservation,
  updateActuatorStatus,
} from "../services/assistanceCaseService";
import {
  applyAutonomyOverride,
  assignAutonomousRoute,
  departAutonomousStop,
  getAutonomousVehicleState,
  listAutonomousVehicles,
  openAutonomousDoors,
  startAutonomousRoute,
  updateAutonomousMotion,
} from "../services/autonomousVehicleService";
import {
  RampObstacleNotFoundError,
  RampObstacleValidationError,
  getRampObstacleAssessment,
  recordRampObstacleClassification,
} from "../services/rampObstacleService";
import {
  PerceptionEvaluationValidationError,
  getPerceptionEvaluationMetrics,
  recordPerceptionEvaluation,
} from "../services/perceptionEvaluationService";
import {
  getPrecisionDockingAssessment,
  recordPrecisionDockingObservation,
} from "../services/precisionDockingService";

import { requireOperator, verifyDeviceRequest } from "./auth";

export const router = Router();

router.post(
  "/passenger-help",
  route(async (req, res) => {
    const stopCode =
      typeof req.body.stopCode === "string" ? req.body.stopCode.trim() : "";
    const anonymousToken =
      typeof req.body.anonymousToken === "string"
        ? req.body.anonymousToken.trim()
        : "";
    if (!stopCode || !anonymousToken) {
      throw new OperationsValidationError(
        "stopCode and anonymousToken are required",
      );
    }
    const observedAt = new Date().toISOString();
    const signalId =
      typeof req.body.idempotencyKey === "string" &&
      req.body.idempotencyKey.trim()
        ? req.body.idempotencyKey.trim().slice(0, 120)
        : `HELP-${crypto.randomUUID()}`;
    const item = await submitSignalObservation({
      signalId,
      idempotencyKey: signalId,
      source: "APP",
      kind: "HUMAN_HELP_REQUESTED",
      stopCode: stopCode.slice(0, 40),
      busCandidate:
        typeof req.body.busId === "string"
          ? req.body.busId.trim().slice(0, 80)
          : undefined,
      busService:
        typeof req.body.busService === "string"
          ? req.body.busService.trim().slice(0, 20)
          : undefined,
      assistanceCandidates: [],
      confidence: 1,
      anonymousToken: anonymousToken.slice(0, 120),
      phase: req.body.phase === "ALIGHTING" ? "ALIGHTING" : "BOARDING",
      confirmed: true,
      observedAt,
      metadata: {
        reason:
          typeof req.body.reason === "string"
            ? req.body.reason.trim().slice(0, 160)
            : "Passenger requested operator help",
      },
    });
    res.status(201).json({ case: item });
  }),
);

router.post(
  "/signals",
  verifyDeviceRequest,
  route(async (req, res) => {
    const item = await submitSignalObservation(req.body as SignalObservation);
    res.status(201).json({ case: item });
  }),
);

router.get(
  "/cases",
  route(async (req, res) => {
    const state =
      typeof req.query.state === "string"
        ? (req.query.state as AssistanceCaseState)
        : undefined;
    const busId =
      typeof req.query.busId === "string" ? req.query.busId : undefined;
    const cases = await listCases({ state, busId });
    res.json({ count: cases.length, cases });
  }),
);

router.get(
  "/cases/:caseId",
  route(async (req, res) => {
    const item = await getCase(req.params.caseId);
    if (!item) throw new OperationsNotFoundError("Assistance case not found");
    res.json(item);
  }),
);

router.post(
  "/cases/:caseId/operator",
  requireOperator,
  route(async (req, res) => {
    const allowed = [
      "CONFIRM",
      "ESCALATE",
      "CANCEL",
      "COMPLETE",
      "RETRY",
    ] as const;
    if (!allowed.includes(req.body.action)) {
      throw new OperationsValidationError(
        `action must be one of ${allowed.join(", ")}`,
      );
    }
    res.json({
      case: await applyOperatorAction(
        req.params.caseId,
        req.body.action,
        req.body.reason,
      ),
    });
  }),
);

router.post(
  "/cases/:caseId/assign",
  requireOperator,
  route(async (req, res) => {
    res.json({
      case: await assignCaseVehicle(
        req.params.caseId,
        req.body.busId,
        req.body.busService,
      ),
    });
  }),
);

router.post(
  "/cases/:caseId/feedback",
  route(async (req, res) => {
    res.json({
      case: await recordPassengerFeedback(req.params.caseId, req.body.score),
    });
  }),
);

router.get(
  "/vehicles/capabilities",
  route(async (_req, res) => {
    const capabilities = await listVehicleCapabilities();
    res.json({ count: capabilities.length, capabilities });
  }),
);

router.put(
  "/vehicles/:busId/capabilities",
  verifyDeviceRequest,
  route(async (req, res) => {
    const capability = await registerVehicleCapability({
      ...req.body,
      busId: req.params.busId,
    } as VehicleCapability);
    res.json(capability);
  }),
);

router.get(
  "/vehicles/:busId/telemetry",
  route(async (req, res) => {
    const telemetry = await getLatestSafetyTelemetry(req.params.busId);
    if (!telemetry)
      throw new OperationsNotFoundError("Safety telemetry not found");
    res.json(telemetry);
  }),
);

router.post(
  "/vehicles/:busId/telemetry",
  verifyDeviceRequest,
  route(async (req, res) => {
    const telemetry = await ingestSafetyTelemetry({
      ...req.body,
      busId: req.params.busId,
    } as SafetyTelemetry);
    res.status(202).json(telemetry);
  }),
);

router.get(
  "/vehicles/:busId/ramp-obstacle",
  verifyDeviceRequest,
  route(async (req, res) => {
    res.json(await getRampObstacleAssessment(req.params.busId));
  }),
);

router.post(
  "/vehicles/:busId/ramp-obstacle/classification",
  verifyDeviceRequest,
  route(async (req, res) => {
    res.status(202).json(
      await recordRampObstacleClassification({
        ...req.body,
        busId: req.params.busId,
      }),
    );
  }),
);

router.get(
  "/vehicles/autonomy",
  requireOperator,
  route(async (_req, res) => {
    const vehicles = await listAutonomousVehicles();
    res.json({ count: vehicles.length, vehicles });
  }),
);

router.get(
  "/vehicles/:busId/autonomy",
  route(async (req, res) => {
    res.json(await getAutonomousVehicleState(req.params.busId));
  }),
);

router.put(
  "/vehicles/:busId/autonomy/route",
  requireOperator,
  route(async (req, res) => {
    res
      .status(201)
      .json(await assignAutonomousRoute(req.params.busId, req.body));
  }),
);

router.post(
  "/vehicles/:busId/autonomy/start",
  requireOperator,
  route(async (req, res) => {
    res.json(await startAutonomousRoute(req.params.busId));
  }),
);

router.post(
  "/vehicles/:busId/autonomy/motion",
  verifyDeviceRequest,
  route(async (req, res) => {
    res
      .status(202)
      .json(await updateAutonomousMotion(req.params.busId, req.body));
  }),
);

router.get(
  "/vehicles/:busId/autonomy/docking",
  route(async (req, res) => {
    res.json(await getPrecisionDockingAssessment(req.params.busId));
  }),
);

router.post(
  "/vehicles/:busId/autonomy/docking",
  verifyDeviceRequest,
  route(async (req, res) => {
    res.status(202).json(
      await recordPrecisionDockingObservation({
        ...req.body,
        busId: req.params.busId,
      }),
    );
  }),
);

router.post(
  "/vehicles/:busId/autonomy/open-doors",
  verifyDeviceRequest,
  route(async (req, res) => {
    res.status(202).json(await openAutonomousDoors(req.params.busId));
  }),
);

router.post(
  "/vehicles/:busId/autonomy/depart",
  verifyDeviceRequest,
  route(async (req, res) => {
    res
      .status(202)
      .json(
        await departAutonomousStop(
          req.params.busId,
          req.body.nextStopDistanceMeters,
        ),
      );
  }),
);

router.post(
  "/vehicles/:busId/autonomy/override",
  requireOperator,
  route(async (req, res) => {
    const allowed = ["STOP", "RESUME", "MANUAL"] as const;
    if (!allowed.includes(req.body.action)) {
      throw new OperationsValidationError(
        `action must be one of ${allowed.join(", ")}`,
      );
    }
    res.json(
      await applyAutonomyOverride(req.params.busId, req.body.action, {
        obstacleCleared: req.body.obstacleCleared,
        localizationAccuracyMeters: req.body.localizationAccuracyMeters,
      }),
    );
  }),
);

router.get(
  "/actuators/pending",
  verifyDeviceRequest,
  route(async (req, res) => {
    const busId =
      typeof req.query.busId === "string" ? req.query.busId : undefined;
    const commands = await listPendingActuatorCommands(busId);
    res.json({ count: commands.length, commands });
  }),
);

router.post(
  "/actuators/:commandId/status",
  verifyDeviceRequest,
  route(async (req, res) => {
    const caseRecord = await updateActuatorStatus({
      ...req.body,
      commandId: req.params.commandId,
    } as ActuatorStatus);
    res.status(202).json({ case: caseRecord });
  }),
);

router.post(
  "/devices/heartbeat",
  verifyDeviceRequest,
  route(async (req, res) => {
    res.status(202).json(await recordDeviceHeartbeat(req.body as DeviceHealth));
  }),
);

router.get(
  "/devices",
  requireOperator,
  route(async (_req, res) => {
    const devices = await listDevices();
    res.json({ count: devices.length, devices });
  }),
);

router.get(
  "/metrics",
  requireOperator,
  route(async (_req, res) => {
    res.json(await getAssistanceMetrics());
  }),
);

router.post(
  "/perception/evaluations",
  requireOperator,
  route(async (req, res) => {
    res
      .status(201)
      .json(
        await recordPerceptionEvaluation(
          req.body as PerceptionEvaluationSample,
        ),
      );
  }),
);

router.get(
  "/perception/metrics",
  requireOperator,
  route(async (_req, res) => {
    res.json(await getPerceptionEvaluationMetrics());
  }),
);

function route(handler: (req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof OperationsValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof OperationsNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof RampObstacleValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof RampObstacleNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof PerceptionEvaluationValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  };
}
