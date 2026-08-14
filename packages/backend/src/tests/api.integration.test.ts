import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, requestJson } from "./helpers/integration";

const wheelchairPayload = {
  sessionId: "api-mobile-wheelchair",
  busService: "95",
  busId: "AV-095-01",
  boardingStop: "18301",
  destination: "Kent Ridge Terminal",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

test("API creates a mobile assistance request with the expected standardized data", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify(wheelchairPayload),
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.status, "SENDING");

    const requests = await requestJson(server.baseUrl, "/api/assistance");
    const request = requests.body.requests.find(
      (item: any) => item.requestId === created.body.requestId
    );

    assert.equal(request.busId, "AV-095-01");
    assert.equal(request.source, "MOBILE_APP");
    assert.deepEqual(request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
    assert.equal(request.boardingOrAlighting, "BOARDING");
  } finally {
    await server.close();
  }
});

test("API returns useful validation errors for malformed assistance requests", async () => {
  const server = await startTestServer();
  try {
    const missing = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify({ busId: "AV-095-01" }),
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, "Missing required fields");

    const invalidType = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify({
        ...wheelchairPayload,
        assistanceTypes: ["RAMP_DEPLOYMENT"],
      }),
    });
    assert.equal(invalidType.status, 400);
    assert.equal(invalidType.body.error, "Unsupported assistance type");

    const invalidPhase = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify({
        ...wheelchairPayload,
        boardingOrAlighting: "ARRIVED",
      }),
    });
    assert.equal(invalidPhase.status, 400);
    assert.equal(invalidPhase.body.error, "Unsupported assistance phase");
  } finally {
    await server.close();
  }
});

test("physical button endpoint uses the standardized wheelchair request contract", async () => {
  const server = await startTestServer();
  try {
    const response = await requestJson(
      server.baseUrl,
      "/api/assistance/hardware/physical-button/wheelchair-ramp",
      {
        method: "POST",
        body: JSON.stringify({
          busId: "SBS-191-001",
          busService: "191",
          boardingStop: "Changi Airport Terminal 1",
        }),
      }
    );

    assert.equal(response.status, 201);
    assert.equal(response.body.source, "PHYSICAL_BUTTON");
    assert.equal(response.body.feedback.led, "CONFIRMATION_ON");
    assert.equal(response.body.feedback.buzzer, "SHORT_CONFIRMATION");

    const requests = await requestJson(server.baseUrl, "/api/assistance");
    const request = requests.body.requests.find(
      (item: any) => item.requestId === response.body.requestId
    );
    assert.equal(request.source, "PHYSICAL_BUTTON");
    assert.deepEqual(request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
  } finally {
    await server.close();
  }
});

test("cancelling a request updates state and unknown cancellations return 404", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify(wheelchairPayload),
    });
    const cancelled = await requestJson(
      server.baseUrl,
      `/api/assistance/${created.body.requestId}/cancel`,
      { method: "POST" }
    );

    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.request.status, "CANCELLED");

    const unknown = await requestJson(server.baseUrl, "/api/assistance/REQ-NOT-FOUND/cancel", {
      method: "POST",
    });
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test("location API validates coordinates and returns deterministic nearby stops", async () => {
  const server = await startTestServer();
  try {
    const nearby = await requestJson(server.baseUrl, "/api/location/nearby-bus-stops", {
      method: "POST",
      body: JSON.stringify({
        latitude: 1.2942,
        longitude: 103.7711,
        accuracyMeters: 12,
      }),
    });
    assert.equal(nearby.status, 200);
    assert.deepEqual(
      nearby.body.stops.map((stop: any) => stop.busStopCode),
      ["19011", "18309", "18301", "19019", "18311", "18349", "18341", "18321"]
    );

    const invalid = await requestJson(server.baseUrl, "/api/location/nearby-bus-stops", {
      method: "POST",
      body: JSON.stringify({ latitude: "1.2942" }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "latitude and longitude are required numbers");
  } finally {
    await server.close();
  }
});
