import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importLegacyState } from "../services/legacyImport";
import { OperationsData } from "../services/operationsData";
import { openSqliteDatabase } from "../storage/sqlite";

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();
const skip = sqliteAvailable ? undefined : "node:sqlite is not available";

/** A small state in the shape the old whole-document store wrote. */
const legacyState = {
  cases: [
    {
      caseId: "CASE-OLD-1",
      stopCode: "18331",
      busId: "AV-095-01",
      phase: "BOARDING",
      state: "READY",
      intents: [{ intentId: "I1", signalId: "SIG-1" }],
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    },
    {
      caseId: "CASE-OLD-2",
      stopCode: "18331",
      phase: "BOARDING",
      state: "COMPLETED",
      intents: [],
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    },
  ],
  observations: [{ signalId: "SIG-1", source: "APP", idempotencyKey: "KEY-1" }],
  capabilities: [{ busId: "AV-095-01", busService: "95" }],
  safetyTelemetry: [{ busId: "AV-095-01", stopCode: "18331" }],
  actuatorCommands: [
    {
      commandId: "K-OPEN",
      caseId: "CASE-OLD-1",
      busId: "AV-095-01",
      command: "DEPLOY_RAMP",
    },
    {
      commandId: "K-DONE",
      caseId: "CASE-OLD-1",
      busId: "AV-095-01",
      command: "EXTEND_DWELL",
    },
  ],
  actuatorStatuses: [
    { commandId: "K-DONE", caseId: "CASE-OLD-1", state: "COMPLETED" },
  ],
  devices: [{ deviceId: "DEV-1" }],
  autonomousVehicles: [{ busId: "AV-095-01" }],
  rampObstacleClassifications: [{ busId: "AV-095-01" }],
  perceptionEvaluationSamples: [{ sampleId: "P1" }],
  precisionDockingObservations: [{ busId: "AV-095-01" }],
};

async function open(directory: string): Promise<OperationsData> {
  const data = new OperationsData(directory, {
    driver: "sqlite",
    retentionTimer: false,
    retention: {
      finishedCaseMaxAgeMs: 1e15,
      maxFinishedCases: 1e9,
      maxSeriesRecords: 1e9,
    },
  });
  await data.ready;
  return data;
}

async function assertImported(data: OperationsData): Promise<void> {
  assert.equal(await data.cases.count(), 2);
  assert.equal((await data.cases.get("CASE-OLD-1"))?.state, "READY");
  assert.equal(
    (await data.cases.findBySignalId("SIG-1"))?.caseId,
    "CASE-OLD-1",
  );
  assert.equal(
    (await data.observations.findOne("idempotencyKey", "KEY-1"))?.signalId,
    "SIG-1",
  );
  assert.equal((await data.capabilities.get("AV-095-01"))?.busService, "95");
  assert.equal(
    (await data.telemetry.findOne("stopCode", "18331"))?.busId,
    "AV-095-01",
  );
  assert.ok(await data.devices.get("DEV-1"));
  assert.ok(await data.vehicles.get("AV-095-01"));
  assert.ok(await data.rampClassifications.get("AV-095-01"));
  assert.ok(await data.perceptionSamples.get("P1"));
  assert.ok(await data.docking.get("AV-095-01"));
  // A command with a terminal status is closed; the other is still offered to the bus.
  assert.deepEqual(
    (await data.openCommands(10)).map((command) => command.commandId),
    ["K-OPEN"],
  );
}

test(
  "an old whole-state row in operations.sqlite is imported once and then removed",
  { skip },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-legacy-"));
    try {
      const old = openSqliteDatabase(join(directory, "operations.sqlite"));
      assert.ok(old);
      old.exec(
        "CREATE TABLE operations_state (id INTEGER PRIMARY KEY CHECK (id = 1), state_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
      );
      old
        .prepare(
          "INSERT INTO operations_state (id, state_json, updated_at) VALUES (1, ?, ?)",
        )
        .run(JSON.stringify(legacyState), new Date().toISOString());
      old.close();

      const first = await open(directory);
      await assertImported(first);
      first.close();

      const second = await open(directory);
      assert.equal(
        await second.cases.count(),
        2,
        "a second start must not import again",
      );
      second.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file.
      }
    }
  },
);

test(
  "an old operations.json is imported and renamed so it is not read again",
  { skip },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-legacy-"));
    try {
      writeFileSync(
        join(directory, "operations.json"),
        JSON.stringify(legacyState),
      );
      const first = await open(directory);
      await assertImported(first);
      first.close();
      assert.equal(existsSync(join(directory, "operations.json")), false);
      assert.ok(existsSync(join(directory, "operations.json.migrated")));
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file.
      }
    }
  },
);

test(
  "a corrupt old file is left in place and does not stop the server starting",
  { skip },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-legacy-"));
    try {
      writeFileSync(join(directory, "operations.json"), "{ not json");
      const data = await open(directory);
      assert.equal(await data.cases.count(), 0);
      assert.ok(existsSync(join(directory, "operations.json")));
      data.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file.
      }
    }
  },
);

test(
  "an import never overwrites a record that is already there, so a re-run cannot bring back old data",
  { skip },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-legacy-"));
    try {
      const data = await open(directory);
      // A newer version of a case, a device and a command status already exist.
      await data.cases.upsert({
        ...legacyState.cases[0],
        state: "COMPLETED",
      } as never);
      await data.devices.put({ deviceId: "DEV-1", note: "newer" } as never);
      await data.putCommand(legacyState.actuatorCommands[1] as never);
      await data.putStatus({
        commandId: "K-DONE",
        caseId: "CASE-OLD-1",
        state: "FAILED",
      } as never);
      const jsonPath = join(directory, "again.json");
      writeFileSync(jsonPath, JSON.stringify(legacyState));
      const scratch = openSqliteDatabase(":memory:")!; // holds no old table: only the file is read
      await importLegacyState(data, scratch, jsonPath);
      scratch.close();
      assert.equal((await data.cases.get("CASE-OLD-1"))?.state, "COMPLETED");
      assert.equal(
        ((await data.devices.get("DEV-1")) as { note?: string }).note,
        "newer",
      );
      assert.equal((await data.statuses.get("K-DONE"))?.state, "FAILED");
      // The records that were missing did arrive.
      assert.ok(await data.cases.get("CASE-OLD-2"));
      data.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file.
      }
    }
  },
);
