import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { AssistanceRequestStatus } from "@buspass/shared";
import {
  applyOperatorAction,
  getCase,
  ingestSafetyTelemetry,
  listPendingActuatorCommands,
  registerVehicleCapability,
  recordPassengerFeedback,
  submitSignalObservation,
  synchronizeLegacyCaseStatus,
  updateActuatorStatus,
} from "../services/assistanceCaseService";
import { configureOperationsStore } from "../services/operationsStore";
import { getOperationsStore } from "../services/operationsStore";

let dataDirectory = "";

beforeEach(() => {
  dataDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "goassist-operations-"),
  );
  configureOperationsStore(dataDirectory);
  registerVehicleCapability({
    busId: "BUS-95-01",
    busService: "95",
    ramp: true,
    externalAudio: true,
    visualDisplay: true,
    dwellControl: true,
    wheelchairSpaceCapacity: 1,
    supportedTelemetry: [
      "vehicleStopped",
      "parkingBrakeActive",
      "doorOpen",
      "deploymentPathClear",
      "rampPosition",
    ],
    updatedAt: new Date().toISOString(),
  });
});

afterEach(() => {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("confirmed ramp intent cannot actuate until every safety interlock is clear", () => {
  const item = explicitRamp("signal-one", "passenger-one");
  assert.equal(item.state, "BLOCKED");
  assert.match(item.escalationReason ?? "", /telemetry is unavailable/i);
  assert.equal(listPendingActuatorCommands("BUS-95-01").length, 0);

  const blocked = ingestSafetyTelemetry(
    telemetry({ deploymentPathClear: false }),
  );
  assert.equal(blocked.deploymentPathClear, false);
  assert.equal(getCase(item.caseId)?.state, "BLOCKED");
  assert.match(getCase(item.caseId)?.escalationReason ?? "", /obstructed/i);
  assert.equal(listPendingActuatorCommands("BUS-95-01").length, 0);

  ingestSafetyTelemetry(telemetry());
  assert.equal(getCase(item.caseId)?.state, "ACTUATING");
  assert.equal(
    listPendingActuatorCommands("BUS-95-01")[0].command,
    "DEPLOY_RAMP",
  );
});

test("expired actuator commands are failed and can never be polled for execution", () => {
  const item = explicitRamp("signal-expired", "passenger-expired");
  ingestSafetyTelemetry(telemetry());
  const command = listPendingActuatorCommands("BUS-95-01")[0];

  getOperationsStore().update((state) => {
    const stored = state.actuatorCommands.find(
      (candidate) => candidate.commandId === command.commandId,
    )!;
    stored.expiresAt = new Date(Date.now() - 1_000).toISOString();
  });

  assert.equal(listPendingActuatorCommands("BUS-95-01").length, 0);
  const status = getOperationsStore()
    .snapshot()
    .actuatorStatuses.find(
      (candidate) => candidate.commandId === command.commandId,
    );
  assert.equal(status?.state, "FAILED");
  assert.match(status?.detail ?? "", /expired/i);
  assert.equal(getCase(item.caseId)?.state, "FAILED");

  assert.throws(
    () =>
      updateActuatorStatus({
        commandId: command.commandId,
        caseId: item.caseId,
        busId: "BUS-95-01",
        state: "COMPLETED",
        updatedAt: new Date().toISOString(),
      }),
    /terminal actuator status cannot be changed/i,
  );
});

test("ramp readiness requires both actuator completion and deployed limit switch", () => {
  const item = explicitRamp("signal-two", "passenger-two");
  ingestSafetyTelemetry(telemetry());
  const command = listPendingActuatorCommands("BUS-95-01")[0];

  const unverified = updateActuatorStatus({
    commandId: command.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(unverified.state, "BLOCKED");

  ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  assert.equal(getCase(item.caseId)?.state, "READY");
});

test("sensor-only ramp detection needs confirmation and never stores image metadata", () => {
  const observed = submitSignalObservation({
    signalId: "camera-one",
    source: "CAMERA",
    kind: "WHEELCHAIR_DETECTED",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP"],
    confidence: 0.94,
    anonymousToken: "anonymous-zone-token",
    observedAt: new Date().toISOString(),
    metadata: { imageData: "never-store-this", modelVersion: "demo-v1" },
  });
  assert.equal(observed.state, "NEEDS_CONFIRMATION");
  assert.equal(listPendingActuatorCommands().length, 0);

  ingestSafetyTelemetry(telemetry());
  const confirmed = applyOperatorAction(observed.caseId, "CONFIRM");
  assert.equal(confirmed.state, "ACTUATING");
});

test("multiple passengers share one actuator action without losing individual intent", () => {
  const first = explicitRamp("signal-a", "passenger-a");
  const second = explicitRamp("signal-b", "passenger-b");
  assert.equal(second.caseId, first.caseId);
  assert.equal(second.intents.length, 2);
  assert.equal(second.passengerCount, 2);

  ingestSafetyTelemetry(telemetry());
  assert.equal(
    listPendingActuatorCommands().filter(
      (item) => item.command === "DEPLOY_RAMP",
    ).length,
    1,
  );
});

test("cases survive an operations-store reload", () => {
  const item = explicitRamp("signal-persist", "passenger-persist");
  configureOperationsStore(dataDirectory);
  assert.equal(getCase(item.caseId, false)?.passengerCount, 1);
});

test("boarding completion retracts and verifies the ramp before closing the case", () => {
  const item = explicitRamp("signal-complete", "passenger-complete");
  ingestSafetyTelemetry(telemetry());
  const deploy = listPendingActuatorCommands().find(
    (command) => command.command === "DEPLOY_RAMP",
  )!;
  ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  updateActuatorStatus({
    commandId: deploy.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "DEPLOYED",
    updatedAt: new Date().toISOString(),
  });

  const completionDetected = submitSignalObservation({
    signalId: "completion-one",
    source: "PRESSURE_SENSOR",
    kind: "BOARDING_COMPLETE",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    assistanceCandidates: [],
    confidence: 0.96,
    anonymousToken: "boarding-zone",
    observedAt: new Date().toISOString(),
  });
  assert.equal(completionDetected.caseId, item.caseId);
  assert.equal(completionDetected.state, "ACTUATING");
  const retract = listPendingActuatorCommands().find(
    (command) => command.command === "RETRACT_RAMP",
  )!;
  assert.ok(retract);
  const awaitingLimitSwitch = updateActuatorStatus({
    commandId: retract.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "STOWED",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(awaitingLimitSwitch.state, "ACTUATING");

  ingestSafetyTelemetry(telemetry({ rampPosition: "STOWED" }));
  const completed = getCase(item.caseId)!;
  assert.equal(completed.state, "COMPLETED");
  assert.ok(completed.outcome.completionTimeMs !== undefined);
  assert.equal(
    synchronizeLegacyCaseStatus(item.caseId, AssistanceRequestStatus.CANCELLED)
      .state,
    "COMPLETED",
  );
  assert.equal(
    recordPassengerFeedback(item.caseId, 5).outcome.passengerFeedbackScore,
    5,
  );
});

test("cancellation retracts a deployed ramp before becoming terminal", () => {
  const item = explicitRamp("signal-cancel", "passenger-cancel");
  ingestSafetyTelemetry(telemetry());
  const deploy = listPendingActuatorCommands().find(
    (command) => command.command === "DEPLOY_RAMP",
  )!;
  ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  updateActuatorStatus({
    commandId: deploy.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "DEPLOYED",
    updatedAt: new Date().toISOString(),
  });

  const cancelling = applyOperatorAction(item.caseId, "CANCEL");
  assert.equal(cancelling.state, "ACTUATING");
  assert.equal(cancelling.boardingIntent.decision, "DECLINED");
  assert.ok(
    listPendingActuatorCommands().some(
      (command) => command.command === "RETRACT_RAMP",
    ),
  );

  ingestSafetyTelemetry(telemetry({ rampPosition: "STOWED" }));
  assert.equal(getCase(item.caseId)?.state, "CANCELLED");
});

test("cancellation removes an unstarted deployment command", () => {
  const item = explicitRamp("signal-cancel-early", "passenger-cancel-early");
  ingestSafetyTelemetry(telemetry());
  assert.ok(
    listPendingActuatorCommands().some(
      (command) => command.command === "DEPLOY_RAMP",
    ),
  );

  const cancelled = applyOperatorAction(item.caseId, "CANCEL");
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(
    listPendingActuatorCommands().filter(
      (command) => command.command === "DEPLOY_RAMP",
    ).length,
    0,
  );
});

test("sensor fusion can mark intent likely but never confirmed without consent", () => {
  const detected = submitSignalObservation({
    signalId: "intent-wheelchair",
    source: "CAMERA",
    kind: "WHEELCHAIR_DETECTED",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP"],
    confidence: 0.95,
    anonymousToken: "rotating-zone-token",
    observedAt: new Date().toISOString(),
  });
  const likely = submitSignalObservation({
    signalId: "intent-zone",
    source: "DISTANCE_SENSOR",
    kind: "PASSENGER_IN_BOARDING_ZONE",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    busService: "95",
    assistanceCandidates: [],
    confidence: 0.96,
    anonymousToken: "rotating-zone-token",
    observedAt: new Date().toISOString(),
  });
  assert.equal(likely.caseId, detected.caseId);
  assert.equal(likely.boardingIntent.decision, "LIKELY");
  assert.equal(likely.state, "NEEDS_CONFIRMATION");
  assert.equal(listPendingActuatorCommands().length, 0);

  const confirmed = applyOperatorAction(likely.caseId, "CONFIRM");
  assert.equal(confirmed.boardingIntent.decision, "CONFIRMED");
});

function explicitRamp(signalId: string, anonymousToken: string) {
  return submitSignalObservation({
    signalId,
    source: "APP",
    kind: "EXPLICIT_ASSISTANCE_REQUEST",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP"],
    confidence: 1,
    anonymousToken,
    observedAt: new Date().toISOString(),
  });
}

function telemetry(overrides: Record<string, unknown> = {}) {
  return {
    busId: "BUS-95-01",
    stopCode: "18331",
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    deploymentPathClear: true,
    rampPosition: "STOWED" as const,
    networkOnline: true,
    observedAt: new Date().toISOString(),
    ...overrides,
  } as Parameters<typeof ingestSafetyTelemetry>[0];
}
