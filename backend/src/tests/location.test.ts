import test from "node:test";
import assert from "node:assert/strict";
import {
  findNearestBusStops,
  getArrivalsForStop,
  getBusStopByCode,
} from "../data/bus-stops.mock";
import { getBusById } from "../data/buses.mock";

test("nearby bus stop lookup ranks stops by distance and respects the search radius", () => {
  const stops = findNearestBusStops(1.2942, 103.7711, 3, 150);

  assert.equal(stops.length, 3);
  assert.equal(stops[0].busStopCode, "19011");
  assert.equal(stops[0].distanceMeters, 0);
  assert.equal(stops[1].busStopCode, "18309");
  assert.ok(stops[1].distanceMeters > stops[0].distanceMeters);
});

test("nearby bus stop lookup returns no stops when outside the confidence radius", () => {
  const stops = findNearestBusStops(1.3521, 103.8198, 3, 150);

  assert.deepEqual(stops, []);
});

test("wider manual lookup can surface a larger bus stop library around Kent Ridge", () => {
  const stops = findNearestBusStops(1.2942, 103.7711, 8, 800);
  const stopCodes = stops.map((stop) => stop.busStopCode);

  assert.ok(stops.length > 3);
  assert.ok(stopCodes.includes("18341"));
  assert.ok(stopCodes.includes("19019"));
});

test("arrival buses map to backend-known autonomous vehicle records", () => {
  const services = getArrivalsForStop("19011");
  const arrivals = services.flatMap((service) => service.buses);

  assert.ok(arrivals.length > 0);
  assert.equal(getBusStopByCode("19011")?.description, "Kent Ridge Terminal");

  for (const arrival of arrivals) {
    const bus = getBusById(arrival.busId);
    assert.ok(bus, `Missing backend bus mapping for ${arrival.busId}`);
    assert.equal(bus.busService, arrival.serviceNo);
    assert.equal(bus.isAccessible, arrival.wheelchairAccessible);
  }
});

test("kent ridge crescent stop returns mocked approaching buses for passenger selection", () => {
  const services = getArrivalsForStop("18301");
  const arrivals = services.flatMap((service) => service.buses);

  assert.equal(getBusStopByCode("18301")?.description, "Kent Ridge Crescent");
  assert.ok(arrivals.some((arrival) => arrival.serviceNo === "95"));
  assert.ok(arrivals.some((arrival) => arrival.serviceNo === "151"));

  for (const arrival of arrivals) {
    assert.ok(
      getBusById(arrival.busId),
      `Missing backend bus mapping for ${arrival.busId}`,
    );
  }
});
