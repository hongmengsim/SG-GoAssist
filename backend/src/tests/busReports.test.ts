import test from "node:test";
import assert from "node:assert/strict";
import type { OperatorStatusUpdateMessage } from "@buspass/shared";
import {
  BusReportsService,
  type AnyReport,
  REPORT_KINDS,
  type ReportKind,
} from "../busOperations/busReports";
import { MemoryBusRecordRepository } from "../busOperations/busRecordRepositories";
import { BusOperationsValidationError } from "../busOperations/busOperationsService";

const NOW = Date.parse("2026-09-30T00:10:00.000Z");
const OBSERVED = "2026-09-30T00:09:59.000Z";

function setup() {
  const published: OperatorStatusUpdateMessage[] = [];
  const audited: Array<{ eventType: string; actor: string; busId?: string }> =
    [];
  const repositories = Object.fromEntries(
    REPORT_KINDS.map((kind) => [
      kind,
      new MemoryBusRecordRepository<AnyReport>(),
    ]),
  ) as Record<ReportKind, MemoryBusRecordRepository<AnyReport>>;
  const service = new BusReportsService({
    repositories,
    publish: (message) => void published.push(message),
    audit: (event) => void audited.push(event),
    now: () => NOW,
  });
  return { service, published, audited };
}

const ramp = (overrides: Record<string, unknown> = {}) => ({
  state: "DEPLOYING",
  simulated: true,
  observedAt: OBSERVED,
  ...overrides,
});

const decision = (overrides: Record<string, unknown> = {}) => ({
  zoneState: "CLEAR",
  permission: "CONTINUE",
  reasons: [],
  tof: { state: "BEAM_CLEAR", distanceMm: 1200, simulated: true },
  camera: { imageOk: true },
  objectsInZone: [],
  simulated: true,
  observedAt: OBSERVED,
  ...overrides,
});

const help = (overrides: Record<string, unknown> = {}) => ({
  reason: "DEPLOYMENT_TIMEOUT",
  state: "DEPLOYING",
  observedAt: OBSERVED,
  ...overrides,
});

test("a ramp state is stored per bus and published once", async () => {
  const { service, published, audited } = setup();
  const first = await service.report("RAMP_SIMULATION", ramp(), "AV-095-01");
  assert.equal(first.outcome, "CHANGED");
  assert.equal(
    (await service.get("RAMP_SIMULATION", "AV-095-01"))?.busId,
    "AV-095-01",
  );
  assert.equal(published[0].type, "RAMP_SIMULATION");
  assert.equal(audited[0].eventType, "RAMP_SIMULATION_CHANGED");

  const again = await service.report(
    "RAMP_SIMULATION",
    ramp({ observedAt: "2026-09-30T00:10:00.000Z" }),
    "AV-095-01",
  );
  assert.equal(again.outcome, "HEARTBEAT");
  assert.equal(published.length, 1);
});

test("an older report is ignored", async () => {
  const { service } = setup();
  await service.report("RAMP_SIMULATION", ramp(), "AV-095-01");
  const stale = await service.report(
    "RAMP_SIMULATION",
    ramp({ state: "STOWED", observedAt: "2026-09-30T00:00:00.000Z" }),
    "AV-095-01",
  );
  assert.equal(stale.outcome, "STALE");
  assert.equal(
    (
      (await service.get("RAMP_SIMULATION", "AV-095-01")) as
        { state?: string } | undefined
    )?.state,
    "DEPLOYING",
  );
});

test("the ramp can never be reported as physical", async () => {
  const { service } = setup();
  await assert.rejects(
    service.report("RAMP_SIMULATION", ramp({ simulated: false }), "AV-095-01"),
    BusOperationsValidationError,
  );
});

test("an unknown ramp state or halt reason is rejected", async () => {
  const { service } = setup();
  await assert.rejects(
    service.report("RAMP_SIMULATION", ramp({ state: "MELTED" }), "AV-095-01"),
    BusOperationsValidationError,
  );
  await assert.rejects(
    service.report(
      "RAMP_SIMULATION",
      ramp({ haltReasons: ["BAD"] }),
      "AV-095-01",
    ),
    BusOperationsValidationError,
  );
});

test("a CONTINUE decision needs a clear zone and no reasons", async () => {
  const { service } = setup();
  const ok = await service.report("RAMP_SAFETY", decision(), "AV-095-01");
  assert.equal(ok.outcome, "CHANGED");
  for (const bad of [
    decision({ zoneState: "OCCUPIED" }),
    decision({ zoneState: "UNCERTAIN" }),
    decision({ reasons: ["TOF_BLOCKED"] }),
  ]) {
    await assert.rejects(
      service.report("RAMP_SAFETY", bad, "AV-095-02"),
      BusOperationsValidationError,
    );
  }
});

test("a HALT decision needs at least one reason", async () => {
  const { service } = setup();
  await assert.rejects(
    service.report(
      "RAMP_SAFETY",
      decision({ permission: "HALT", zoneState: "OCCUPIED" }),
      "AV-095-01",
    ),
    BusOperationsValidationError,
  );
  const halted = await service.report(
    "RAMP_SAFETY",
    decision({
      permission: "HALT",
      zoneState: "OCCUPIED",
      reasons: ["OBJECT_IN_ZONE"],
      objectsInZone: [
        { className: "person", safety: "UNSAFE", confidence: 0.91 },
      ],
    }),
    "AV-095-01",
  );
  assert.equal(halted.outcome, "CHANGED");
});

test("decision fields are validated", async () => {
  const { service } = setup();
  const bad: Record<string, unknown>[] = [
    decision({ tof: { state: "MAYBE", simulated: true } }),
    decision({ tof: { state: "BEAM_CLEAR", simulated: "yes" } }),
    decision({ camera: { imageOk: "yes" } }),
    decision({
      objectsInZone: [{ className: "x", safety: "SAFE", confidence: 2 }],
    }),
    decision({
      objectsInZone: [{ className: "x", safety: "MAYBE", confidence: 0.5 }],
    }),
    decision({ simulated: undefined }),
  ];
  for (const item of bad) {
    await assert.rejects(
      service.report("RAMP_SAFETY", item, "AV-095-01"),
      BusOperationsValidationError,
      JSON.stringify(item),
    );
  }
});

test("help required is validated, stored, published and audited", async () => {
  const { service, published, audited } = setup();
  await assert.rejects(
    service.report("HELP_REQUIRED", help({ reason: "BORED" }), "AV-095-01"),
    BusOperationsValidationError,
  );
  const result = await service.report(
    "HELP_REQUIRED",
    help({ detail: "stalled" }),
    "AV-095-01",
  );
  assert.equal(result.outcome, "CHANGED");
  assert.equal(published[0].type, "HELP_REQUIRED");
  assert.equal(audited[0].eventType, "HELP_REQUIRED_CHANGED");
});

test("only the fields of the contract are stored", async () => {
  const { service } = setup();
  await service.report("RAMP_SIMULATION", ramp({ extra: "x" }), "AV-095-01");
  const stored = await service.get("RAMP_SIMULATION", "AV-095-01");
  assert.equal("extra" in (stored ?? {}), false);
});

test("list is bounded and clearAll empties every kind", async () => {
  const { service } = setup();
  for (let index = 0; index < 5; index += 1) {
    await service.report("HELP_REQUIRED", help(), `BUS-${index}`);
  }
  assert.equal((await service.list("HELP_REQUIRED", 3)).length, 3);
  await service.clearAll();
  assert.equal((await service.list("HELP_REQUIRED", 10)).length, 0);
});

test("a decision whose only difference is a jittering distance or confidence is a heartbeat, not a change", async () => {
  const { service, published, audited } = setup();
  const later = (seconds: number) =>
    new Date(Date.parse(OBSERVED) + seconds * 1000).toISOString();
  const moving = (index: number) =>
    decision({
      tof: { state: "BEAM_CLEAR", distanceMm: 1200 + index, simulated: true },
      objectsInZone: [
        { className: "leaf", safety: "SAFE", confidence: 0.9 + index / 1000 },
      ],
      observedAt: later(index),
    });
  const first = await service.report("RAMP_SAFETY", moving(0), "AV-095-01");
  assert.equal(first.outcome, "CHANGED");
  for (let index = 1; index <= 4; index += 1) {
    const result = await service.report(
      "RAMP_SAFETY",
      moving(index),
      "AV-095-01",
    );
    assert.equal(result.outcome, "HEARTBEAT", `report ${index}`);
  }
  assert.equal(audited.length, 1);
  assert.equal(published.length, 1);
});

test("a real change in a decision is still a change", async () => {
  const { service } = setup();
  await service.report("RAMP_SAFETY", decision(), "AV-095-01");
  const blocked = await service.report(
    "RAMP_SAFETY",
    decision({
      permission: "HALT",
      reasons: ["TOF_BLOCKED"],
      tof: { state: "BLOCKED", distanceMm: 300, simulated: true },
      observedAt: "2026-09-30T00:10:30.000Z",
    }),
    "AV-095-01",
  );
  assert.equal(blocked.outcome, "CHANGED");
});
