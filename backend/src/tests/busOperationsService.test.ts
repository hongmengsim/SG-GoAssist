import test from "node:test";
import assert from "node:assert/strict";
import type { OperatorStatusUpdateMessage } from "@buspass/shared";
import {
  MemoryBayRepository,
  MemoryBusStatusRepository,
} from "../busOperations/memoryRepositories";
import {
  BusOperationsService,
  BusOperationsValidationError,
  type AuditEventInput,
} from "../busOperations/busOperationsService";

const NOW = Date.parse("2026-09-30T00:10:00.000Z");

function setup() {
  const published: OperatorStatusUpdateMessage[] = [];
  const audited: AuditEventInput[] = [];
  const bayPublished: OperatorStatusUpdateMessage[] = [];
  const bayAudited: AuditEventInput[] = [];
  const clock = { now: NOW };
  const repository = new MemoryBusStatusRepository();
  const service = new BusOperationsService({
    busStatus: repository,
    bays: new MemoryBayRepository(),
    publish: (message) =>
      void (message.type === "BUS_STATUS" ? published : bayPublished).push(
        message,
      ),
    audit: (event) =>
      void (
        event.eventType === "BUS_STATUS_CHANGED" ? audited : bayAudited
      ).push(event),
    now: () => clock.now,
  });
  return {
    service,
    repository,
    published,
    audited,
    bayPublished,
    bayAudited,
    clock,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    busId: "AV-095-01",
    busService: "95",
    stopCode: "18331",
    movement: "TRAVELLING_TO_STOP",
    simulated: false,
    observedAt: new Date(NOW - 1000).toISOString(),
    ...overrides,
  };
}

test("a first report is stored, published once and audited once", async () => {
  const { service, repository, published, audited } = setup();
  const result = await service.reportBusStatus(report(), "AV-095-01");
  assert.equal(result.outcome, "CHANGED");
  assert.equal(
    (await repository.get("AV-095-01"))?.movement,
    "TRAVELLING_TO_STOP",
  );
  assert.equal(published.length, 1);
  assert.equal(published[0].type, "BUS_STATUS");
  assert.equal(audited.length, 1);
  assert.equal(audited[0].eventType, "BUS_STATUS_CHANGED");
  assert.equal(audited[0].busId, "AV-095-01");
});

test("a repeat with a newer time and the same facts is a heartbeat: stored, not published, not audited", async () => {
  const { service, repository, published, audited } = setup();
  await service.reportBusStatus(report(), "AV-095-01");
  const later = new Date(NOW - 500).toISOString();
  const result = await service.reportBusStatus(
    report({ observedAt: later }),
    "AV-095-01",
  );
  assert.equal(result.outcome, "HEARTBEAT");
  assert.equal((await repository.get("AV-095-01"))?.observedAt, later);
  assert.equal(published.length, 1);
  assert.equal(audited.length, 1);
});

test("a change of movement, stop, bay or simulated flag is published and audited", async () => {
  const { service, published, audited } = setup();
  await service.reportBusStatus(report(), "AV-095-01");
  const changes = [
    { movement: "WAITING_FOR_BAY" },
    { stopCode: "18301" },
    { bayId: "BAY-A" },
    { simulated: true },
  ];
  let seconds = 500;
  for (const change of changes) {
    seconds -= 100;
    const result = await service.reportBusStatus(
      report({ ...change, observedAt: new Date(NOW - seconds).toISOString() }),
      "AV-095-01",
    );
    assert.equal(result.outcome, "CHANGED", JSON.stringify(change));
  }
  assert.equal(published.length, 1 + changes.length);
  assert.equal(audited.length, 1 + changes.length);
});

test("an older report than the stored one is ignored and changes nothing", async () => {
  const { service, repository, published, audited } = setup();
  await service.reportBusStatus(
    report({ observedAt: new Date(NOW - 1000).toISOString() }),
    "AV-095-01",
  );
  const result = await service.reportBusStatus(
    report({
      movement: "DEPARTING",
      observedAt: new Date(NOW - 5000).toISOString(),
    }),
    "AV-095-01",
  );
  assert.equal(result.outcome, "STALE");
  assert.equal(
    (await repository.get("AV-095-01"))?.movement,
    "TRAVELLING_TO_STOP",
  );
  assert.equal(published.length, 1);
  assert.equal(audited.length, 1);
});

test("sending the identical report twice has the effect of once", async () => {
  const { service, published, audited } = setup();
  const same = report();
  await service.reportBusStatus(same, "AV-095-01");
  const second = await service.reportBusStatus(same, "AV-095-01");
  assert.equal(second.outcome, "HEARTBEAT");
  assert.equal(published.length, 1);
  assert.equal(audited.length, 1);
});

const invalid: Array<[string, Record<string, unknown>]> = [
  ["an unknown movement", { movement: "FLYING" }],
  ["a missing movement", { movement: undefined }],
  ["a non-boolean simulated flag", { simulated: "yes" }],
  ["a missing simulated flag", { simulated: undefined }],
  ["an empty bus service", { busService: "" }],
  ["a bus service that is too long", { busService: "9".repeat(21) }],
  ["a stop code that is too long", { stopCode: "1".repeat(41) }],
  ["a non-string bay", { bayId: 7 }],
  ["an unparseable time", { observedAt: "yesterday" }],
  [
    "a time far in the future",
    { observedAt: new Date(NOW + 120_000).toISOString() },
  ],
  ["a bus id that differs from the path", { busId: "AV-095-99" }],
];

for (const [name, override] of invalid) {
  test(`rejects ${name}`, async () => {
    const { service, published, audited } = setup();
    await assert.rejects(
      () => service.reportBusStatus(report(override), "AV-095-01"),
      BusOperationsValidationError,
    );
    assert.equal(published.length, 0);
    assert.equal(audited.length, 0);
  });
}

test("rejects a body that is not an object", async () => {
  const { service } = setup();
  for (const body of [null, "text", 42, []]) {
    await assert.rejects(
      () => service.reportBusStatus(body, "AV-095-01"),
      BusOperationsValidationError,
    );
  }
});

test("unknown extra fields are dropped, not stored", async () => {
  const { service, repository } = setup();
  await service.reportBusStatus(
    report({ secret: "x", nested: { a: 1 } }),
    "AV-095-01",
  );
  const stored = await repository.get("AV-095-01");
  assert.ok(stored);
  assert.ok(!("secret" in stored) && !("nested" in stored));
});

test("list is bounded and capped whatever limit is asked for", async () => {
  const { service } = setup();
  for (let index = 0; index < 30; index += 1) {
    await service.reportBusStatus(
      report({ busId: `B${String(index).padStart(2, "0")}` }),
      `B${String(index).padStart(2, "0")}`,
    );
  }
  assert.equal((await service.listBusStatus({ limit: 5 })).length, 5);
  assert.equal((await service.listBusStatus({})).length, 30);
  assert.equal((await service.listBusStatus({ limit: 100_000 })).length, 30);
  assert.ok((await service.listBusStatus({ limit: 0 })).length >= 1);
});

test("concurrent reports for one bus are applied one at a time, in arrival order", async () => {
  const { service, repository, published, audited } = setup();
  const movements = [
    "TRAVELLING_TO_STOP",
    "POSITIONED_AT_STOP",
    "DEPARTING",
    "WAITING_FOR_BAY",
  ];
  const reports = Array.from({ length: 40 }, (_, index) =>
    service.reportBusStatus(
      report({
        movement: movements[index % movements.length],
        observedAt: new Date(NOW - 40_000 + index * 100).toISOString(),
      }),
      "AV-095-01",
    ),
  );
  const results = await Promise.all(reports);
  assert.ok(results.every((result) => result.outcome === "CHANGED"));
  assert.equal(published.length, 40);
  assert.equal(audited.length, 40);
  assert.equal(
    (await repository.get("AV-095-01"))?.movement,
    movements[39 % movements.length],
  );
});

test("different buses are not held up by each other", async () => {
  const { service } = setup();
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      service.reportBusStatus(report({ busId: `B${index}` }), `B${index}`),
    ),
  );
  assert.ok(results.every((result) => result.outcome === "CHANGED"));
});

test("clearAll removes stored statuses", async () => {
  const { service, repository } = setup();
  await service.reportBusStatus(report(), "AV-095-01");
  await service.clearAll();
  assert.equal(await repository.count(), 0);
});

test("a bay change is published and audited once, and a repeat is silent", async () => {
  const { service, bayPublished, bayAudited } = setup();
  await service.reportBusStatus(
    report({ movement: "POSITIONED_AT_STOP" }),
    "AV-095-01",
  );
  await service.reportBusStatus(
    report({
      movement: "POSITIONED_AT_STOP",
      observedAt: new Date(NOW - 500).toISOString(),
    }),
    "AV-095-01",
  );
  assert.equal(bayPublished.length, 1);
  assert.equal(bayAudited.length, 1);
  assert.equal(bayAudited[0].eventType, "BAY_CHANGED");
});

test("a bus moving to another stop leaves the bay of the stop it left", async () => {
  const { service } = setup();
  await service.reportBusStatus(
    report({ movement: "POSITIONED_AT_STOP", stopCode: "18301" }),
    "AV-095-01",
  );
  await service.reportBusStatus(
    report({
      movement: "TRAVELLING_TO_STOP",
      stopCode: "18331",
      observedAt: new Date(NOW - 500).toISOString(),
    }),
    "AV-095-01",
  );
  assert.equal((await service.getBay("18301")).occupantBusId, null);
});

test("granting entry is audited as an operator action for the granted bus", async () => {
  const { service, bayAudited } = setup();
  await service.reportBusStatus(
    report({ movement: "WAITING_FOR_BAY", busId: undefined }),
    "AV-095-02",
  );
  const bay = await service.grantBayEntry("18331");
  assert.equal(bay.grantedBusId, "AV-095-02");
  const grant = bayAudited.find(
    (event) => event.eventType === "BAY_ENTRY_GRANTED",
  );
  assert.equal(grant?.actor, "OPERATOR");
  assert.equal(grant?.busId, "AV-095-02");
});
