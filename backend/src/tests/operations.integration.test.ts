import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import WebSocket from "ws";
import { requestJson, startTestServer } from "./helpers/integration";

test("passenger-triggered operator help creates one escalated case", async () => {
  const server = await startTestServer();
  try {
    const payload = {
      stopCode: "16171",
      busId: "BUS-151",
      busService: "151",
      phase: "BOARDING",
      anonymousToken: "assistant-passenger",
      idempotencyKey: "assistant-help-journey-7",
      reason: "Passenger explicitly requested human help",
    };
    const first = await requestJson(
      server.baseUrl,
      "/api/operations/passenger-help",
      { method: "POST", body: JSON.stringify(payload) },
    );
    const duplicate = await requestJson(
      server.baseUrl,
      "/api/operations/passenger-help",
      { method: "POST", body: JSON.stringify(payload) },
    );

    assert.equal(first.status, 201);
    assert.equal(first.body.case.state, "ESCALATED");
    assert.match(first.body.case.escalationReason, /human help/i);
    assert.equal(duplicate.body.case.caseId, first.body.case.caseId);
    assert.equal(duplicate.body.case.passengerCount, 1);

    const invalid = await requestJson(
      server.baseUrl,
      "/api/operations/passenger-help",
      { method: "POST", body: JSON.stringify({ stopCode: "16171" }) },
    );
    assert.equal(invalid.status, 400);
  } finally {
    await server.close();
  }
});

test("operations API runs a safe ramp case from intent to verified readiness", async () => {
  const server = await startTestServer();
  try {
    await capability(server.baseUrl);
    const created = await requestJson(
      server.baseUrl,
      "/api/operations/signals",
      {
        method: "POST",
        body: JSON.stringify(signal("APP", "explicit-passenger")),
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.case.state, "BLOCKED");
    assert.match(
      created.body.case.escalationReason,
      /telemetry is unavailable/i,
    );
    const caseId = created.body.case.caseId;

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/BUS-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify(telemetry("STOWED")),
      },
    );
    const pending = await requestJson(
      server.baseUrl,
      "/api/operations/actuators/pending?busId=BUS-DEMO",
    );
    const command = pending.body.commands.find(
      (item: any) => item.command === "DEPLOY_RAMP",
    );
    assert.ok(command);

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/BUS-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify(telemetry("DEPLOYED")),
      },
    );
    const completed = await requestJson(
      server.baseUrl,
      `/api/operations/actuators/${command.commandId}/status`,
      {
        method: "POST",
        body: JSON.stringify({
          caseId,
          busId: "BUS-DEMO",
          state: "COMPLETED",
          rampPosition: "DEPLOYED",
          updatedAt: new Date().toISOString(),
        }),
      },
    );
    assert.equal(completed.body.case.state, "READY");

    const metrics = await requestJson(
      server.baseUrl,
      "/api/operations/metrics",
    );
    assert.equal(metrics.body.explicitRequests, 1);
    assert.equal(metrics.body.safetyBlocks, 1);
  } finally {
    await server.close();
  }
});

test("sensor observations are visible to operators but cannot move the ramp", async () => {
  const server = await startTestServer();
  try {
    await capability(server.baseUrl);
    const created = await requestJson(
      server.baseUrl,
      "/api/operations/signals",
      {
        method: "POST",
        body: JSON.stringify(signal("CAMERA", "anonymous-detection")),
      },
    );
    assert.equal(created.body.case.state, "NEEDS_CONFIRMATION");
    const pending = await requestJson(
      server.baseUrl,
      "/api/operations/actuators/pending",
    );
    assert.equal(pending.body.count, 0);

    const confirmed = await requestJson(
      server.baseUrl,
      `/api/operations/cases/${created.body.case.caseId}/operator`,
      { method: "POST", body: JSON.stringify({ action: "CONFIRM" }) },
    );
    assert.equal(confirmed.body.case.state, "BLOCKED");
    assert.match(
      confirmed.body.case.escalationReason,
      /telemetry is unavailable/i,
    );
  } finally {
    await server.close();
  }
});

test("device authentication verifies the exact JSON bytes sent by firmware", async () => {
  const previousSecret = process.env.DEVICE_SHARED_SECRET;
  const secret = "integration-device-secret";
  process.env.DEVICE_SHARED_SECRET = secret;
  const server = await startTestServer();
  try {
    const deviceId = "STOP-NODE-01";
    const timestamp = String(Date.now());
    const body = `{"signalId":"signed-signal","source":"PHYSICAL_BUTTON","kind":"EXPLICIT_ASSISTANCE_REQUEST","stopCode":"18331","busCandidate":"BUS-DEMO","busService":"95","assistanceCandidates":["WHEELCHAIR_RAMP"],"confidence":1.00,"anonymousToken":"signed-passenger","observedAt":"${new Date().toISOString()}"}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${deviceId}.${timestamp}.${body}`)
      .digest("hex");

    const accepted = await requestJson(
      server.baseUrl,
      "/api/operations/signals",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-timestamp": timestamp,
          "x-signature": signature,
        },
        body,
      },
    );
    assert.equal(accepted.status, 201);

    const changedBytes = JSON.stringify(JSON.parse(body));
    assert.notEqual(changedBytes, body);
    const wrongSignature = crypto
      .createHmac("sha256", secret)
      .update(`${deviceId}.${timestamp}.${changedBytes}`)
      .digest("hex");
    const rejected = await requestJson(
      server.baseUrl,
      "/api/operations/signals",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-timestamp": timestamp,
          "x-signature": wrongSignature,
        },
        body,
      },
    );
    assert.equal(rejected.status, 401);
  } finally {
    await server.close();
    if (previousSecret === undefined) delete process.env.DEVICE_SHARED_SECRET;
    else process.env.DEVICE_SHARED_SECRET = previousSecret;
  }
});

test("perception evaluation API exposes measurable precision and recall", async () => {
  const server = await startTestServer();
  try {
    const first = await requestJson(
      server.baseUrl,
      "/api/operations/perception/evaluations",
      {
        method: "POST",
        body: JSON.stringify({
          sampleId: "trial-wheelchair",
          predicted: ["WHEELCHAIR"],
          actual: ["WHEELCHAIR"],
          confidence: { WHEELCHAIR: 0.96 },
          scenario: "daylight boarding zone",
          observedAt: new Date().toISOString(),
        }),
      },
    );
    assert.equal(first.status, 201);
    const metrics = await requestJson(
      server.baseUrl,
      "/api/operations/perception/metrics",
    );
    assert.equal(metrics.body.sampleCount, 1);
    assert.equal(metrics.body.microPrecision, 1);
    assert.equal(metrics.body.microRecall, 1);
  } finally {
    await server.close();
  }
});

test("operator WebSocket receives safety and case events", async () => {
  const server = await startTestServer();
  const socket = new WebSocket(server.wsUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => {
        socket.send(JSON.stringify({ type: "SUBSCRIBE_OPERATIONS" }));
        resolve();
      });
      socket.once("error", reject);
    });
    const messages: any[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(String(data))));
    await capability(server.baseUrl);
    await requestJson(server.baseUrl, "/api/operations/signals", {
      method: "POST",
      body: JSON.stringify(signal("APP", "websocket-passenger")),
    });
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/BUS-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify(telemetry("STOWED")),
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.ok(messages.some((item) => item.type === "CASE_STATUS"));
    assert.ok(messages.some((item) => item.type === "SAFETY_TELEMETRY"));
  } finally {
    socket.close();
    await server.close();
  }
});

test("mock autonomous bus approaches, precision-stops, opens doors, and departs safely", async () => {
  const server = await startTestServer();
  try {
    await autonomousCapability(server.baseUrl);
    const assigned = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/route",
      {
        method: "PUT",
        body: JSON.stringify({
          busService: "95",
          routeId: "95-demo",
          routeStopCodes: ["18331", "18121"],
          initialDistanceMeters: 450,
        }),
      },
    );
    assert.equal(assigned.status, 201);
    assert.equal(assigned.body.state, "ROUTE_ASSIGNED");

    const started = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/start",
      { method: "POST", body: "{}" },
    );
    assert.equal(started.body.state, "EN_ROUTE");

    const approaching = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 60,
      speedKph: 14,
      localizationAccuracyMeters: 4,
    });
    assert.equal(approaching.body.state, "APPROACHING_STOP");

    const docking = await precisionDocking(server.baseUrl, {
      stopCode: "18331",
      markerId: 18331,
      markerDetected: true,
      markerRangeMm: 610,
      lateralOffsetMm: 20,
      headingErrorDegrees: 1,
      tofDistanceMm: 600,
      tofHealthy: true,
      confidence: 0.97,
      observedAt: new Date().toISOString(),
    });
    assert.equal(docking.body.aligned, true);

    const stopped = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 2,
      speedKph: 1,
      localizationAccuracyMeters: 3,
    });
    assert.equal(stopped.body.state, "STOPPED_SECURE");

    const opened = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/open-doors",
      { method: "POST", body: "{}" },
    );
    assert.equal(opened.body.state, "DOORS_OPEN");

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          stopCode: "18331",
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: true,
          deploymentPathClear: true,
          rampPosition: "DEPLOYED",
          networkOnline: true,
          observedAt: new Date().toISOString(),
        }),
      },
    );
    const rampBlockedDeparture = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/depart",
      {
        method: "POST",
        body: JSON.stringify({ nextStopDistanceMeters: 520 }),
      },
    );
    assert.equal(rampBlockedDeparture.status, 400);

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          stopCode: "18331",
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: true,
          deploymentPathClear: true,
          rampPosition: "STOWED",
          networkOnline: true,
          observedAt: new Date().toISOString(),
        }),
      },
    );

    const departed = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/depart",
      {
        method: "POST",
        body: JSON.stringify({ nextStopDistanceMeters: 520 }),
      },
    );
    assert.equal(departed.body.state, "EN_ROUTE");
    assert.equal(departed.body.targetStopCode, "18121");

    const telemetryResult = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
    );
    assert.equal(telemetryResult.body.vehicleStopped, false);
    assert.equal(telemetryResult.body.doorOpen, false);
    assert.equal(telemetryResult.body.rampPosition, "STOWED");
  } finally {
    await server.close();
  }
});

test("autonomous obstacle response stops safely and requires explicit operator clearance", async () => {
  const server = await startTestServer();
  try {
    await autonomousCapability(server.baseUrl);
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/route",
      {
        method: "PUT",
        body: JSON.stringify({
          busService: "95",
          routeId: "95-demo",
          routeStopCodes: ["18331"],
          initialDistanceMeters: 200,
        }),
      },
    );
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/start",
      { method: "POST", body: "{}" },
    );

    const emergency = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 140,
      speedKph: 20,
      localizationAccuracyMeters: 4,
      obstacleDetected: true,
    });
    assert.equal(emergency.body.state, "EMERGENCY_STOP");
    assert.equal(emergency.body.speedKph, 0);

    const unsafeResume = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/override",
      { method: "POST", body: JSON.stringify({ action: "RESUME" }) },
    );
    assert.equal(unsafeResume.status, 400);

    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          stopCode: "18331",
          vehicleStopped: true,
          parkingBrakeActive: true,
          doorOpen: false,
          deploymentPathClear: true,
          rampPosition: "STOWED",
          networkOnline: true,
          observedAt: new Date().toISOString(),
        }),
      },
    );

    const resumed = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/override",
      {
        method: "POST",
        body: JSON.stringify({
          action: "RESUME",
          obstacleCleared: true,
          localizationAccuracyMeters: 5,
        }),
      },
    );
    assert.equal(resumed.body.state, "EN_ROUTE");
    assert.equal(resumed.body.obstacleDetected, false);
    assert.equal(resumed.body.remoteOverride, false);
  } finally {
    await server.close();
  }
});

test("autonomous secure stop requires fresh camera and ToF docking agreement", async () => {
  const server = await startTestServer();
  try {
    await autonomousCapability(server.baseUrl);
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/route",
      {
        method: "PUT",
        body: JSON.stringify({
          busService: "95",
          routeId: "95-docking-test",
          routeStopCodes: ["18331"],
          initialDistanceMeters: 20,
        }),
      },
    );
    await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/autonomy/start",
      {
        method: "POST",
        body: "{}",
      },
    );

    const withoutSensors = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 2,
      speedKph: 1,
      localizationAccuracyMeters: 3,
    });
    assert.equal(withoutSensors.body.state, "PRECISION_STOPPING");
    assert.match(
      withoutSensors.body.blockReason,
      /waiting for precision docking/i,
    );

    const disagreement = await precisionDocking(server.baseUrl, {
      stopCode: "18331",
      markerId: 18331,
      markerDetected: true,
      markerRangeMm: 1_100,
      lateralOffsetMm: 10,
      headingErrorDegrees: 1,
      tofDistanceMm: 600,
      tofHealthy: true,
      confidence: 0.98,
      observedAt: new Date().toISOString(),
    });
    assert.equal(disagreement.body.aligned, false);
    assert.match(disagreement.body.reason, /do not agree/i);

    const stillUnsafe = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 2,
      speedKph: 1,
      localizationAccuracyMeters: 3,
    });
    assert.equal(stillUnsafe.body.state, "PRECISION_STOPPING");

    await precisionDocking(server.baseUrl, {
      stopCode: "18331",
      markerId: 18331,
      markerDetected: true,
      markerRangeMm: 620,
      lateralOffsetMm: 25,
      headingErrorDegrees: 2,
      tofDistanceMm: 610,
      tofHealthy: true,
      confidence: 0.98,
      observedAt: new Date().toISOString(),
    });
    const secured = await autonomousMotion(server.baseUrl, {
      distanceToTargetMeters: 2,
      speedKph: 1,
      localizationAccuracyMeters: 3,
    });
    assert.equal(secured.body.state, "STOPPED_SECURE");
    assert.equal(secured.body.docking.aligned, true);
  } finally {
    await server.close();
  }
});

test("ramp laser fusion recognizes small light debris without clearing unsafe objects", async () => {
  const server = await startTestServer();
  try {
    await autonomousCapability(server.baseUrl);
    const observedAt = new Date().toISOString();
    const laserTelemetry = {
      stopCode: "18331",
      vehicleStopped: true,
      parkingBrakeActive: true,
      doorOpen: true,
      deploymentPathClear: true,
      rampPosition: "STOWED",
      rampObstacle: {
        laserHealthy: true,
        objectDetected: true,
        nearestDistanceMm: 500,
        occupiedZoneCount: 1,
        criticalZoneOccupied: false,
        classification: "UNKNOWN",
        classificationConfidence: 0,
        blocksDeployment: true,
        reason: "Local laser measurement",
        observedAt,
      },
      networkOnline: true,
      observedAt,
    };
    const unclassified = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
      { method: "POST", body: JSON.stringify(laserTelemetry) },
    );
    assert.equal(unclassified.body.rampObstacle.blocksDeployment, true);

    const debris = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/ramp-obstacle/classification",
      {
        method: "POST",
        body: JSON.stringify({
          classification: "LIGHT_DEBRIS",
          confidence: 0.97,
          observedAt: new Date().toISOString(),
        }),
      },
    );
    assert.equal(debris.body.blocksDeployment, false);
    assert.equal(debris.body.classification, "LIGHT_DEBRIS");

    const criticalAt = new Date().toISOString();
    const critical = await requestJson(
      server.baseUrl,
      "/api/operations/vehicles/AV-DEMO/telemetry",
      {
        method: "POST",
        body: JSON.stringify({
          ...laserTelemetry,
          observedAt: criticalAt,
          rampObstacle: {
            ...laserTelemetry.rampObstacle,
            criticalZoneOccupied: true,
            observedAt: criticalAt,
          },
        }),
      },
    );
    assert.equal(critical.body.rampObstacle.blocksDeployment, true);
    assert.match(critical.body.rampObstacle.reason, /hinge|landing/i);
  } finally {
    await server.close();
  }
});

async function capability(baseUrl: string) {
  return requestJson(
    baseUrl,
    "/api/operations/vehicles/BUS-DEMO/capabilities",
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
          "vehicleStopped",
          "parkingBrakeActive",
          "doorOpen",
        ],
        updatedAt: new Date().toISOString(),
      }),
    },
  );
}

async function autonomousCapability(baseUrl: string) {
  return requestJson(baseUrl, "/api/operations/vehicles/AV-DEMO/capabilities", {
    method: "PUT",
    body: JSON.stringify({
      busService: "95",
      autonomous: true,
      autonomyLevel: "MOCK_ROUTE_AUTOMATION",
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
    }),
  });
}

async function autonomousMotion(
  baseUrl: string,
  body: Record<string, unknown>,
) {
  return requestJson(
    baseUrl,
    "/api/operations/vehicles/AV-DEMO/autonomy/motion",
    { method: "POST", body: JSON.stringify(body) },
  );
}

async function precisionDocking(
  baseUrl: string,
  body: Record<string, unknown>,
) {
  return requestJson(
    baseUrl,
    "/api/operations/vehicles/AV-DEMO/autonomy/docking",
    { method: "POST", body: JSON.stringify(body) },
  );
}

function signal(source: "APP" | "CAMERA", anonymousToken: string) {
  return {
    signalId: `signal-${anonymousToken}`,
    source,
    kind:
      source === "APP" ? "EXPLICIT_ASSISTANCE_REQUEST" : "WHEELCHAIR_DETECTED",
    stopCode: "18331",
    busCandidate: "BUS-DEMO",
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP"],
    confidence: source === "APP" ? 1 : 0.93,
    anonymousToken,
    observedAt: new Date().toISOString(),
  };
}

function telemetry(rampPosition: "STOWED" | "DEPLOYED") {
  return {
    stopCode: "18331",
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    deploymentPathClear: true,
    rampPosition,
    wheelchairSpaceOccupied: false,
    networkOnline: true,
    observedAt: new Date().toISOString(),
  };
}
