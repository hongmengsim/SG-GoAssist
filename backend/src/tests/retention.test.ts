import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ActuatorCommand,
  ActuatorStatus,
  AssistanceCase,
  SignalObservation,
} from "@buspass/shared";
import {
  DEFAULT_RETENTION_POLICY,
  retentionPolicyFromEnv,
  type RetentionPolicy,
} from "../services/retention";
import { OperationsData } from "../services/operationsData";
import { openSqliteDatabase } from "../storage/sqlite";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (ageMs: number) => new Date(NOW - ageMs).toISOString();

const policy: RetentionPolicy = {
  finishedCaseMaxAgeMs: 7 * DAY,
  maxFinishedCases: 3,
  maxSeriesRecords: 4,
};

const sqliteAvailable = (() => {
  const database = openSqliteDatabase(":memory:");
  database?.close();
  return database !== undefined;
})();

function makeCase(
  id: string,
  state: AssistanceCase["state"],
  ageMs: number,
): AssistanceCase {
  return {
    caseId: id,
    stopCode: "18331",
    busId: "AV-095-01",
    phase: "BOARDING",
    intents: [],
    state,
    createdAt: at(ageMs + 1000),
    updatedAt: at(ageMs),
  } as unknown as AssistanceCase;
}

const command = (id: string, caseId: string): ActuatorCommand =>
  ({
    commandId: id,
    caseId,
    busId: "AV-095-01",
    command: "DEPLOY_RAMP",
  }) as unknown as ActuatorCommand;

const status = (id: string, caseId: string): ActuatorStatus =>
  ({
    commandId: id,
    caseId,
    busId: "AV-095-01",
    state: "COMPLETED",
  }) as unknown as ActuatorStatus;

const observation = (n: number): SignalObservation =>
  ({
    signalId: `S${n}`,
    source: "APP",
    observedAt: at(-n * 1000),
  }) as unknown as SignalObservation;

for (const driver of ["memory", "sqlite"]) {
  const options = {
    skip:
      driver === "sqlite" && !sqliteAvailable
        ? "node:sqlite is not available"
        : undefined,
  };

  function withData(
    retention: RetentionPolicy,
    work: (data: OperationsData, directory: string) => void,
  ) {
    const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
    const data = new OperationsData(directory, {
      retention,
      driver,
      retentionTimer: false,
    });
    try {
      work(data, directory);
    } finally {
      data.close();
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file; the temp directory is disposable.
      }
    }
  }

  test(
    `retention (${driver}): a finished case older than the limit is archived and removed`,
    options,
    () => {
      withData(policy, (data) => {
        data.cases.upsert(makeCase("OLD-DONE", "COMPLETED", 8 * DAY));
        data.cases.upsert(makeCase("NEW-DONE", "COMPLETED", 1 * DAY));
        assert.equal(data.runRetention(NOW), 1);
        assert.equal(data.cases.get("OLD-DONE"), undefined);
        assert.ok(data.cases.get("NEW-DONE"));
        const lines = readFileSync(data.archivePath, "utf8")
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as {
                archivedAt: string;
                case: { caseId: string };
              },
          );
        assert.deepEqual(
          lines.map((line) => line.case.caseId),
          ["OLD-DONE"],
        );
        assert.ok(Date.parse(lines[0].archivedAt) > 0);
      });
    },
  );

  test(
    `retention (${driver}): a case that still needs someone is never removed, however old`,
    options,
    () => {
      withData(policy, (data) => {
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
        for (const name of open)
          data.cases.upsert(makeCase(name, name, 400 * DAY));
        assert.equal(data.runRetention(NOW), 0);
        assert.equal(data.cases.count(), open.length);
      });
    },
  );

  test(
    `retention (${driver}): failed and cancelled cases count as finished`,
    options,
    () => {
      withData(policy, (data) => {
        data.cases.upsert(makeCase("F", "FAILED", 9 * DAY));
        data.cases.upsert(makeCase("C", "CANCELLED", 9 * DAY));
        assert.equal(data.runRetention(NOW), 2);
        assert.equal(data.cases.count(), 0);
      });
    },
  );

  test(
    `retention (${driver}): only the newest finished cases stay when there are too many`,
    options,
    () => {
      withData(policy, (data) => {
        for (const n of [1, 2, 3, 4, 5])
          data.cases.upsert(makeCase(`D${n}`, "COMPLETED", n * 60 * 1000));
        assert.equal(data.runRetention(NOW), 2);
        assert.deepEqual(
          data.cases
            .list({ limit: 10 })
            .map((item) => item.caseId)
            .sort(),
          ["D1", "D2", "D3"],
        );
      });
    },
  );

  test(
    `retention (${driver}): commands and statuses of a removed case go with it and are archived with it`,
    options,
    () => {
      withData(policy, (data) => {
        data.cases.upsert(makeCase("GONE", "COMPLETED", 9 * DAY));
        data.cases.upsert(makeCase("STAYS", "COMPLETED", 1 * DAY));
        data.putCommand(command("K1", "GONE"));
        data.putCommand(command("K2", "STAYS"));
        data.putStatus(status("K1", "GONE"));
        data.putStatus(status("K2", "STAYS"));
        data.runRetention(NOW);
        assert.equal(data.commands.get("K1"), undefined);
        assert.equal(data.statuses.get("K1"), undefined);
        assert.ok(data.commands.get("K2"));
        assert.ok(data.statuses.get("K2"));
        const archived = JSON.parse(
          readFileSync(data.archivePath, "utf8").trim(),
        ) as { commands: unknown[]; statuses: unknown[] };
        assert.equal(archived.commands.length, 1);
        assert.equal(archived.statuses.length, 1);
      });
    },
  );

  test(
    `retention (${driver}): a growing series keeps only its newest records`,
    options,
    () => {
      withData(policy, (data) => {
        for (const n of [1, 2, 3, 4, 5, 6])
          data.observations.put(observation(n));
        data.runRetention(NOW);
        assert.deepEqual(
          data.observations.list(10).map((item) => item.signalId),
          ["S3", "S4", "S5", "S6"],
        );
      });
    },
  );

  test(
    `retention (${driver}): one-row-per-thing tables are never trimmed`,
    options,
    () => {
      withData(policy, (data) => {
        for (let n = 0; n < 20; n += 1) {
          data.capabilities.put({ busId: `B${n}` } as never);
          data.devices.put({ deviceId: `D${n}` } as never);
        }
        data.runRetention(NOW);
        assert.equal(data.capabilities.count(), 20);
        assert.equal(data.devices.count(), 20);
      });
    },
  );

  test(
    `retention (${driver}): running it again with nothing to remove changes nothing`,
    options,
    () => {
      withData(policy, (data) => {
        data.cases.upsert(makeCase("A", "COMPLETED", 1 * DAY));
        assert.equal(data.runRetention(NOW), 0);
        assert.equal(data.cases.count(), 1);
        assert.equal(existsSync(data.archivePath), false);
      });
    },
  );

  test(
    `retention (${driver}): reset removes the archive with the other files`,
    options,
    () => {
      withData(policy, (data) => {
        data.cases.upsert(makeCase("OLD", "COMPLETED", 9 * DAY));
        data.runRetention(NOW);
        assert.ok(existsSync(data.archivePath));
        data.reset(true);
        assert.equal(existsSync(data.archivePath), false);
      });
    },
  );
}

test(
  "a store that opens with more than the policy allows trims it at once",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
    const roomy: RetentionPolicy = {
      finishedCaseMaxAgeMs: 400 * DAY,
      maxFinishedCases: 100,
      maxSeriesRecords: 100,
    };
    try {
      const first = new OperationsData(directory, {
        retention: roomy,
        driver: "sqlite",
        retentionTimer: false,
      });
      for (let n = 1; n <= 6; n += 1)
        first.cases.upsert(
          makeCase(`X${n}`, "COMPLETED", n * 60 * 1000 + 8 * DAY),
        );
      first.close();
      const strict = new OperationsData(directory, {
        retention: { ...roomy, maxFinishedCases: 2 },
        driver: "sqlite",
        retentionTimer: false,
      });
      assert.equal(strict.cases.count(), 2);
      assert.ok(existsSync(strict.archivePath));
      strict.close();
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows may still hold the database file.
      }
    }
  },
);

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
