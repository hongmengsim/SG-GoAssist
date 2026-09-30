import test from "node:test";
import assert from "node:assert/strict";
import {
  AssistanceRequestStatus,
  assistanceTypesForPhase,
} from "@buspass/shared";
import {
  clearAllRequests,
  getAllRequests,
  processSimulatorCommand,
} from "../services/aviator";
import {
  createStandardizedAssistanceRequestBundle,
  createStandardizedAssistanceRequest,
  isAssistanceType,
  supportedAssistanceTypes,
} from "../services/assistanceRequestService";

test("supported assistance types are explicitly validated", () => {
  assert.deepEqual(supportedAssistanceTypes, [
    "WHEELCHAIR_RAMP",
    "BUS_AUDIO_IDENTIFICATION",
    "EXTENDED_DWELL_TIME",
  ]);
  assert.equal(isAssistanceType("WHEELCHAIR_RAMP"), true);
  assert.equal(isAssistanceType("BUS_AUDIO_IDENTIFICATION"), true);
  assert.equal(isAssistanceType("EXTENDED_DWELL_TIME"), true);
  assert.equal(isAssistanceType("RAMP_DEPLOYMENT"), false);
});

test("app-selected arrival bus IDs can create standardized assistance requests", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequest(
    {
      sessionId: "app-flow",
      busId: "AV-191-03",
      busService: "191",
      boardingStop: "19011",
      destination: "Kent Ridge Terminal",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  assert.equal(result.request.busId, "AV-191-03");
  assert.equal(result.request.status, AssistanceRequestStatus.SENDING);
  assert.deepEqual(result.request.assistanceTypes, ["WHEELCHAIR_RAMP"]);
});

test("wheelchair ramp requests are rejected for non-accessible vehicles", async () => {
  await clearAllRequests();

  await assert.rejects(
    async () =>
      await createStandardizedAssistanceRequest(
        {
          sessionId: "not-accessible",
          busId: "AV-014-01",
          busService: "14",
          boardingStop: "01012",
          destination: "Bedok",
          assistanceType: "WHEELCHAIR_RAMP",
          source: "MOBILE_APP",
        },
        { autoAcknowledge: false },
      ),
    /not accessible/,
  );
});

test("terminal request statuses cannot be overwritten by later simulator commands", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequest(
    {
      sessionId: "terminal-status",
      busId: "AV-191-04",
      busService: "191",
      assistanceType: "BUS_AUDIO_IDENTIFICATION",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  await processSimulatorCommand({
    requestId: result.request.requestId,
    command: "FAIL",
  });
  const afterAck = await processSimulatorCommand({
    requestId: result.request.requestId,
    command: "ACKNOWLEDGE",
  });

  assert.equal(afterAck.request?.status, AssistanceRequestStatus.FAILED);
});

test("extended dwell time is treated as bus-facing assistance without ramp validation", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequest(
    {
      sessionId: "dwell-time",
      busId: "AV-014-01",
      busService: "14",
      boardingStop: "01012",
      destination: "Bedok",
      assistanceType: "EXTENDED_DWELL_TIME",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  assert.deepEqual(result.request.assistanceTypes, ["EXTENDED_DWELL_TIME"]);
  assert.equal(result.request.status, AssistanceRequestStatus.SENDING);
});

test("verification status is stored separately from selected assistance needs", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequest(
    {
      sessionId: "verified-profile",
      busId: "AV-191-03",
      busService: "191",
      boardingStop: "19011",
      destination: "Kent Ridge Terminal",
      assistanceType: "BUS_AUDIO_IDENTIFICATION",
      source: "MOBILE_APP",
      accessibilityVerificationStatus: "VERIFIED",
      verificationMethod: "DEMO_CREDENTIAL",
    },
    { autoAcknowledge: false },
  );

  assert.deepEqual(result.request.assistanceTypes, [
    "BUS_AUDIO_IDENTIFICATION",
  ]);
  assert.equal(result.request.accessibilityVerificationStatus, "VERIFIED");
  assert.equal(result.request.verificationMethod, "DEMO_CREDENTIAL");
});

test("multiple selected needs share one request lifecycle", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequestBundle(
    {
      sessionId: "multi-need-app-flow",
      busId: "AV-191-03",
      busService: "191",
      boardingStop: "19011",
      destination: "Kent Ridge Terminal",
      assistanceTypes: [
        "WHEELCHAIR_RAMP",
        "BUS_AUDIO_IDENTIFICATION",
        "EXTENDED_DWELL_TIME",
      ],
      source: "MOBILE_APP",
      boardingOrAlighting: "BOARDING",
    },
    { autoAcknowledge: false },
  );

  assert.equal((await getAllRequests()).length, 1);
  assert.deepEqual(result.request.assistanceTypes, [
    "WHEELCHAIR_RAMP",
    "BUS_AUDIO_IDENTIFICATION",
    "EXTENDED_DWELL_TIME",
  ]);
});

test("an existing partial request does not swallow a newly added need", async () => {
  await clearAllRequests();

  const rampOnly = await createStandardizedAssistanceRequest(
    {
      sessionId: "ramp-only",
      busId: "AV-191-03",
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );
  const rampAndAudio = await createStandardizedAssistanceRequestBundle(
    {
      sessionId: "ramp-and-audio",
      busId: "AV-191-03",
      busService: "191",
      assistanceTypes: ["WHEELCHAIR_RAMP", "BUS_AUDIO_IDENTIFICATION"],
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  assert.notEqual(rampAndAudio.request.requestId, rampOnly.request.requestId);
  assert.deepEqual(rampAndAudio.request.assistanceTypes, [
    "WHEELCHAIR_RAMP",
    "BUS_AUDIO_IDENTIFICATION",
  ]);
});

test("assistance preferences map differently for boarding and alighting", () => {
  const preferences = {
    wheelchairRamp: true,
    busAudioIdentification: true,
    extendedDwellTime: true,
  };

  assert.deepEqual(assistanceTypesForPhase(preferences, "BOARDING"), [
    "WHEELCHAIR_RAMP",
    "BUS_AUDIO_IDENTIFICATION",
    "EXTENDED_DWELL_TIME",
  ]);
  assert.deepEqual(assistanceTypesForPhase(preferences, "ALIGHTING"), [
    "WHEELCHAIR_RAMP",
    "EXTENDED_DWELL_TIME",
  ]);
});

test("standardized alighting requests preserve phase and stop code", async () => {
  await clearAllRequests();

  const result = await createStandardizedAssistanceRequest(
    {
      sessionId: "alighting",
      busId: "AV-095-01",
      busService: "95",
      boardingStop: "18301",
      destination: "Kent Ridge Terminal",
      stopCode: "19011",
      assistanceType: "WHEELCHAIR_RAMP",
      boardingOrAlighting: "ALIGHTING",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

  assert.equal(result.request.boardingOrAlighting, "ALIGHTING");
  assert.equal(result.request.stopCode, "19011");
});
