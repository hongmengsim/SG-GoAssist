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
  onAssistanceEvent,
  processSimulatorCommand,
  processVehicleCommand,
} from "../services/aviator";
import { createStandardizedAssistanceRequest } from "../services/assistanceRequestService";

function baseRequest(
  requestId: string,
  busId = "SBS-191-001",
  assistanceTypes: PassengerAssistanceRequest["assistanceTypes"] = ["BUS_AUDIO_IDENTIFICATION"]
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

test("all bus-facing assistance requests can be created and acknowledged", () => {
  clearAllRequests();

  const wheelchair = createRequest(baseRequest("REQ-WHEEL", "SBS-191-001", ["WHEELCHAIR_RAMP"]));
  const audio = createRequest(baseRequest("REQ-AUDIO", "SBS-191-002", ["BUS_AUDIO_IDENTIFICATION"]));
  const dwell = createRequest(baseRequest("REQ-DWELL", "SBS-191-003", ["EXTENDED_DWELL_TIME"]));

  assert.deepEqual(wheelchair.assistanceTypes, ["WHEELCHAIR_RAMP"]);
  assert.deepEqual(audio.assistanceTypes, ["BUS_AUDIO_IDENTIFICATION"]);
  assert.deepEqual(dwell.assistanceTypes, ["EXTENDED_DWELL_TIME"]);

  const result = processSimulatorCommand({ requestId: audio.requestId, command: "ACKNOWLEDGE" });
  assert.equal(result.request?.status, AssistanceRequestStatus.ACKNOWLEDGED);
});

test("request source is logged without changing assistance handling", () => {
  clearAllRequests();

  const mobile = createRequest({
    ...baseRequest("REQ-SOURCE-MOBILE", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    sessionId: "shared-passenger",
    source: "MOBILE_APP",
  });
  const button = createRequest({
    ...baseRequest("REQ-SOURCE-BUTTON", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    sessionId: "shared-passenger",
    source: "PHYSICAL_BUTTON",
  });

  assert.equal(mobile.source, "MOBILE_APP");
  assert.equal(button.requestId, mobile.requestId);
  assert.deepEqual(button.assistanceTypes, ["WHEELCHAIR_RAMP"]);
});

test("mobile app and physical button use the same standardized wheelchair request path", () => {
  clearAllRequests();

  const mobile = createStandardizedAssistanceRequest(
    {
      sessionId: "source-mobile",
      busId: "SBS-191-001",
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false }
  );

  assert.equal(mobile.request.source, "MOBILE_APP");
  assert.deepEqual(mobile.request.assistanceTypes, ["WHEELCHAIR_RAMP"]);

  const physical = createStandardizedAssistanceRequest(
    {
      sessionId: "source-button",
      busId: "SBS-191-001",
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "PHYSICAL_BUTTON",
    },
    { autoAcknowledge: false }
  );

  assert.equal(physical.request.requestId, mobile.request.requestId);
  assert.equal(physical.duplicateOfRequestId, mobile.request.requestId);
  assert.deepEqual(physical.request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
});

test("acknowledgement reaches subscribed event listener", () => {
  clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));

  const request = createRequest(baseRequest("REQ-WS"));
  processSimulatorCommand({ requestId: request.requestId, command: "ACKNOWLEDGE" });
  unsubscribe();

  assert.ok(
    messages.some(
      (message) =>
        message.type === "REQUEST_STATUS" &&
        message.requestId === request.requestId &&
        message.status === AssistanceRequestStatus.ACKNOWLEDGED
    )
  );
});

test("request can be cancelled and duplicate active requests are prevented", () => {
  clearAllRequests();

  const first = createRequest(baseRequest("REQ-DUP-1"));
  const duplicate = createRequest(baseRequest("REQ-DUP-2"));
  assert.equal(duplicate.requestId, first.requestId);

  const cancelled = processSimulatorCommand({ requestId: first.requestId, command: "CANCEL" });
  assert.equal(cancelled.request?.status, AssistanceRequestStatus.CANCELLED);

  const retry = createRequest(baseRequest("REQ-DUP-3"));
  assert.equal(retry.requestId, "REQ-DUP-3");
});

test("state machines remain separate", () => {
  clearAllRequests();

  const request = createRequest(baseRequest("REQ-STATE"));
  processSimulatorCommand({ requestId: request.requestId, command: "ACKNOWLEDGE" });
  processVehicleCommand({ busId: request.busId, status: VehicleStatus.APPROACHING });

  assert.equal(request.status, AssistanceRequestStatus.ACKNOWLEDGED);
  assert.equal(VehicleStatus.APPROACHING, "APPROACHING");
});

test("stale vehicle updates cannot move an arrived vehicle backwards", () => {
  clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));
  const request = createRequest(baseRequest("REQ-VEHICLE-ORDER"));

  const approaching = processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  const duplicateApproaching = processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.APPROACHING,
  });
  const arrived = processVehicleCommand({
    busId: request.busId,
    status: VehicleStatus.ARRIVED,
  });
  const staleApproaching = processVehicleCommand({
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

test("acknowledged requests can only remain acknowledged or be cancelled", () => {
  clearAllRequests();
  const messages: StatusUpdateMessage[] = [];
  const unsubscribe = onAssistanceEvent((message) => messages.push(message));
  const request = createRequest(baseRequest("REQ-ACK-TERMINAL"));

  processSimulatorCommand({ requestId: request.requestId, command: "ACKNOWLEDGE" });
  const invalidFailure = processSimulatorCommand({
    requestId: request.requestId,
    command: "FAIL",
  });
  unsubscribe();

  assert.equal(invalidFailure.success, false);
  assert.equal(invalidFailure.request?.status, AssistanceRequestStatus.ACKNOWLEDGED);
  assert.equal(
    messages.filter(
      (message) =>
        message.type === "REQUEST_STATUS" &&
        message.requestId === request.requestId &&
        message.status === AssistanceRequestStatus.FAILED
    ).length,
    0
  );
});

test("audio identification triggers only for matching acknowledged active requests", () => {
  clearAllRequests();

  const request = createRequest(baseRequest("REQ-AUDIO-MATCH"));
  processSimulatorCommand({ requestId: request.requestId, command: "ACKNOWLEDGE" });
  processVehicleCommand({ busId: request.busId, status: VehicleStatus.APPROACHING });
  assert.equal(getAnnouncementEvents().length, 1);

  clearAllRequests();
  const cancelled = createRequest(baseRequest("REQ-AUDIO-CANCELLED"));
  processSimulatorCommand({ requestId: cancelled.requestId, command: "ACKNOWLEDGE" });
  processSimulatorCommand({ requestId: cancelled.requestId, command: "CANCEL" });
  processVehicleCommand({ busId: cancelled.busId, status: VehicleStatus.APPROACHING });
  assert.equal(getAnnouncementEvents().length, 0);

  clearAllRequests();
  const wheelchair = createRequest(baseRequest("REQ-WHEEL-ONLY", "SBS-191-001", ["WHEELCHAIR_RAMP"]));
  processSimulatorCommand({ requestId: wheelchair.requestId, command: "ACKNOWLEDGE" });
  processVehicleCommand({ busId: wheelchair.busId, status: VehicleStatus.APPROACHING });
  assert.equal(getAnnouncementEvents().length, 0);

  clearAllRequests();
  const otherBus = createRequest(baseRequest("REQ-OTHER-BUS", "SBS-191-002"));
  processSimulatorCommand({ requestId: otherBus.requestId, command: "ACKNOWLEDGE" });
  processVehicleCommand({ busId: "SBS-191-001", status: VehicleStatus.APPROACHING });
  assert.equal(getAnnouncementEvents().length, 0);
});

test("failed request can be retried after failure", () => {
  clearAllRequests();

  const failed = createRequest(baseRequest("REQ-FAIL-1"));
  processSimulatorCommand({ requestId: failed.requestId, command: "FAIL" });
  const retry = createRequest(baseRequest("REQ-FAIL-2"));

  assert.equal(failed.status, AssistanceRequestStatus.FAILED);
  assert.equal(retry.requestId, "REQ-FAIL-2");
});

test("boarding and alighting requests are not collapsed as duplicates", () => {
  clearAllRequests();

  const boarding = createRequest(baseRequest("REQ-BOARDING", "SBS-191-001", ["WHEELCHAIR_RAMP"]));
  const alighting = createRequest({
    ...baseRequest("REQ-ALIGHTING", "SBS-191-001", ["WHEELCHAIR_RAMP"]),
    boardingOrAlighting: "ALIGHTING",
    stopCode: "19011",
  });

  assert.equal(boarding.requestId, "REQ-BOARDING");
  assert.equal(alighting.requestId, "REQ-ALIGHTING");
  assert.equal(alighting.boardingOrAlighting, "ALIGHTING");
});
