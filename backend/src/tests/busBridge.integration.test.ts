import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, startTestServer } from "./helpers/integration";
import { connect, type Connection } from "./helpers/ws";
import {
  getCase,
  registerVehicleCapability,
  submitSignalObservation,
} from "../services/assistanceCaseService";

const BUS = "AV-095-01";
const STOP = "18331";

function busStatus(baseUrl: string, movement: string) {
  return requestJson(baseUrl, `/api/operations/vehicles/${BUS}/status`, {
    method: "POST",
    body: JSON.stringify({
      busService: "95",
      stopCode: STOP,
      movement,
      simulated: true,
      observedAt: new Date().toISOString(),
    }),
  });
}

test("bus movement reaches a passenger's app as the vehicle events it already understands", async () => {
  const server = await startTestServer();
  let passenger: Connection | undefined;
  try {
    const created = await requestJson(
      server.baseUrl,
      "/api/assistance/request",
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: "bridge-passenger",
          busService: "95",
          busId: BUS,
          boardingStop: "18301",
          assistanceTypes: ["WHEELCHAIR_RAMP"],
          source: "MOBILE_APP",
          boardingOrAlighting: "BOARDING",
        }),
      },
    );
    passenger = await connect(server.wsUrl);
    passenger.socket.send(
      JSON.stringify({ type: "SUBSCRIBE", requestId: created.body.requestId }),
    );
    await passenger.waitFor((m) => m.type === "SUBSCRIBED");

    await busStatus(server.baseUrl, "TRAVELLING_TO_STOP");
    await passenger.waitFor(
      (m) => m.type === "VEHICLE_STATUS" && m.status === "APPROACHING",
    );
    await busStatus(server.baseUrl, "POSITIONED_AT_STOP");
    await passenger.waitFor(
      (m) => m.type === "VEHICLE_STATUS" && m.status === "ARRIVED",
    );
    await busStatus(server.baseUrl, "DEPARTING");
    await passenger.waitFor(
      (m) => m.type === "VEHICLE_STATUS" && m.status === "DEPARTED",
    );

    const seen = passenger.messages
      .filter((m) => m.type === "VEHICLE_STATUS")
      .map((m) => m.status);
    assert.deepEqual(seen, ["APPROACHING", "ARRIVED", "DEPARTED"]);
    assert.ok(
      !passenger.messages.some(
        (m) => m.type === "BUS_STATUS" || m.type === "BAY_STATUS",
      ),
    );
  } finally {
    passenger?.socket.close();
    await server.close();
  }
});

test("a Pi halt reported through telemetry blocks deployment until the path is clear again", async () => {
  const server = await startTestServer();
  try {
    registerVehicleCapability({
      busId: BUS,
      busService: "95",
      ramp: true,
      externalAudio: true,
      visualDisplay: true,
      dwellControl: true,
      wheelchairSpaceCapacity: 1,
      supportedTelemetry: [
        "vehicleStopped",
        "parkingBrakeActive",
        "doorOpen",
        "deploymentPathClear",
        "rampPosition",
      ],
      updatedAt: new Date().toISOString(),
    });
    const item = submitSignalObservation({
      signalId: "bridge-signal",
      source: "APP",
      kind: "EXPLICIT_ASSISTANCE_REQUEST",
      stopCode: STOP,
      busCandidate: BUS,
      busService: "95",
      assistanceCandidates: ["WHEELCHAIR_RAMP"],
      confidence: 1,
      anonymousToken: "bridge-passenger",
      observedAt: new Date().toISOString(),
    });
    const telemetry = (deploymentPathClear: boolean) =>
      requestJson(server.baseUrl, `/api/operations/vehicles/${BUS}/telemetry`, {
        method: "POST",
        body: JSON.stringify({
          stopCode: STOP,
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: true,
          deploymentPathClear,
          rampPosition: "STOWED",
          networkOnline: true,
          observedAt: new Date().toISOString(),
        }),
      });
    const pending = async () =>
      (
        await requestJson(
          server.baseUrl,
          `/api/operations/actuators/pending?busId=${BUS}`,
        )
      ).body.count as number;

    assert.equal((await telemetry(false)).status, 202);
    assert.equal(getCase(item.caseId)?.state, "BLOCKED");
    assert.equal(await pending(), 0);

    assert.equal((await telemetry(true)).status, 202);
    assert.equal(getCase(item.caseId)?.state, "ACTUATING");
    assert.equal(await pending(), 1);
  } finally {
    await server.close();
  }
});
