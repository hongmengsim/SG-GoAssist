import test from "node:test";
import assert from "node:assert/strict";
import type { BusStatus } from "@buspass/shared";
import {
  MemoryBayRepository,
  MemoryBusStatusRepository,
} from "../busOperations/memoryRepositories";
import { BusOperationsService } from "../busOperations/busOperationsService";

const NOW = Date.parse("2026-09-30T00:10:00.000Z");
const at = (seconds: number) =>
  new Date(NOW - 60_000 + seconds * 1000).toISOString();

const report = (
  movement: string,
  seconds: number,
): Record<string, unknown> => ({
  busService: "95",
  stopCode: "18331",
  movement,
  simulated: true,
  observedAt: at(seconds),
});

/** A repository that lets a test slip a write in between a read and the write that follows. */
class RacyRepository extends MemoryBusStatusRepository {
  beforeNextSwap: (() => Promise<void>) | undefined;

  override async compareAndUpsert(
    expected: BusStatus | undefined,
    next: BusStatus,
  ): Promise<boolean> {
    const interfere = this.beforeNextSwap;
    this.beforeNextSwap = undefined;
    if (interfere) await interfere();
    return super.compareAndUpsert(expected, next);
  }
}

function setup() {
  const repository = new RacyRepository();
  const service = new BusOperationsService({
    busStatus: repository,
    bays: new MemoryBayRepository(),
    publish: () => undefined,
    audit: () => undefined,
    now: () => NOW,
  });
  return { repository, service };
}

test("a newer refresh that lands while a change is being stored is not overwritten by the older change", async () => {
  const { repository, service } = setup();
  await service.reportBusStatus(report("TRAVELLING_TO_STOP", 10), "B1");
  // While the change (WAITING_FOR_BAY at 11 s) is between its read and its write, a repeat of
  // the old state at 12 s is stored without the lock.
  repository.beforeNextSwap = async () => {
    const stored = (await repository.get("B1"))!;
    await repository.upsert({ ...stored, observedAt: at(12) });
  };
  const result = await service.reportBusStatus(
    report("WAITING_FOR_BAY", 11),
    "B1",
  );
  assert.equal(
    result.outcome,
    "STALE",
    "the change is older than what is stored",
  );
  const stored = (await service.getBusStatus("B1"))!;
  assert.equal(stored.observedAt, at(12));
  assert.equal(stored.movement, "TRAVELLING_TO_STOP");
});

test("a change that loses the swap to a refresh with nothing newer is stored on the retry", async () => {
  const { repository, service } = setup();
  await service.reportBusStatus(report("TRAVELLING_TO_STOP", 10), "B1");
  repository.beforeNextSwap = async () => {
    const stored = (await repository.get("B1"))!;
    await repository.upsert({ ...stored, observedAt: at(10.5) });
  };
  const result = await service.reportBusStatus(report("DEPARTING", 11), "B1");
  assert.equal(result.outcome, "CHANGED");
  assert.equal((await service.getBusStatus("B1"))?.movement, "DEPARTING");
});
