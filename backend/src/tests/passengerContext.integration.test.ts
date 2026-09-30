import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  requestJson,
  startTestServer,
  type TestServer,
} from "./helpers/integration";

describe("passenger context and journey planning", async () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  await it("returns three prioritized stops with verified amenities and provenance", async () => {
    const response = await requestJson(
      server.baseUrl,
      "/api/passenger/context?lat=1.297385&lng=103.780927&radius=200",
    );

    assert.equal(response.status, 200);
    assert.ok(response.body.nearbyStops.length <= 3);
    assert.equal(response.body.nearbyStops[0].stop.busStopCode, "18301");
    assert.equal(response.body.nearbyStops[0].amenities.shelter, "YES");
    assert.equal(
      response.body.nearbyStops[0].amenities.provenance.sourceLabel,
      "Prototype verified data",
    );
    assert.equal(response.body.radiusMeters, 200);
  });

  await it("keeps unknown amenity values explicitly unknown", async () => {
    const response = await requestJson(
      server.baseUrl,
      "/api/passenger/context?lat=1.2937&lng=103.7842&radius=1200",
    );

    assert.equal(response.status, 200);
    const unknown = response.body.nearbyStops.find(
      (item: any) => item.amenities.provenance.kind === "UNAVAILABLE",
    );
    if (unknown) {
      assert.equal(unknown.amenities.shelter, "UNKNOWN");
    }
  });

  await it("validates coordinates and clamps context radius", async () => {
    const invalid = await requestJson(
      server.baseUrl,
      "/api/passenger/context?lat=999&lng=103.77",
    );
    assert.equal(invalid.status, 400);

    const clamped = await requestJson(
      server.baseUrl,
      "/api/passenger/context?lat=1.297385&lng=103.780927&radius=9999",
    );
    assert.equal(clamped.status, 200);
    assert.equal(clamped.body.radiusMeters, 1200);
  });

  await it("returns up to three ranked direct or one-transfer options", async () => {
    const response = await requestJson(server.baseUrl, "/api/journeys/plan", {
      method: "POST",
      body: JSON.stringify({
        origin: { latitude: 1.297385, longitude: 103.780927 },
        destination: { latitude: 1.296566, longitude: 103.772542 },
        preferences: { preferAccessibleStops: true },
      }),
    });

    assert.equal(response.status, 200);
    assert.ok(response.body.options.length > 0);
    assert.ok(response.body.options.length <= 3);
    for (const option of response.body.options) {
      assert.ok(option.transferCount <= 1);
      assert.ok(
        ["VERIFIED", "PARTIAL", "UNKNOWN"].includes(option.accessibilityFit),
      );
      assert.equal(option.provenance, undefined);
    }
    assert.equal(
      response.body.provenance.sourceLabel,
      "Prototype verified data",
    );
  });

  await it("rejects malformed journey planning requests", async () => {
    const response = await requestJson(server.baseUrl, "/api/journeys/plan", {
      method: "POST",
      body: JSON.stringify({ origin: { latitude: 1.3 } }),
    });
    assert.equal(response.status, 400);
  });
});
