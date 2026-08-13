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

  assert.equal(stops.length, 2);
  assert.equal(stops[0].busStopCode, "19011");
  assert.equal(stops[0].distanceMeters, 0);
  assert.equal(stops[1].busStopCode, "19019");
  assert.ok(stops[1].distanceMeters > stops[0].distanceMeters);
});

test("nearby bus stop lookup returns no stops when outside the confidence radius", () => {
  const stops = findNearestBusStops(1.3521, 103.8198, 3, 150);

  assert.deepEqual(stops, []);
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
