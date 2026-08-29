import test from "node:test";
import assert from "node:assert/strict";
import {
  BusStopDataUnavailableError,
  busStopRepository,
} from "../bus-stops/repository";
import { requestJson, startTestServer } from "./helpers/integration";

test("regional bus-stop API serves nearby, bounds, search and detail queries", async () => {
  const server = await startTestServer();
  const reference =
    busStopRepository.get("58039") ??
    busStopRepository.search("bus stop", 1)[0];
  assert.ok(reference);

  try {
    const nearby = await requestJson(
      server.baseUrl,
      `/api/bus-stops/nearby?lat=${reference.latitude}&lng=${reference.longitude}&radius=500&limit=10`,
    );
    assert.equal(nearby.status, 200);
    assert.equal(nearby.body.stops[0].busStopCode, reference.busStopCode);
    assert.equal(nearby.body.stops[0].distanceMeters, 0);

    const bounds = await requestJson(
      server.baseUrl,
      `/api/bus-stops/bounds?north=${reference.latitude + 0.004}&south=${reference.latitude - 0.004}&east=${reference.longitude + 0.004}&west=${reference.longitude - 0.004}&limit=25`,
    );
    assert.equal(bounds.status, 200);
    assert.ok(
      bounds.body.stops.some(
        (stop: any) => stop.busStopCode === reference.busStopCode,
      ),
    );

    const search = await requestJson(
      server.baseUrl,
      `/api/bus-stops/search?q=${reference.busStopCode}`,
    );
    assert.equal(search.status, 200);
    assert.equal(search.body.stops[0].busStopCode, reference.busStopCode);

    const detail = await requestJson(
      server.baseUrl,
      `/api/bus-stops/${reference.busStopCode}`,
    );
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.stop, reference);
  } finally {
    await server.close();
  }
});

test("regional bus-stop API rejects world-scale coordinates and malformed bounds", async () => {
  const server = await startTestServer();
  try {
    const outside = await requestJson(
      server.baseUrl,
      "/api/bus-stops/nearby?lat=51.5&lng=-0.1&radius=1000",
    );
    assert.equal(outside.status, 400);

    const malformed = await requestJson(
      server.baseUrl,
      "/api/bus-stops/bounds?north=1.2&south=1.3&east=103.8&west=103.9",
    );
    assert.equal(malformed.status, 400);
  } finally {
    await server.close();
  }
});

test("valid bounds with no matching stops returns a stable empty response", async () => {
  const server = await startTestServer();
  try {
    const empty = await requestJson(
      server.baseUrl,
      "/api/bus-stops/bounds?north=1.1002&south=1.1001&east=103.5002&west=103.5001",
    );
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body, {
      stops: [],
      total: 0,
      truncated: false,
    });
  } finally {
    await server.close();
  }
});

test("dataset failure returns a controlled response without implementation details", async () => {
  const originalBounds = busStopRepository.bounds;
  busStopRepository.bounds = () => {
    throw new BusStopDataUnavailableError();
  };
  const server = await startTestServer();
  try {
    const response = await requestJson(
      server.baseUrl,
      "/api/bus-stops/bounds?north=1.31&south=1.30&east=103.79&west=103.77",
    );
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "BUS_STOP_DATA_UNAVAILABLE" });
    assert.equal("stack" in response.body, false);
    assert.equal("path" in response.body, false);
  } finally {
    busStopRepository.bounds = originalBounds;
    await server.close();
  }
});

test("development CORS accepts the actual Expo Web loopback port", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(
      `${server.baseUrl}/api/bus-stops/nearby?lat=1.2942&lng=103.7711&radius=500&limit=10`,
      { headers: { Origin: "http://localhost:8086" } },
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:8086",
    );
  } finally {
    await server.close();
  }
});

test("stop 19069 exposes static services and routes when live arrivals are unavailable", async () => {
  const server = await startTestServer();
  try {
    const detail = await requestJson(server.baseUrl, "/api/bus-stops/19069");
    assert.equal(detail.status, 200);
    assert.equal(detail.body.stop.description, "Opp Ayer Rajah Telecoms");
    assert.equal(detail.body.stop.roadName, "Dover Rd");
    assert.deepEqual(detail.body.stop.services, ["33", "196"]);

    const arrivals = await requestJson(
      server.baseUrl,
      "/api/location/bus-stops/19069/arrivals",
    );
    assert.equal(arrivals.status, 200);
    assert.deepEqual(arrivals.body.services, []);
    assert.deepEqual(arrivals.body.busStop.services, ["33", "196"]);

    const service33 = await requestJson(
      server.baseUrl,
      "/api/bus-stops/19069/services/33/routes",
    );
    assert.equal(service33.status, 200);
    assert.equal(
      service33.body.routes[0].destination.description,
      "Kent Ridge Ter",
    );
    assert.equal(service33.body.routes[0].stops[0].busStopCode, "19069");

    const service196 = await requestJson(
      server.baseUrl,
      "/api/bus-stops/19069/services/196/routes",
    );
    assert.equal(service196.status, 200);
    assert.equal(
      service196.body.routes[0].destination.description,
      "Clementi Int",
    );
    assert.equal(service196.body.routes[0].stops[0].busStopCode, "19069");
  } finally {
    await server.close();
  }
});
