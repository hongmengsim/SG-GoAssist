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
import {
  closeOperationsData,
  configureOperationsData,
  getOperationsData,
} from "../services/operationsData";

let dataDirectory = "";

beforeEach(async () => {
  dataDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "goassist-operations-"),
  );
  await configureOperationsData(dataDirectory, { retentionTimer: false });
  await registerVehicleCapability({
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
  closeOperationsData();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

test("confirmed ramp intent cannot actuate until every safety interlock is clear", async () => {
  const item = await explicitRamp("signal-one", "passenger-one");
  assert.equal(item.state, "BLOCKED");
  assert.match(item.escalationReason ?? "", /telemetry is unavailable/i);
  assert.equal((await listPendingActuatorCommands("BUS-95-01")).length, 0);

  const blocked = await ingestSafetyTelemetry(
    telemetry({ deploymentPathClear: false }),
  );
  assert.equal(blocked.deploymentPathClear, false);
  assert.equal((await getCase(item.caseId))?.state, "BLOCKED");
  assert.match(
    (await getCase(item.caseId))?.escalationReason ?? "",
    /obstructed/i,
  );
  assert.equal((await listPendingActuatorCommands("BUS-95-01")).length, 0);

  await ingestSafetyTelemetry(telemetry());
  assert.equal((await getCase(item.caseId))?.state, "ACTUATING");
  assert.equal(
    (await listPendingActuatorCommands("BUS-95-01"))[0].command,
    "DEPLOY_RAMP",
  );
});

test("expired actuator commands are failed and can never be polled for execution", async () => {
  const item = await explicitRamp("signal-expired", "passenger-expired");
  await ingestSafetyTelemetry(telemetry());
  const command = (await listPendingActuatorCommands("BUS-95-01"))[0];

  const stored = (await (
    await getOperationsData()
  ).commands.get(command.commandId))!;
  await (
    await getOperationsData()
  ).commands.put({
    ...stored,
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });

  assert.equal((await listPendingActuatorCommands("BUS-95-01")).length, 0);
  const status = await (
    await getOperationsData()
  ).statuses.get(command.commandId);
  assert.equal(status?.state, "FAILED");
  assert.match(status?.detail ?? "", /expired/i);
  assert.equal((await getCase(item.caseId))?.state, "FAILED");

  await assert.rejects(
    async () =>
      await updateActuatorStatus({
        commandId: command.commandId,
        caseId: item.caseId,
        busId: "BUS-95-01",
        state: "COMPLETED",
        updatedAt: new Date().toISOString(),
      }),
    /terminal actuator status cannot be changed/i,
  );
});

test("ramp readiness requires both actuator completion and deployed limit switch", async () => {
  const item = await explicitRamp("signal-two", "passenger-two");
  await ingestSafetyTelemetry(telemetry());
  const command = (await listPendingActuatorCommands("BUS-95-01"))[0];

  const unverified = await updateActuatorStatus({
    commandId: command.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(unverified.state, "BLOCKED");

  await ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  assert.equal((await getCase(item.caseId))?.state, "READY");
});

test("sensor-only ramp detection needs confirmation and never stores image metadata", async () => {
  const observed = await submitSignalObservation({
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
  assert.equal((await listPendingActuatorCommands()).length, 0);

  await ingestSafetyTelemetry(telemetry());
  const confirmed = await applyOperatorAction(observed.caseId, "CONFIRM");
  assert.equal(confirmed.state, "ACTUATING");
});

test("multiple passengers share one actuator action without losing individual intent", async () => {
  const first = await explicitRamp("signal-a", "passenger-a");
  const second = await explicitRamp("signal-b", "passenger-b");
  assert.equal(second.caseId, first.caseId);
  assert.equal(second.intents.length, 2);
  assert.equal(second.passengerCount, 2);

  await ingestSafetyTelemetry(telemetry());
  assert.equal(
    (await listPendingActuatorCommands()).filter(
      (item) => item.command === "DEPLOY_RAMP",
    ).length,
    1,
  );
});

test("cases survive an operations-store reload", async () => {
  const item = await explicitRamp("signal-persist", "passenger-persist");
  await configureOperationsData(dataDirectory, { retentionTimer: false });
  assert.equal((await getCase(item.caseId, false))?.passengerCount, 1);
});

test("boarding completion retracts and verifies the ramp before closing the case", async () => {
  const item = await explicitRamp("signal-complete", "passenger-complete");
  await ingestSafetyTelemetry(telemetry());
  const deploy = (await listPendingActuatorCommands()).find(
    (command) => command.command === "DEPLOY_RAMP",
  )!;
  await ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  await updateActuatorStatus({
    commandId: deploy.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "DEPLOYED",
    updatedAt: new Date().toISOString(),
  });

  const completionDetected = await submitSignalObservation({
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
  const retract = (await listPendingActuatorCommands()).find(
    (command) => command.command === "RETRACT_RAMP",
  )!;
  assert.ok(retract);
  const awaitingLimitSwitch = await updateActuatorStatus({
    commandId: retract.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "STOWED",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(awaitingLimitSwitch.state, "ACTUATING");

  await ingestSafetyTelemetry(telemetry({ rampPosition: "STOWED" }));
  const completed = (await getCase(item.caseId))!;
  assert.equal(completed.state, "COMPLETED");
  assert.ok(completed.outcome.completionTimeMs !== undefined);
  assert.equal(
    (
      await synchronizeLegacyCaseStatus(
        item.caseId,
        AssistanceRequestStatus.CANCELLED,
      )
    ).state,
    "COMPLETED",
  );
  assert.equal(
    (await recordPassengerFeedback(item.caseId, 5)).outcome
      .passengerFeedbackScore,
    5,
  );
});

test("cancellation retracts a deployed ramp before becoming terminal", async () => {
  const item = await explicitRamp("signal-cancel", "passenger-cancel");
  await ingestSafetyTelemetry(telemetry());
  const deploy = (await listPendingActuatorCommands()).find(
    (command) => command.command === "DEPLOY_RAMP",
  )!;
  await ingestSafetyTelemetry(telemetry({ rampPosition: "DEPLOYED" }));
  await updateActuatorStatus({
    commandId: deploy.commandId,
    caseId: item.caseId,
    busId: "BUS-95-01",
    state: "COMPLETED",
    rampPosition: "DEPLOYED",
    updatedAt: new Date().toISOString(),
  });

  const cancelling = await applyOperatorAction(item.caseId, "CANCEL");
  assert.equal(cancelling.state, "ACTUATING");
  assert.equal(cancelling.boardingIntent.decision, "DECLINED");
  assert.ok(
    (await listPendingActuatorCommands()).some(
      (command) => command.command === "RETRACT_RAMP",
    ),
  );

  await ingestSafetyTelemetry(telemetry({ rampPosition: "STOWED" }));
  assert.equal((await getCase(item.caseId))?.state, "CANCELLED");
});

test("cancellation removes an unstarted deployment command", async () => {
  const item = await explicitRamp(
    "signal-cancel-early",
    "passenger-cancel-early",
  );
  await ingestSafetyTelemetry(telemetry());
  assert.ok(
    (await listPendingActuatorCommands()).some(
      (command) => command.command === "DEPLOY_RAMP",
    ),
  );

  const cancelled = await applyOperatorAction(item.caseId, "CANCEL");
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(
    (await listPendingActuatorCommands()).filter(
      (command) => command.command === "DEPLOY_RAMP",
    ).length,
    0,
  );
});

test("sensor fusion can mark intent likely but never confirmed without consent", async () => {
  const detected = await submitSignalObservation({
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
  const likely = await submitSignalObservation({
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
  assert.equal((await listPendingActuatorCommands()).length, 0);

  const confirmed = await applyOperatorAction(likely.caseId, "CONFIRM");
  assert.equal(confirmed.boardingIntent.decision, "CONFIRMED");
});

async function explicitRamp(signalId: string, anonymousToken: string) {
  return await submitSignalObservation({
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
