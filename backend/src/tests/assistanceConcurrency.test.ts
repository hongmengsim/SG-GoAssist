import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { InProcessKeyedLock, type KeyedLock } from "../concurrency/keyedLock";
import { configureLock } from "../concurrency/locks";
import {
  listCases,
  registerVehicleCapability,
  submitSignalObservation,
} from "../services/assistanceCaseService";
import {
  closeOperationsData,
  configureOperationsData,
} from "../services/operationsData";

let dataDirectory = "";

/** Runs work at once with no exclusion: what the code had after going asynchronous. */
const noLock: KeyedLock = { run: (_key, work) => work() };

beforeEach(async () => {
  dataDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "goassist-concurrency-"),
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
    supportedTelemetry: ["vehicleStopped"],
    updatedAt: new Date().toISOString(),
  });
});

afterEach(() => {
  configureLock(new InProcessKeyedLock());
  closeOperationsData();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

const request = (n: number) =>
  submitSignalObservation({
    signalId: `signal-${n}`,
    source: "APP",
    kind: "EXPLICIT_ASSISTANCE_REQUEST",
    stopCode: "18331",
    busCandidate: "BUS-95-01",
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP"],
    confidence: 1,
    anonymousToken: `passenger-${n}`,
    observedAt: new Date().toISOString(),
  });

const PASSENGERS = 20;

test("passengers who ask at the same moment all end up on one case, with nobody lost", async () => {
  configureLock(new InProcessKeyedLock());
  await Promise.all(Array.from({ length: PASSENGERS }, (_, n) => request(n)));
  const cases = await listCases({ refresh: false });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].intents.length, PASSENGERS);
  assert.equal(cases[0].passengerCount, PASSENGERS);
});

test("without the lock the same burst splits cases or loses passengers (the control)", async () => {
  configureLock(noLock);
  await Promise.all(Array.from({ length: PASSENGERS }, (_, n) => request(n)));
  const cases = await listCases({ refresh: false });
  const intents = cases.reduce((sum, item) => sum + item.intents.length, 0);
  assert.ok(
    cases.length > 1 || intents < PASSENGERS,
    `expected the race to show: ${cases.length} cases, ${intents} intents`,
  );
});
