import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistanceCase } from "@buspass/shared";
import {
  DEFAULT_RETENTION_POLICY,
  applyRetention,
  retentionPolicyFromEnv,
  type RetentionPolicy,
} from "../services/retention";
import {
  OperationsStore,
  type OperationsState,
} from "../services/operationsStore";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (ageMs: number) => new Date(NOW - ageMs).toISOString();

const policy: RetentionPolicy = {
  finishedCaseMaxAgeMs: 7 * DAY,
  maxFinishedCases: 3,
  maxSeriesRecords: 4,
};

function makeCase(
  id: string,
  state: AssistanceCase["state"],
  ageMs: number,
): AssistanceCase {
  return {
    caseId: id,
    busId: "AV-095-01",
    state,
    createdAt: at(ageMs + 1000),
    updatedAt: at(ageMs),
  } as unknown as AssistanceCase;
}

function makeState(overrides: Partial<OperationsState> = {}): OperationsState {
  return {
    cases: [],
    observations: [],
    capabilities: [],
    safetyTelemetry: [],
    actuatorCommands: [],
    actuatorStatuses: [],
    devices: [],
    autonomousVehicles: [],
    rampObstacleClassifications: [],
    perceptionEvaluationSamples: [],
    precisionDockingObservations: [],
    ...overrides,
  };
}

test("a finished case older than the limit is removed and handed back to be archived", () => {
  const state = makeState({
    cases: [
      makeCase("OLD-DONE", "COMPLETED", 8 * DAY),
      makeCase("NEW-DONE", "COMPLETED", 1 * DAY),
    ],
  });
  const result = applyRetention(state, policy, NOW);
  assert.deepEqual(
    result.state.cases.map((item) => item.caseId),
    ["NEW-DONE"],
  );
  assert.deepEqual(
    result.archived.map((entry) => entry.case.caseId),
    ["OLD-DONE"],
  );
});

test("a case that still needs someone is never removed, however old", () => {
  const open = [
    "REQUESTED",
    "VALIDATED",
    "VEHICLE_ASSIGNED",
    "SAFE_TO_ACTUATE",
    "ACTUATING",
    "READY",
    "NEEDS_CONFIRMATION",
    "ESCALATED",
    "BLOCKED",
  ] as const;
  const state = makeState({
    cases: open.map((name) => makeCase(name, name, 400 * DAY)),
  });
  const result = applyRetention(state, policy, NOW);
  assert.equal(result.state.cases.length, open.length);
  assert.equal(result.archived.length, 0);
});

test("failed and cancelled cases count as finished", () => {
  const state = makeState({
    cases: [
      makeCase("F", "FAILED", 9 * DAY),
      makeCase("C", "CANCELLED", 9 * DAY),
    ],
  });
  assert.equal(applyRetention(state, policy, NOW).state.cases.length, 0);
});

test("only the newest finished cases are kept when there are too many", () => {
  const state = makeState({
    cases: [1, 2, 3, 4, 5].map((n) =>
      makeCase(`D${n}`, "COMPLETED", n * 60 * 1000),
    ),
  });
  const result = applyRetention(state, policy, NOW);
  assert.deepEqual(
    result.state.cases.map((item) => item.caseId),
    ["D1", "D2", "D3"],
  );
  assert.deepEqual(result.archived.map((entry) => entry.case.caseId).sort(), [
    "D4",
    "D5",
  ]);
});

test("commands and statuses of a removed case go with it and are archived with it", () => {
  const state = makeState({
    cases: [
      makeCase("GONE", "COMPLETED", 9 * DAY),
      makeCase("STAYS", "COMPLETED", 1 * DAY),
    ],
    actuatorCommands: [
      { commandId: "K1", caseId: "GONE" },
      { commandId: "K2", caseId: "STAYS" },
    ] as unknown as OperationsState["actuatorCommands"],
    actuatorStatuses: [
      { commandId: "K1", caseId: "GONE" },
      { commandId: "K2", caseId: "STAYS" },
    ] as unknown as OperationsState["actuatorStatuses"],
  });
  const result = applyRetention(state, policy, NOW);
  assert.deepEqual(
    result.state.actuatorCommands.map((item) => item.commandId),
    ["K2"],
  );
  assert.deepEqual(
    result.state.actuatorStatuses.map((item) => item.commandId),
    ["K2"],
  );
  assert.equal(result.archived[0].commands.length, 1);
  assert.equal(result.archived[0].statuses.length, 1);
});

test("a series keeps only its newest records", () => {
  const records = [1, 2, 3, 4, 5, 6].map((n) => ({
    signalId: `S${n}`,
    observedAt: at(-n * 1000),
  }));
  const state = makeState({
    observations: records as unknown as OperationsState["observations"],
    safetyTelemetry: records as unknown as OperationsState["safetyTelemetry"],
    perceptionEvaluationSamples:
      records as unknown as OperationsState["perceptionEvaluationSamples"],
  });
  const result = applyRetention(state, policy, NOW);
  assert.equal(result.state.observations.length, 4);
  assert.equal(
    (result.state.observations[3] as unknown as { signalId: string }).signalId,
    "S6",
  );
  assert.equal(result.state.safetyTelemetry.length, 4);
  assert.equal(result.state.perceptionEvaluationSamples.length, 4);
});

test("capabilities, devices and vehicle state are one row per thing and are never trimmed", () => {
  const many = (prefix: string) =>
    Array.from({ length: 20 }, (_, n) => ({ id: `${prefix}${n}` }));
  const state = makeState({
    capabilities: many("C") as unknown as OperationsState["capabilities"],
    devices: many("D") as unknown as OperationsState["devices"],
    autonomousVehicles: many(
      "A",
    ) as unknown as OperationsState["autonomousVehicles"],
  });
  const result = applyRetention(state, policy, NOW);
  assert.equal(result.state.capabilities.length, 20);
  assert.equal(result.state.devices.length, 20);
  assert.equal(result.state.autonomousVehicles.length, 20);
});

test("nothing to remove gives back the same records and an empty archive", () => {
  const state = makeState({
    cases: [makeCase("A", "COMPLETED", 1 * DAY)],
  });
  const result = applyRetention(state, policy, NOW);
  assert.equal(result.archived.length, 0);
  assert.equal(result.state.cases.length, 1);
});

test("the input state is not changed", () => {
  const state = makeState({
    cases: [makeCase("OLD", "COMPLETED", 9 * DAY)],
  });
  applyRetention(state, policy, NOW);
  assert.equal(state.cases.length, 1);
});

test("the policy comes from the environment, and a bad value falls back to the default", () => {
  const set = retentionPolicyFromEnv({
    GOASSIST_RETENTION_CASE_DAYS: "2",
    GOASSIST_RETENTION_MAX_FINISHED_CASES: "50",
    GOASSIST_RETENTION_MAX_SERIES_RECORDS: "700",
  });
  assert.equal(set.finishedCaseMaxAgeMs, 2 * DAY);
  assert.equal(set.maxFinishedCases, 50);
  assert.equal(set.maxSeriesRecords, 700);
  const bad = retentionPolicyFromEnv({
    GOASSIST_RETENTION_CASE_DAYS: "soon",
    GOASSIST_RETENTION_MAX_FINISHED_CASES: "-4",
    GOASSIST_RETENTION_MAX_SERIES_RECORDS: "0",
  });
  assert.deepEqual(bad, DEFAULT_RETENTION_POLICY);
  assert.deepEqual(retentionPolicyFromEnv({}), DEFAULT_RETENTION_POLICY);
});

test("the store applies the policy on every update and archives what it removes", () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const store = new OperationsStore(directory, {
      finishedCaseMaxAgeMs: 7 * DAY,
      maxFinishedCases: 2,
      maxSeriesRecords: 100,
    });
    for (let n = 1; n <= 4; n += 1) {
      store.update((state) => {
        state.cases.push(
          makeCase(`R${n}`, "COMPLETED", (5 - n) * 60 * 1000 + DAY),
        );
      });
    }
    const kept = store.snapshot().cases.map((item) => item.caseId);
    assert.deepEqual(kept.sort(), ["R3", "R4"]);
    const lines = readFileSync(store.archivePath, "utf8")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as { archivedAt: string; case: { caseId: string } },
      );
    assert.deepEqual(lines.map((line) => line.case.caseId).sort(), [
      "R1",
      "R2",
    ]);
    assert.ok(lines.every((line) => Date.parse(line.archivedAt) > 0));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a store that opens with more than the policy allows trims it at once", () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const roomy = new OperationsStore(directory, {
      finishedCaseMaxAgeMs: 400 * DAY,
      maxFinishedCases: 100,
      maxSeriesRecords: 100,
    });
    roomy.update((state) => {
      for (let n = 1; n <= 6; n += 1)
        state.cases.push(makeCase(`X${n}`, "COMPLETED", n * 60 * 1000));
    });
    const strict = new OperationsStore(directory, {
      finishedCaseMaxAgeMs: 400 * DAY,
      maxFinishedCases: 2,
      maxSeriesRecords: 100,
    });
    assert.equal(strict.snapshot().cases.length, 2);
    assert.ok(existsSync(strict.archivePath));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reset can remove the archive with the other files", () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const store = new OperationsStore(directory, {
      finishedCaseMaxAgeMs: 1,
      maxFinishedCases: 1,
      maxSeriesRecords: 10,
    });
    store.update((state) => {
      state.cases.push(makeCase("OLD", "COMPLETED", 5 * DAY));
    });
    assert.ok(existsSync(store.archivePath));
    store.reset(true);
    assert.equal(existsSync(store.archivePath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
