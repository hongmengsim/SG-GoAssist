import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BusRoutePattern, BusStop } from "@buspass/shared";
import {
  BusStopRepository,
  loadBusStopSnapshot,
} from "../bus-stops/repository";

function regionalFixture(count = 720): BusStop[] {
  const stops = Array.from({ length: count }, (_, index) => ({
    busStopCode: String(20_000 + index).padStart(5, "0"),
    roadName: `Regional Road ${index % 48}`,
    description: `Regional Stop ${index}`,
    latitude: 1.2 + Math.floor(index / 36) * 0.006,
    longitude: 103.62 + (index % 36) * 0.009,
    services: [String(10 + (index % 30)), `${50 + (index % 12)}A`],
  }));
  stops.push({
    busStopCode: "18139",
    roadName: "Lower Kent Ridge Road",
    description: "Opp Yusof Ishak House",
    latitude: 1.29812,
    longitude: 103.77424,
    services: ["151", "183", "188"],
  });
  return stops;
}

const repository = new BusStopRepository(regionalFixture());

test("regional repository indexes several hundred stops without scanning route records", () => {
  assert.equal(repository.size, 721);
  assert.equal(repository.get("18139")?.description, "Opp Yusof Ishak House");
});

test("nearby queries use Haversine distance, radius filtering and nearest-first sorting", () => {
  const stops = repository.nearby(1.29812, 103.77424, 2_000, 20);
  assert.equal(stops[0].busStopCode, "18139");
  assert.equal(stops[0].distanceMeters, 0);
  assert.ok(stops.every((stop) => stop.distanceMeters <= 2_000));
  assert.deepEqual(
    stops.map((stop) => stop.distanceMeters),
    [...stops].map((stop) => stop.distanceMeters).sort((a, b) => a - b),
  );
});

test("bounds queries filter geographically and report maximum-result truncation", () => {
  const result = repository.bounds(
    { north: 1.31, south: 1.19, east: 103.95, west: 103.6 },
    100,
  );
  assert.equal(result.stops.length, 100);
  assert.ok(result.total > result.stops.length);
  assert.equal(result.truncated, true);
  assert.ok(
    result.stops.every(
      (stop) =>
        stop.latitude >= 1.19 &&
        stop.latitude <= 1.31 &&
        stop.longitude >= 103.6,
    ),
  );
});

test("search is indexed and ranked across code, description, road and service", () => {
  assert.equal(repository.search("18139", 10)[0].busStopCode, "18139");
  assert.equal(repository.search("Yusof Ishak", 10)[0].busStopCode, "18139");
  assert.equal(
    repository.search("Lower Kent Ridge", 10)[0].busStopCode,
    "18139",
  );
  assert.equal(repository.search("151", 10)[0].busStopCode, "18139");
});

test("route lookup returns cached downstream stops and passenger-facing terminals", () => {
  const stops: BusStop[] = [
    {
      busStopCode: "10001",
      roadName: "First Rd",
      description: "First Stop",
      latitude: 1.3,
      longitude: 103.8,
      services: ["33"],
    },
    {
      busStopCode: "19069",
      roadName: "Dover Rd",
      description: "Opp Ayer Rajah Telecoms",
      latitude: 1.3078,
      longitude: 103.7767,
      services: ["33"],
    },
    {
      busStopCode: "16009",
      roadName: "Clementi Rd",
      description: "Kent Ridge Ter",
      latitude: 1.2943,
      longitude: 103.7699,
      services: ["33"],
    },
  ];
  const routes: BusRoutePattern[] = [
    {
      serviceNo: "33",
      direction: 1,
      stopCodes: ["10001", "19069", "16009"],
    },
  ];
  const routeRepository = new BusStopRepository(stops, undefined, routes);

  const [route] = routeRepository.routesForStopAndService("19069", "33");
  assert.equal(route.direction, 1);
  assert.equal(route.destination.description, "Kent Ridge Ter");
  assert.deepEqual(
    route.stops.map((stop) => [stop.sequence, stop.busStopCode]),
    [
      [0, "19069"],
      [1, "16009"],
    ],
  );
  assert.deepEqual(routeRepository.routesForStopAndService("19069", "196"), []);
});

test("invalid service-index records do not discard valid stop geography", () => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "goassist-bus-stops-"),
  );
  const snapshotPath = path.join(tempDirectory, "snapshot.json");
  try {
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        metadata: {
          source: "TEST_FIXTURE",
          generatedAt: "2026-08-28T00:00:00.000Z",
          stopCount: 1,
          routeRecordCount: 1,
          serviceCount: 0,
          stopsWithServices: 0,
          stopsWithCompleteNames: 1,
        },
        stops: [
          {
            busStopCode: "19069",
            roadName: "Dover Rd",
            description: "Opp Ayer Rajah Telecoms",
            latitude: 1.3078,
            longitude: 103.7767,
          },
        ],
        routes: [{ serviceNo: null, stopCodes: "not-an-array" }],
      }),
      "utf8",
    );

    const snapshot = loadBusStopSnapshot(snapshotPath);
    assert.equal(snapshot.stops.length, 1);
    assert.deepEqual(snapshot.stops[0].services, []);
    assert.deepEqual(snapshot.routes, []);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
