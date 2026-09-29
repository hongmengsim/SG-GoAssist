import test from "node:test";
import assert from "node:assert/strict";
import {
  requestJson,
  startTestServer,
  subscribeAndCollect,
} from "./helpers/integration";

const audioPayload = {
  sessionId: "ws-audio",
  busService: "191",
  busId: "SBS-191-001",
  boardingStop: "Changi Airport Terminal 1",
  destination: "Kent Ridge Terminal",
  assistanceTypes: ["BUS_AUDIO_IDENTIFICATION"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

test("WebSocket subscription replays the current request status", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify(audioPayload),
      },
    );

    const subscription = subscribeAndCollect(
      server.wsUrl,
      created.body.requestId,
      ["REQUEST_STATUS:SENDING"],
    );
    const seen = await subscription.done;
    subscription.socket.close();

    assert.ok(seen.some((message) => message.type === "SUBSCRIBED"));
    assert.ok(
      seen.some(
        (message) =>
          message.type === "REQUEST_STATUS" && message.status === "SENDING",
      ),
    );
  } finally {
    await server.close();
  }
});

test("WebSocket subscriber receives acknowledgement, approach, arrival, and announcement", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify(audioPayload),
      },
    );

    const subscription = subscribeAndCollect(
      server.wsUrl,
      created.body.requestId,
      [
        "REQUEST_STATUS:ACKNOWLEDGED",
        "VEHICLE_STATUS:APPROACHING",
        "EXTERNAL_ANNOUNCEMENT:Bus 191",
        "VEHICLE_STATUS:ARRIVED",
      ],
    );

    await requestJson(server.baseUrl, "/api/assistance/simulator/command", {
      method: "POST",
      body: JSON.stringify({
        requestId: created.body.requestId,
        command: "ACKNOWLEDGE",
      }),
    });
    await requestJson(server.baseUrl, "/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({
        busId: audioPayload.busId,
        status: "APPROACHING",
      }),
    });
    await requestJson(server.baseUrl, "/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({ busId: audioPayload.busId, status: "ARRIVED" }),
    });

    const seen = await subscription.done;
    subscription.socket.close();

    assert.ok(seen.some((message) => message.status === "ACKNOWLEDGED"));
    assert.ok(seen.some((message) => message.status === "APPROACHING"));
    assert.ok(seen.some((message) => message.status === "ARRIVED"));
  } finally {
    await server.close();
  }
});

test("WebSocket subscriber receives cancellation updates", async () => {
  const server = await startTestServer();
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify(audioPayload),
      },
    );

    const subscription = subscribeAndCollect(
      server.wsUrl,
      created.body.requestId,
      ["REQUEST_STATUS:CANCELLED"],
    );
    await requestJson(
      server.baseUrl,
      `/api/assistance/${created.body.requestId}/cancel`,
      {
        method: "POST",
      },
    );

    const seen = await subscription.done;
    subscription.socket.close();
    assert.ok(seen.some((message) => message.status === "CANCELLED"));
  } finally {
    await server.close();
  }
});

test("WebSocket vehicle events are isolated to the subscribed passenger bus", async () => {
  const server = await startTestServer();
  try {
    const bus191 = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify(audioPayload),
      },
    );
    const bus95 = await requestJson(server.baseUrl, "/api/assistance/request", {
      method: "POST",
      body: JSON.stringify({
        ...audioPayload,
        sessionId: "ws-bus-95",
        busService: "95",
        busId: "AV-095-01",
        boardingStop: "18301",
        destination: "Kent Ridge Terminal",
      }),
    });

    const passenger191 = subscribeAndCollect(
      server.wsUrl,
      bus191.body.requestId,
      ["VEHICLE_STATUS:APPROACHING"],
      300,
    );
    const passenger95 = subscribeAndCollect(
      server.wsUrl,
      bus95.body.requestId,
      ["VEHICLE_STATUS:APPROACHING"],
    );

    await Promise.all([
      passenger191.waitForLabels(["SUBSCRIBED:undefined"]),
      passenger95.waitForLabels(["SUBSCRIBED:undefined"]),
    ]);

    await requestJson(server.baseUrl, "/api/assistance/simulator/command", {
      method: "POST",
      body: JSON.stringify({
        requestId: bus95.body.requestId,
        command: "ACKNOWLEDGE",
      }),
    });
    await requestJson(server.baseUrl, "/api/assistance/simulator/vehicle", {
      method: "POST",
      body: JSON.stringify({ busId: "AV-095-01", status: "APPROACHING" }),
    });

    const seen95 = await passenger95.done;
    passenger95.socket.close();
    passenger191.socket.close();

    assert.ok(seen95.some((message) => message.busId === "AV-095-01"));
    await assert.rejects(passenger191.done, /Timed out/);
  } finally {
    await server.close();
  }
});
