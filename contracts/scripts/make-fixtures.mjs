#!/usr/bin/env node
/**
 * Writes the shared valid and invalid example messages to contracts/fixtures. Both the
 * TypeScript test (schemas.test.mjs) and the Python test (python/test_schemas.py) read
 * them, so a rename or removal that one side misses fails on the other.
 *
 * File names are <Type>.<label>.json; the type selects the schema.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = "2026-09-30T00:00:00.000Z";

const busStatus = {
  busService: "95",
  stopCode: "18331",
  bayId: "BAY-1",
  movement: "POSITIONED_AT_STOP",
  simulated: true,
  observedAt: T,
};
const ramp = { state: "DEPLOYING", simulated: true, observedAt: T };
const halt = {
  zoneState: "OCCUPIED",
  permission: "HALT",
  reasons: ["OBJECT_IN_ZONE", "TOF_BLOCKED"],
  tof: { state: "BLOCKED", distanceMm: 340, simulated: true },
  camera: { imageOk: true },
  objectsInZone: [{ className: "person", safety: "UNSAFE", confidence: 0.93 }],
  simulated: true,
  observedAt: T,
};
const clear = {
  zoneState: "CLEAR",
  permission: "CONTINUE",
  reasons: [],
  tof: { state: "BEAM_CLEAR", simulated: true },
  camera: { imageOk: true },
  objectsInZone: [],
  simulated: true,
  observedAt: T,
};
const help = {
  reason: "DEPLOYMENT_TIMEOUT",
  state: "DEPLOYING",
  detail: "Ramp did not finish",
  observedAt: T,
};
const telemetry = {
  stopCode: "18331",
  vehicleStopped: true,
  parkingBrakeActive: true,
  doorOpen: true,
  deploymentPathClear: false,
  rampPosition: "STOWED",
  networkOnline: true,
  observedAt: T,
};
const request = {
  requestId: "REQ-20260930-ABC123",
  busId: "AV-095-01",
  busService: "95",
  boardingStop: "18301",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  boardingOrAlighting: "BOARDING",
  createdAt: T,
};
const bay = {
  stopCode: "18331",
  bayId: "BAY-1",
  occupantBusId: "AV-095-01",
  waitingBusIds: ["AV-095-02"],
  grantedBusId: null,
  updatedAt: T,
};

const valid = {
  "BusStatusReport.positioned": busStatus,
  "BusStatusReport.minimal": {
    busService: "95",
    movement: "DEPARTING",
    simulated: false,
    observedAt: T,
  },
  "RampSimulationReport.deploying": ramp,
  "RampSimulationReport.halted": {
    state: "HALTED",
    simulated: true,
    haltReasons: ["OBJECT_IN_ZONE"],
    caseId: "CASE-1",
    observedAt: T,
  },
  "RampSafetyReport.halt": halt,
  "RampSafetyReport.continue": clear,
  "HelpRequiredReport.timeout": help,
  "SafetyTelemetryReport.blocked": telemetry,
  "AssistRequestForBus.wheelchair": request,
  "BayStatus.queue": bay,
  "OperatorStatusUpdateMessage.bus_status": {
    type: "BUS_STATUS",
    status: { busId: "AV-095-01", ...busStatus },
    timestamp: T,
  },
  "OperatorStatusUpdateMessage.bay_status": {
    type: "BAY_STATUS",
    bay,
    timestamp: T,
  },
  "OperatorStatusUpdateMessage.assist_requested": {
    type: "ASSIST_REQUESTED",
    request,
    timestamp: T,
  },
  "OperatorStatusUpdateMessage.ramp": {
    type: "RAMP_SIMULATION",
    ramp: { busId: "AV-095-01", ...ramp },
    timestamp: T,
  },
};

const invalid = {
  "BusStatusReport.unknown_movement": { ...busStatus, movement: "FLYING" },
  "BusStatusReport.renamed_field": {
    busService: "95",
    movementState: "DEPARTING",
    simulated: true,
    observedAt: T,
  },
  "BusStatusReport.missing_time": {
    busService: "95",
    movement: "DEPARTING",
    simulated: true,
  },
  "BusStatusReport.wrong_type": { ...busStatus, simulated: "yes" },
  "RampSimulationReport.physical_ramp": {
    state: "DEPLOYED",
    simulated: false,
    observedAt: T,
  },
  "RampSimulationReport.unknown_state": {
    state: "MELTED",
    simulated: true,
    observedAt: T,
  },
  "RampSafetyReport.unknown_reason": { ...halt, reasons: ["BORED"] },
  "RampSafetyReport.extra_field": { ...clear, confidenceScore: 1 },
  "RampSafetyReport.bad_tof_state": {
    ...clear,
    tof: { state: "MAYBE", simulated: true },
  },
  "HelpRequiredReport.unknown_reason": { ...help, reason: "BORED" },
  "SafetyTelemetryReport.missing_path_flag": {
    stopCode: "18331",
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    rampPosition: "STOWED",
    observedAt: T,
  },
  "AssistRequestForBus.passenger_identity": { ...request, sessionId: "secret" },
  "BayStatus.queue_not_a_list": { ...bay, waitingBusIds: "AV-095-02" },
  "OperatorStatusUpdateMessage.unknown_type": {
    type: "NOT_A_MESSAGE",
    timestamp: T,
  },
};

for (const [kind, set] of [
  ["valid", valid],
  ["invalid", invalid],
]) {
  const directory = join(root, "fixtures", kind);
  mkdirSync(directory, { recursive: true });
  for (const [name, body] of Object.entries(set)) {
    writeFileSync(
      join(directory, `${name}.json`),
      `${JSON.stringify(body, null, 2)}\n`,
      "utf8",
    );
  }
}
console.log("Fixtures written.");
