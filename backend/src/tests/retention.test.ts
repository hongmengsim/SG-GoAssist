import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from "node:fs";
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

  async function withData(
    retention: RetentionPolicy,
    work: (data: OperationsData, directory: string) => Promise<void>,
  ) {
    const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
    const data = new OperationsData(directory, {
      retention,
      driver,
      retentionTimer: false,
    });
    try {
      await data.ready;
      await work(data, directory);
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
    async () => {
      await withData(policy, async (data) => {
        await data.cases.upsert(makeCase("OLD-DONE", "COMPLETED", 8 * DAY));
        await data.cases.upsert(makeCase("NEW-DONE", "COMPLETED", 1 * DAY));
        assert.equal(await data.runRetention(NOW), 1);
        assert.equal(await data.cases.get("OLD-DONE"), undefined);
        assert.ok(await data.cases.get("NEW-DONE"));
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
    async () => {
      await withData(policy, async (data) => {
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
          await data.cases.upsert(makeCase(name, name, 400 * DAY));
        assert.equal(await data.runRetention(NOW), 0);
        assert.equal(await data.cases.count(), open.length);
      });
    },
  );

  test(
    `retention (${driver}): failed and cancelled cases count as finished`,
    options,
    async () => {
      await withData(policy, async (data) => {
        await data.cases.upsert(makeCase("F", "FAILED", 9 * DAY));
        await data.cases.upsert(makeCase("C", "CANCELLED", 9 * DAY));
        assert.equal(await data.runRetention(NOW), 2);
        assert.equal(await data.cases.count(), 0);
      });
    },
  );

  test(
    `retention (${driver}): only the newest finished cases stay when there are too many`,
    options,
    async () => {
      await withData(policy, async (data) => {
        for (const n of [1, 2, 3, 4, 5])
          await data.cases.upsert(
            makeCase(`D${n}`, "COMPLETED", n * 60 * 1000),
          );
        assert.equal(await data.runRetention(NOW), 2);
        assert.deepEqual(
          (await data.cases.list({ limit: 10 }))
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
    async () => {
      await withData(policy, async (data) => {
        await data.cases.upsert(makeCase("GONE", "COMPLETED", 9 * DAY));
        await data.cases.upsert(makeCase("STAYS", "COMPLETED", 1 * DAY));
        await data.putCommand(command("K1", "GONE"));
        await data.putCommand(command("K2", "STAYS"));
        await data.putStatus(status("K1", "GONE"));
        await data.putStatus(status("K2", "STAYS"));
        await data.runRetention(NOW);
        assert.equal(await data.commands.get("K1"), undefined);
        assert.equal(await data.statuses.get("K1"), undefined);
        assert.ok(await data.commands.get("K2"));
        assert.ok(await data.statuses.get("K2"));
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
    async () => {
      await withData(policy, async (data) => {
        for (const n of [1, 2, 3, 4, 5, 6])
          await data.observations.put(observation(n));
        await data.runRetention(NOW);
        assert.deepEqual(
          (await data.observations.list(10)).map((item) => item.signalId),
          ["S3", "S4", "S5", "S6"],
        );
      });
    },
  );

  test(
    `retention (${driver}): one-row-per-thing tables are never trimmed`,
    options,
    async () => {
      await withData(policy, async (data) => {
        for (let n = 0; n < 20; n += 1) {
          await data.capabilities.put({ busId: `B${n}` } as never);
          await data.devices.put({ deviceId: `D${n}` } as never);
        }
        await data.runRetention(NOW);
        assert.equal(await data.capabilities.count(), 20);
        assert.equal(await data.devices.count(), 20);
      });
    },
  );

  test(
    `retention (${driver}): running it again with nothing to remove changes nothing`,
    options,
    async () => {
      await withData(policy, async (data) => {
        await data.cases.upsert(makeCase("A", "COMPLETED", 1 * DAY));
        assert.equal(await data.runRetention(NOW), 0);
        assert.equal(await data.cases.count(), 1);
        assert.equal(existsSync(data.archivePath), false);
      });
    },
  );

  test(
    `retention (${driver}): reset removes the archive with the other files`,
    options,
    async () => {
      await withData(policy, async (data) => {
        await data.cases.upsert(makeCase("OLD", "COMPLETED", 9 * DAY));
        await data.runRetention(NOW);
        assert.ok(existsSync(data.archivePath));
        await data.reset(true);
        assert.equal(existsSync(data.archivePath), false);
      });
    },
  );
}

test(
  "a store that opens with more than the policy allows trims it at once",
  { skip: sqliteAvailable ? undefined : "node:sqlite is not available" },
  async () => {
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
      await first.ready;
      for (let n = 1; n <= 6; n += 1)
        await first.cases.upsert(
          makeCase(`X${n}`, "COMPLETED", n * 60 * 1000 + 8 * DAY),
        );
      first.close();
      const strict = new OperationsData(directory, {
        retention: { ...roomy, maxFinishedCases: 2 },
        driver: "sqlite",
        retentionTimer: false,
      });
      await strict.ready;
      assert.equal(await strict.cases.count(), 2);
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

// ---- review fixes (1 Oct 2026) ----

test("commands and statuses are removed only with their case: a long-open case keeps its deploy command however many others exist", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const data = new OperationsData(directory, {
      retention: {
        finishedCaseMaxAgeMs: 400 * DAY,
        maxFinishedCases: 1000,
        maxSeriesRecords: 3,
      },
      driver: "memory",
      retentionTimer: false,
    });
    await data.ready;
    await data.cases.upsert(makeCase("LONG-OPEN", "BLOCKED", 30 * DAY));
    await data.putCommand(command("K-OPEN", "LONG-OPEN"));
    for (let n = 0; n < 10; n += 1) {
      await data.cases.upsert(makeCase(`DONE-${n}`, "COMPLETED", 60 * 1000));
      await data.putCommand(command(`K-${n}`, `DONE-${n}`));
      await data.putStatus(status(`K-${n}`, `DONE-${n}`));
    }
    await data.runRetention(NOW);
    assert.ok(
      await data.commands.get("K-OPEN"),
      "the open case still has its command",
    );
    assert.equal(
      await data.commands.count(),
      11,
      "no command was trimmed away from a live or finished case",
    );
    data.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a case that an operator revived after it was listed is not deleted, and nothing is archived twice", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const data = new OperationsData(directory, {
      retention: {
        finishedCaseMaxAgeMs: 7 * DAY,
        maxFinishedCases: 1000,
        maxSeriesRecords: 100,
      },
      driver: "memory",
      retentionTimer: false,
    });
    await data.ready;
    await data.cases.upsert(makeCase("REVIVED", "COMPLETED", 9 * DAY));
    await data.cases.upsert(makeCase("GONE", "COMPLETED", 9 * DAY));
    // Between the listing and the delete, the operator reopens one of the two.
    const real = data.cases.listFinishedBefore.bind(data.cases);
    data.cases.listFinishedBefore = async (iso, limit) => {
      const listed = await real(iso, limit);
      await data.cases.upsert(makeCase("REVIVED", "ESCALATED", 1 * 60 * 1000));
      return listed;
    };
    await Promise.all([data.runRetention(NOW), data.runRetention(NOW)]);
    assert.ok(await data.cases.get("REVIVED"), "an open case must survive");
    assert.equal(await data.cases.get("GONE"), undefined);
    const archived = readFileSync(data.archivePath, "utf8").trim().split("\n");
    assert.equal(
      archived.length,
      1,
      "each removed case is archived exactly once",
    );
    data.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the archive holds no passenger token and is readable only by its owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const data = new OperationsData(directory, {
      retention: {
        finishedCaseMaxAgeMs: 7 * DAY,
        maxFinishedCases: 1000,
        maxSeriesRecords: 100,
      },
      driver: "memory",
      retentionTimer: false,
    });
    await data.ready;
    await data.cases.upsert({
      ...makeCase("TOKENS", "COMPLETED", 9 * DAY),
      intents: [
        {
          intentId: "I1",
          signalId: "S1",
          anonymousToken: "passenger-secret-token",
        },
      ],
    } as unknown as AssistanceCase);
    await data.runRetention(NOW);
    const text = readFileSync(data.archivePath, "utf8");
    assert.ok(!text.includes("passenger-secret-token"));
    assert.ok(text.includes("TOKENS"));
    if (process.platform !== "win32")
      assert.equal(statSync(data.archivePath).mode & 0o077, 0);
    data.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a finished case takes its observations with it", async () => {
  const directory = mkdtempSync(join(tmpdir(), "goassist-retention-"));
  try {
    const data = new OperationsData(directory, {
      retention: {
        finishedCaseMaxAgeMs: 7 * DAY,
        maxFinishedCases: 1000,
        maxSeriesRecords: 100,
      },
      driver: "memory",
      retentionTimer: false,
    });
    await data.ready;
    await data.cases.upsert({
      ...makeCase("WITH-SIGNAL", "COMPLETED", 9 * DAY),
      intents: [{ intentId: "I1", signalId: "S-OWN" }],
    } as unknown as AssistanceCase);
    await data.observations.put(observation(1));
    await data.observations.put({ ...observation(2), signalId: "S-OWN" });
    await data.runRetention(NOW);
    assert.equal(await data.observations.get("S-OWN"), undefined);
    assert.ok(
      await data.observations.get("S1"),
      "an unrelated observation stays",
    );
    data.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
