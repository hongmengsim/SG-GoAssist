import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { compareServiceNumbers } from "../bus-stops/normalize";
import { busStopRepository } from "../bus-stops/repository";
import type { BusStopDatasetSnapshot } from "../bus-stops/types";

const snapshot = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../data/bus-stops.sg.json"),
    "utf8",
  ),
) as BusStopDatasetSnapshot;

test("regional dataset is initialized before the API starts serving queries", () => {
  assert.equal(busStopRepository.available, true);
  assert.equal(busStopRepository.size, 5_204);
  assert.equal(busStopRepository.metadata?.stopsWithServices, 5_204);
});

test("regional stop services are derived consistently from the persisted route index", () => {
  const servicesByStop = new Map<string, Set<string>>();
  for (const route of snapshot.routes ?? []) {
    for (const busStopCode of route.stopCodes) {
      const services = servicesByStop.get(busStopCode) ?? new Set<string>();
      services.add(route.serviceNo);
      servicesByStop.set(busStopCode, services);
    }
  }

  assert.equal(snapshot.stops.length, 5_204);
  assert.equal(snapshot.metadata.routeRecordCount, 26_799);
  assert.equal(snapshot.metadata.stopsWithServices, snapshot.stops.length);
  for (const stop of snapshot.stops) {
    assert.deepEqual(
      stop.services,
      [...(servicesByStop.get(stop.busStopCode) ?? [])].sort(
        compareServiceNumbers,
      ),
      `Route-derived services differ for stop ${stop.busStopCode}`,
    );
  }
});

test("regional coverage includes one, multiple, many and alphanumeric services", () => {
  const regressionStop = snapshot.stops.find(
    (stop) => stop.busStopCode === "19069",
  );
  assert.equal(regressionStop?.description, "Opp Ayer Rajah Telecoms");
  assert.deepEqual(regressionStop?.services, ["33", "196"]);

  const oneServiceStop = snapshot.stops.find(
    (stop) => stop.services.length === 1,
  );
  const manyServiceStop = snapshot.stops.find(
    (stop) => stop.services.length >= 20,
  );
  const alphanumericServiceStop = snapshot.stops.find((stop) =>
    stop.services.some((service) => /[a-z]/i.test(service)),
  );
  assert.ok(oneServiceStop);
  assert.ok(manyServiceStop);
  assert.ok(alphanumericServiceStop);
});
