import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BusOperationsService,
  BusOperationsValidationError,
} from "../busOperations/busOperationsService";
import {
  BusReportsService,
  REPORT_KINDS,
  type AnyReport,
} from "../busOperations/busReports";
import {
  MemoryBayRepository,
  MemoryBusStatusRepository,
} from "../busOperations/memoryRepositories";
import { MemoryBusRecordRepository } from "../busOperations/busRecordRepositories";

/**
 * The fixtures in contracts/fixtures are shared with the JSON Schema tests in both
 * languages. Every valid bus report there must also be accepted by the backend's own
 * validation, so the schema and the backend cannot drift apart unnoticed.
 */
const FIXTURES = resolve(__dirname, "../../../contracts/fixtures");
const NOW = Date.parse("2026-09-30T00:10:00.000Z");
const BUS = "AV-095-01";

function fixtures(kind: string, prefix: string) {
  const directory = join(FIXTURES, kind);
  return readdirSync(directory)
    .filter((name) => name.startsWith(`${prefix}.`))
    .map((name) => ({
      name,
      body: JSON.parse(readFileSync(join(directory, name), "utf8")),
    }));
}

function setup() {
  const noop = () => undefined;
  const status = new BusOperationsService({
    busStatus: new MemoryBusStatusRepository(),
    bays: new MemoryBayRepository(),
    publish: noop,
    audit: noop,
    now: () => NOW,
  });
  const reports = new BusReportsService({
    repositories: Object.fromEntries(
      REPORT_KINDS.map((kind) => [
        kind,
        new MemoryBusRecordRepository<AnyReport>(),
      ]),
    ) as never,
    publish: noop,
    audit: noop,
    now: () => NOW,
  });
  return { status, reports };
}

test("every valid BusStatusReport fixture is accepted by the backend", async () => {
  for (const { name, body } of fixtures("valid", "BusStatusReport")) {
    const { status } = setup();
    await assert.doesNotReject(status.reportBusStatus(body, BUS), name);
  }
});

const REPORT_FIXTURES: Array<[string, (typeof REPORT_KINDS)[number]]> = [
  ["RampSimulationReport", "RAMP_SIMULATION"],
  ["RampSafetyReport", "RAMP_SAFETY"],
  ["HelpRequiredReport", "HELP_REQUIRED"],
];

for (const [prefix, kind] of REPORT_FIXTURES) {
  test(`every valid ${prefix} fixture is accepted by the backend`, async () => {
    for (const { name, body } of fixtures("valid", prefix)) {
      const { reports } = setup();
      await assert.doesNotReject(reports.report(kind, body, BUS), name);
    }
  });
}

test("the ramp fixture that claims a physical ramp is rejected by the backend too", async () => {
  const { reports } = setup();
  for (const { name, body } of fixtures("invalid", "RampSimulationReport")) {
    await assert.rejects(
      reports.report("RAMP_SIMULATION", body, BUS),
      BusOperationsValidationError,
      name,
    );
  }
});
