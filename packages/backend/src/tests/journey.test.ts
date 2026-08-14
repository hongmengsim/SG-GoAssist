import test from "node:test";
import assert from "node:assert/strict";
import {
  isSelectedStopNext,
  isSelectedStopReached,
  remainingRouteStops,
  RouteStop,
} from "@buspass/shared";

const routeStops: RouteStop[] = [
  {
    sequence: 0,
    busStopCode: "18301",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Crescent",
    latitude: 1.29398,
    longitude: 103.77104,
  },
  {
    sequence: 1,
    busStopCode: "18321",
    roadName: "Kent Ridge Cres",
    description: "Opp Heng Mui Keng Terrace",
    latitude: 1.29295,
    longitude: 103.77508,
  },
  {
    sequence: 2,
    busStopCode: "19011",
    roadName: "Kent Ridge Cres",
    description: "Kent Ridge Terminal",
    latitude: 1.2942,
    longitude: 103.7711,
  },
];

test("remaining route stops excludes stops already passed", () => {
  assert.deepEqual(
    remainingRouteStops(routeStops, 0).map((stop) => stop.busStopCode),
    ["18321", "19011"]
  );
  assert.deepEqual(
    remainingRouteStops(routeStops, 1).map((stop) => stop.busStopCode),
    ["19011"]
  );
});

test("selected alighting stop can be detected as next", () => {
  assert.equal(isSelectedStopNext(routeStops, 1, "19011"), true);
  assert.equal(isSelectedStopNext(routeStops, 0, "19011"), false);
});

test("selected alighting stop can be detected as reached", () => {
  assert.equal(isSelectedStopReached(routeStops, 2, "19011"), true);
  assert.equal(isSelectedStopReached(routeStops, 1, "19011"), false);
});
