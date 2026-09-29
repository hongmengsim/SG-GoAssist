import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { requestJson, startTestServer } from "./helpers/integration";

test("passengers receive only fresh parked-bus presence for their stop", async () => {
  const server = await startTestServer();
  const socket = new WebSocket(server.wsUrl);
  const messages: any[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(String(data))));

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => {
        socket.send(
          JSON.stringify({ type: "SUBSCRIBE_STOP", stopCode: "18301" }),
        );
        resolve();
      });
      socket.once("error", reject);
    });

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-095-01/capabilities",
      {
        method: "PUT",
        body: JSON.stringify({
          busService: "95",
          ramp: true,
          externalAudio: true,
          visualDisplay: true,
          dwellControl: true,
          wheelchairSpaceCapacity: 1,
          supportedTelemetry: [
            "stopCode",
            "vehicleStopped",
            "parkingBrakeActive",
          ],
        }),
      },
    );
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-095-01/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          stopCode: "18301",
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: false,
          deploymentPathClear: true,
          rampPosition: "STOWED",
          observedAt: new Date().toISOString(),
        }),
      },
    );

    await waitFor(() =>
      messages.some(
        (message) =>
          message.type === "STOP_VEHICLE_PRESENCE" &&
          message.vehicle?.state === "PARKED",
      ),
    );
    const response = await requestJson(
      server.baseUrl,
      "/api/location/bus-stops/18301/vehicles",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.vehicles[0], {
      busId: "AV-095-01",
      busService: "95",
      stopCode: "18301",
      state: "PARKED",
      destination: "Kent Ridge Terminal",
      wheelchairAccessible: true,
      observedAt: response.body.vehicles[0].observedAt,
      fresh: true,
    });
    assert.equal(
      messages.some((message) => message.type === "SAFETY_TELEMETRY"),
      false,
    );

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/BUS-STALE/capabilities",
      {
        method: "PUT",
        body: JSON.stringify({
          busService: "151",
          ramp: true,
          externalAudio: true,
          visualDisplay: true,
          dwellControl: true,
          wheelchairSpaceCapacity: 1,
          supportedTelemetry: [
            "stopCode",
            "vehicleStopped",
            "parkingBrakeActive",
          ],
        }),
      },
    );
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/BUS-STALE/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          stopCode: "18301",
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: false,
          deploymentPathClear: true,
          rampPosition: "STOWED",
          observedAt: new Date(Date.now() - 30_000).toISOString(),
        }),
      },
    );
    const withStale = await requestJson(
      server.baseUrl,
      "/api/location/bus-stops/18301/vehicles",
    );
    const stale = withStale.body.vehicles.find(
      (vehicle: any) => vehicle.busId === "BUS-STALE",
    );
    assert.equal(stale.state, "PARKED");
    assert.equal(stale.fresh, false);
  } finally {
    socket.close();
    await server.close();
  }
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for stop-presence update");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
