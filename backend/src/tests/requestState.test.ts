import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AssistanceRequestStatus,
  type PassengerAssistanceRequest,
} from "@buspass/shared";
import {
  attachCaseToRequest,
  createRequest,
  getRequest,
  getRequestsForBus,
  getRequestsForBusWithStatus,
  processSimulatorCommand,
  processVehicleCommand,
  waitForRequestStatus,
} from "../services/aviator";
import { publishEvent } from "../events/eventHub";
import {
  closeOperationsData,
  configureOperationsData,
  getOperationsData,
} from "../services/operationsData";
import { VehicleStatus } from "@buspass/shared";

let dataDirectory = "";

beforeEach(async () => {
  dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "goassist-requests-"));
  await configureOperationsData(dataDirectory, { retentionTimer: false });
});

afterEach(() => {
  closeOperationsData();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

const baseRequest = (id: string, busId = "BUS-1"): PassengerAssistanceRequest =>
  ({
    requestId: id,
    sessionId: "session",
    busService: "95",
    busId,
    boardingStop: "18301",
    assistanceTypes: ["WHEELCHAIR_RAMP"],
    source: "MOBILE_APP",
    boardingOrAlighting: "BOARDING",
    status: AssistanceRequestStatus.SENDING,
    createdAt: new Date().toISOString(),
  }) as PassengerAssistanceRequest;

test("requests and vehicle statuses survive a restart of the data", async () => {
  await createRequest(baseRequest("REQ-KEEP"));
  await processVehicleCommand({
    busId: "BUS-1",
    status: VehicleStatus.APPROACHING,
  });
  closeOperationsData();
  await configureOperationsData(dataDirectory, { retentionTimer: false });
  assert.equal((await getRequest("REQ-KEEP"))?.busId, "BUS-1");
  // The vehicle status is remembered too, so the same update is recognised as a repeat.
  const repeat = await processVehicleCommand({
    busId: "BUS-1",
    status: VehicleStatus.APPROACHING,
  });
  assert.match(repeat.message, /already/i);
});

test("requests for one bus are found through the bus index, not by reading every request", async () => {
  await createRequest(baseRequest("REQ-A", "BUS-1"));
  await createRequest({
    ...baseRequest("REQ-B", "BUS-2"),
    assistanceTypes: ["EXTENDED_DWELL_TIME"],
  });
  assert.deepEqual(
    (await getRequestsForBus("BUS-2")).map((request) => request.requestId),
    ["REQ-B"],
  );
});

test("a waiter notices a change made by another process even when no push reaches it", async () => {
  await createRequest(baseRequest("REQ-POLL"));
  const waiting = waitForRequestStatus(
    "REQ-POLL",
    AssistanceRequestStatus.ACKNOWLEDGED,
    3_000,
  );
  // Another process changes the stored request; nothing is published to this process.
  const data = await getOperationsData();
  const stored = (await data.requests.get("REQ-POLL"))!;
  await data.requests.put({
    ...stored,
    status: AssistanceRequestStatus.ACKNOWLEDGED,
  });
  const started = Date.now();
  const result = await waiting;
  assert.equal(result?.status, AssistanceRequestStatus.ACKNOWLEDGED);
  assert.ok(Date.now() - started < 1_500, "the poll should find it quickly");
});

test("a waiter is woken at once by a status event on the shared bus", async () => {
  await createRequest(baseRequest("REQ-PUSH"));
  const waiting = waitForRequestStatus(
    "REQ-PUSH",
    AssistanceRequestStatus.ACKNOWLEDGED,
    3_000,
  );
  const data = await getOperationsData();
  const stored = (await data.requests.get("REQ-PUSH"))!;
  await data.requests.put({
    ...stored,
    status: AssistanceRequestStatus.ACKNOWLEDGED,
  });
  publishEvent({
    type: "REQUEST_STATUS",
    requestId: "REQ-PUSH",
    status: AssistanceRequestStatus.ACKNOWLEDGED,
    timestamp: new Date().toISOString(),
  } as never);
  const started = Date.now();
  assert.equal((await waiting)?.status, AssistanceRequestStatus.ACKNOWLEDGED);
  assert.ok(Date.now() - started < 200);
});

test("a waiter that is never satisfied gives back the request when its time is up", async () => {
  await createRequest(baseRequest("REQ-LATE"));
  const result = await waitForRequestStatus(
    "REQ-LATE",
    AssistanceRequestStatus.ACKNOWLEDGED,
    80,
  );
  assert.equal(result?.status, AssistanceRequestStatus.SENDING);
});

test("attaching a case does not overwrite a status change made in between", async () => {
  await createRequest(baseRequest("REQ-RACE"));
  await processSimulatorCommand({
    requestId: "REQ-RACE",
    command: "ACKNOWLEDGE",
  });
  const attached = await attachCaseToRequest("REQ-RACE", "CASE-9", "VALIDATED");
  assert.equal(attached?.caseId, "CASE-9");
  assert.equal(attached?.status, AssistanceRequestStatus.ACKNOWLEDGED);
  assert.equal(
    (await getRequest("REQ-RACE"))?.status,
    AssistanceRequestStatus.ACKNOWLEDGED,
  );
  assert.equal(
    await attachCaseToRequest("NO-SUCH", "CASE-9", "VALIDATED"),
    undefined,
  );
});

test("a bus with more than 500 stored requests still sees its newest waiting request and its newest acknowledged one", async () => {
  const data = await getOperationsData();
  for (let n = 0; n < 520; n += 1)
    await data.requests.put({
      ...baseRequest(`REQ-OLD-${n}`, "BUS-BUSY"),
      status: AssistanceRequestStatus.CANCELLED,
    });
  await data.requests.put(baseRequest("REQ-NEWEST-WAITING", "BUS-BUSY"));
  const waiting = await getRequestsForBusWithStatus(
    "BUS-BUSY",
    AssistanceRequestStatus.SENDING,
  );
  assert.deepEqual(
    waiting.map((request) => request.requestId),
    ["REQ-NEWEST-WAITING"],
  );
  // Duplicate suppression must also see it, however many finished requests come before it.
  const duplicate = await createRequest(
    baseRequest("REQ-DUPLICATE", "BUS-BUSY"),
  );
  assert.equal(duplicate.requestId, "REQ-NEWEST-WAITING");
});

test("two identical requests made at the same instant become one request", async () => {
  const [first, second] = await Promise.all([
    createRequest(baseRequest("REQ-TAP-1", "BUS-TAP")),
    createRequest(baseRequest("REQ-TAP-2", "BUS-TAP")),
  ]);
  assert.equal(first.requestId, second.requestId);
  assert.equal((await getRequestsForBus("BUS-TAP")).length, 1);
});
