const baseUrl = process.env.GOASSIST_API_URL ?? "http://localhost:3000";
const busId = "DEMO-BUS-01";
const stopCode = "18331";

async function main() {
  await put(`/api/operations/vehicles/${busId}/capabilities`, {
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

  const created = await post(`/api/operations/signals`, {
    signalId: `demo-${Date.now()}`,
    source: "PHYSICAL_BUTTON",
    kind: "EXPLICIT_ASSISTANCE_REQUEST",
    stopCode,
    busCandidate: busId,
    busService: "95",
    assistanceCandidates: ["WHEELCHAIR_RAMP", "EXTENDED_DWELL_TIME"],
    confidence: 1,
    anonymousToken: `demo-passenger-${Date.now()}`,
    observedAt: new Date().toISOString(),
  });
  const caseId = created.case.caseId;
  console.log(`Case ${caseId}: ${created.case.state}`);

  await sendTelemetry("STOWED");
  const pending = await get(`/api/operations/actuators/pending?busId=${busId}`);
  console.log(
    `Commands issued: ${pending.commands.map((item: any) => item.command).join(", ")}`,
  );

  for (const command of pending.commands) {
    await post(`/api/operations/actuators/${command.commandId}/status`, {
      caseId,
      busId,
      state: "IN_PROGRESS",
      updatedAt: new Date().toISOString(),
    });
    if (command.command === "DEPLOY_RAMP") await sendTelemetry("DEPLOYED");
    await post(`/api/operations/actuators/${command.commandId}/status`, {
      caseId,
      busId,
      state: "COMPLETED",
      rampPosition: command.command === "DEPLOY_RAMP" ? "DEPLOYED" : undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  const ready = await get(`/api/operations/cases/${caseId}`);
  console.log(`Safety-verified state: ${ready.state}`);
  const closing = await post(`/api/operations/cases/${caseId}/operator`, {
    action: "COMPLETE",
  });
  console.log(`Completion detected: ${closing.case.state}`);
  const closingCommands = await get(
    `/api/operations/actuators/pending?busId=${busId}`,
  );
  const retract = closingCommands.commands.find(
    (item: any) => item.command === "RETRACT_RAMP",
  );
  if (retract) {
    await post(`/api/operations/actuators/${retract.commandId}/status`, {
      caseId,
      busId,
      state: "IN_PROGRESS",
      updatedAt: new Date().toISOString(),
    });
    await sendTelemetry("RETRACTING");
    await sendTelemetry("STOWED");
    await post(`/api/operations/actuators/${retract.commandId}/status`, {
      caseId,
      busId,
      state: "COMPLETED",
      rampPosition: "STOWED",
      updatedAt: new Date().toISOString(),
    });
  }
  const completed = await get(`/api/operations/cases/${caseId}`);
  console.log(`Final state: ${completed.state}`);
  console.log("Metrics:", await get(`/api/operations/metrics`));
}

async function sendTelemetry(
  rampPosition: "STOWED" | "DEPLOYED" | "RETRACTING",
) {
  return await post(`/api/operations/vehicles/${busId}/telemetry`, {
    stopCode,
    vehicleStopped: true,
    parkingBrakeActive: true,
    doorOpen: true,
    deploymentPathClear: true,
    rampPosition,
    wheelchairSpaceOccupied: false,
    networkOnline: true,
    observedAt: new Date().toISOString(),
  });
}

async function get(path: string): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`);
  return await response.json();
}

async function post(path: string, body: unknown) {
  return await request(path, "POST", body);
}

async function put(path: string, body: unknown) {
  return await request(path, "PUT", body);
}

async function request(
  path: string,
  method: string,
  body: unknown,
): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`);
  return await response.json();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
