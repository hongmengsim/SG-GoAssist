import test from "node:test";
import assert from "node:assert/strict";
import {
  AssistanceRequestStatus,
  PassengerAssistanceRequest,
  StatusUpdateMessage,
  VehicleStatus,
} from "@buspass/shared";
import {
  clearAllRequests,
  createRequest,
  getAnnouncementEvents,
  getRequest,
  onAssistanceEvent,
  processSimulatorCommand,
  processVehicleCommand,
} from "../services/aviator";
import { createStandardizedAssistanceRequest } from "../services/assistanceRequestService";

function baseRequest(
  requestId: string,
  busId = "SBS-191-001",
  assistanceTypes: PassengerAssistanceRequest["assistanceTypes"] = [
    "BUS_AUDIO_IDENTIFICATION",
  ],
): PassengerAssistanceRequest {
  return {
    requestId,
    sessionId: "test-session",
    busService: "191",
    busId,
    boardingStop: "Changi Airport Terminal 1",
    destination: "Kent Ridge Terminal",
    assistanceTypes,
    source: "MOBILE_APP",
    boardingOrAlighting: "BOARDING",
    status: AssistanceRequestStatus.SENDING,
    createdAt: new Date().toISOString(),
  };
}

test("all bus-facing assistance requests can be created and acknowledged", async () => {
  await clearAllRequests();

  const wheelchair = await createRequest(
    baseRequest("REQ-WHEEL", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
  );
  const audio = await createRequest(
    baseRequest("REQ-AUDIO", "SBS-191-002", ["BUS_AUDIO_IDENTIFICATION"]),
  );
  const dwell = await createRequest(
    baseRequest("REQ-DWELL", "SBS-191-003", ["EXTENDED_DWELL_TIME"]),
  );

  assert.deepEqual(wheelchair.assistanceTypes, ["WHEELCHAIR_RAMP"]);
  assert.deepEqual(audio.assistanceTypes, ["BUS_AUDIO_IDENTIFICATION"]);
  assert.deepEqual(dwell.assistanceTypes, ["EXTENDED_DWELL_TIME"]);

  const result = await processSimulatorCommand({
    requestId: audio.requestId,
    command: "ACKNOWLEDGE",
  });
  assert.equal(result.request?.status, AssistanceRequestStatus.ACKNOWLEDGED);
});

test("request source is logged without changing assistance handling", async () => {
  await clearAllRequests();

  const mobile = await createRequest({
    ...baseRequest("REQ-SOURCE-MOBILE", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    sessionId: "shared-passenger",
    source: "MOBILE_APP",
  });
  const button = await createRequest({
    ...baseRequest("REQ-SOURCE-BUTTON", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    sessionId: "shared-passenger",
    source: "PHYSICAL_BUTTON",
  });

  assert.equal(mobile.source, "MOBILE_APP");
  assert.equal(button.requestId, mobile.requestId);
  assert.deepEqual(button.assistanceTypes, ["WHEELCHAIR_RAMP"]);
});

test("mobile app and physical button use the same standardized wheelchair request path", async () => {
  await clearAllRequests();

  const mobile = await createStandardizedAssistanceRequest(
    {
      sessionId: "source-mobile",
      busId: "SBS-191-001",
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  assert.equal(mobile.request.source, "MOBILE_APP");
  assert.deepEqual(mobile.request.assistanceTypes, ["WHEELCHAIR_RAMP"]);

  const physical = await createStandardizedAssistanceRequest(
    {
      sessionId: "source-button",
      busId: "SBS-191-001",
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "PHYSICAL_BUTTON",
    },
    { autoAcknowledge: false },
  );

  assert.equal(physical.request.requestId, mobile.request.requestId);
  assert.equal(physical.duplicateOfRequestId, mobile.request.requestId);
  assert.deepEqual(physical.request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
});

test("acknowledgement reaches subscribed event listener", async () => {
  await clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));

  const request = await createRequest(baseRequest("REQ-WS"));
  await processSimulatorCommand({
    requestId: request.requestId,
    command: "ACKNOWLEDGE",
  });
  unsubscribe();

  assert.ok(
    messages.some(
      (message) =>
        message.type === "REQUEST_STATUS" &&
        message.requestId === request.requestId &&
        message.status === AssistanceRequestStatus.ACKNOWLEDGED,
    ),
  );
});

test("request can be cancelled and duplicate active requests are prevented", async () => {
  await clearAllRequests();

  const first = await createRequest(baseRequest("REQ-DUP-1"));
  const duplicate = await createRequest(baseRequest("REQ-DUP-2"));
  assert.equal(duplicate.requestId, first.requestId);

  const cancelled = await processSimulatorCommand({
    requestId: first.requestId,
    command: "CANCEL",
  });
  assert.equal(cancelled.request?.status, AssistanceRequestStatus.CANCELLED);

  const retry = await createRequest(baseRequest("REQ-DUP-3"));
  assert.equal(retry.requestId, "REQ-DUP-3");
});

test("state machines remain separate", async () => {
  await clearAllRequests();

  const request = await createRequest(baseRequest("REQ-STATE"));
  await processSimulatorCommand({
    requestId: request.requestId,
    command: "ACKNOWLEDGE",
  });
  await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });

  // Requests come back from storage as copies, so read the stored one to see the change.
  assert.equal(
    (await getRequest(request.requestId))?.status,
    AssistanceRequestStatus.ACKNOWLEDGED,
  );
  assert.equal(VehicleStatus.APPROACHING, "APPROACHING");
});

test("stale vehicle updates cannot move an arrived vehicle backwards", async () => {
  await clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));
  const request = await createRequest(baseRequest("REQ-VEHICLE-ORDER"));

  const approaching = await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  const duplicateApproaching = await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  const arrived = await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.ARRIVED,
  });
  const staleApproaching = await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  unsubscribe();

  assert.equal(approaching.success, true);
  assert.equal(duplicateApproaching.success, true);
  assert.equal(arrived.success, true);
  assert.equal(staleApproaching.success, false);
  assert.equal(staleApproaching.vehicleEvent.status, VehicleStatus.ARRIVED);
  assert.equal(
    messages.filter(
      (message) =>
        message.type === "VEHICLE_STATUS" &&
        message.status === VehicleStatus.APPROACHING,
    ).length,
    1,
  );
});

test("acknowledged requests can only remain acknowledged or be cancelled", async () => {
  await clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));
  const request = await createRequest(baseRequest("REQ-ACK-TERMINAL"));

  await processSimulatorCommand({
    requestId: request.requestId,
    command: "ACKNOWLEDGE",
  });
  const invalidFailure = await processSimulatorCommand({
    requestId: request.requestId,
    command: "FAIL",
  });
  unsubscribe();

  assert.equal(invalidFailure.success, false);
  assert.equal(
    invalidFailure.request?.status,
    AssistanceRequestStatus.ACKNOWLEDGED,
  );
  assert.equal(
    messages.filter(
      (message) =>
        message.type === "REQUEST_STATUS" &&
        message.requestId === request.requestId &&
        message.status === AssistanceRequestStatus.FAILED,
    ).length,
    0,
  );
});

test("audio identification triggers only for matching acknowledged active requests", async () => {
  await clearAllRequests();

  const request = await createRequest(baseRequest("REQ-AUDIO-MATCH"));
  await processSimulatorCommand({
    requestId: request.requestId,
    command: "ACKNOWLEDGE",
  });
  await processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  assert.equal((await getAnnouncementEvents()).length, 1);

  await clearAllRequests();
  const cancelled = await createRequest(baseRequest("REQ-AUDIO-CANCELLED"));
  await processSimulatorCommand({
    requestId: cancelled.requestId,
    command: "ACKNOWLEDGE",
  });
  await processSimulatorCommand({
    requestId: cancelled.requestId,
    command: "CANCEL",
  });
  await processVehicleCommand({
    busId: cancelled.busId,
    status: VehicleStatus.APPROACHING,
  });
  assert.equal((await getAnnouncementEvents()).length, 0);

  await clearAllRequests();
  const wheelchair = await createRequest(
    baseRequest("REQ-WHEEL-ONLY", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
  );
  await processSimulatorCommand({
    requestId: wheelchair.requestId,
    command: "ACKNOWLEDGE",
  });
  await processVehicleCommand({
    busId: wheelchair.busId,
    status: VehicleStatus.APPROACHING,
  });
  assert.equal((await getAnnouncementEvents()).length, 0);

  await clearAllRequests();
  const otherBus = await createRequest(
    baseRequest("REQ-OTHER-BUS", "SBS-191-002"),
  );
  await processSimulatorCommand({
    requestId: otherBus.requestId,
    command: "ACKNOWLEDGE",
  });
  await processVehicleCommand({
    busId: "SBS-191-001",
    status: VehicleStatus.APPROACHING,
  });
  assert.equal((await getAnnouncementEvents()).length, 0);
});

test("failed request can be retried after failure", async () => {
  await clearAllRequests();

  const failed = await createRequest(baseRequest("REQ-FAIL-1"));
  await processSimulatorCommand({
    requestId: failed.requestId,
    command: "FAIL",
  });
  const retry = await createRequest(baseRequest("REQ-FAIL-2"));

  assert.equal(
    (await getRequest(failed.requestId))?.status,
    AssistanceRequestStatus.FAILED,
  );
  assert.equal(retry.requestId, "REQ-FAIL-2");
});

test("boarding and alighting requests are not collapsed as duplicates", async () => {
  await clearAllRequests();

  const boarding = await createRequest(
    baseRequest("REQ-BOARDING", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
  );
  const alighting = await createRequest({
    ...baseRequest("REQ-ALIGHTING", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    boardingOrAlighting: "ALIGHTING",
    stopCode: "19011",
  });

  assert.equal(boarding.requestId, "REQ-BOARDING");
  assert.equal(alighting.requestId, "REQ-ALIGHTING");
  assert.equal(alighting.boardingOrAlighting, "ALIGHTING");
});
