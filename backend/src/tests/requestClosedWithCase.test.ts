// A request must not read ACKNOWLEDGED after its case has been cancelled: the passenger and every list that
// shows open requests would still see it as live. (A completed case is not covered: the request statuses have
// no "completed" value and adding one is a contract change.)
import test from "node:test";
import assert from "node:assert/strict";
import { AssistanceRequestStatus } from "@buspass/shared";
import {
  clearAllRequests,
  getRequest,
  processSimulatorCommand,
} from "../services/aviator";
import { createStandardizedAssistanceRequest } from "../services/assistanceRequestService";
import {
  applyOperatorAction,
  clearOperations,
} from "../services/assistanceCaseService";

const BUS = "SBS-191-001";
const ask = (sessionId: string) =>
  createStandardizedAssistanceRequest(
    {
      sessionId,
      busId: BUS,
      busService: "191",
      assistanceType: "WHEELCHAIR_RAMP",
      source: "MOBILE_APP",
    },
    { autoAcknowledge: false },
  );

const acknowledge = (requestId: string) =>
  processSimulatorCommand({ requestId, command: "ACKNOWLEDGE" });

test("when an operator cancels the case, its request reads CANCELLED", async () => {
  await clearAllRequests();
  await clearOperations();
  const first = await ask("one");
  await acknowledge(first.request.requestId);
  await applyOperatorAction(first.request.caseId!, "CANCEL");

  const request = await getRequest(first.request.requestId);
  assert.equal(request?.status, AssistanceRequestStatus.CANCELLED);
  assert.ok(request?.cancelledAt, "the time of the cancellation is recorded");
});

test("a request that was merged into the case is closed with it", async () => {
  await clearAllRequests();
  await clearOperations();
  const first = await ask("a");
  const again = await ask("b");
  assert.equal(again.duplicateOfRequestId, first.request.requestId);
  await acknowledge(first.request.requestId);
  await applyOperatorAction(first.request.caseId!, "CANCEL");
  assert.equal(
    (await getRequest(first.request.requestId))?.status,
    AssistanceRequestStatus.CANCELLED,
  );
});

test("the request of a case that is still open is left alone, and a cancelled one is not touched twice", async () => {
  await clearAllRequests();
  await clearOperations();
  const open = await ask("open");
  await acknowledge(open.request.requestId);
  assert.equal(
    (await getRequest(open.request.requestId))?.status,
    AssistanceRequestStatus.ACKNOWLEDGED,
  );

  await applyOperatorAction(open.request.caseId!, "CANCEL");
  const once = await getRequest(open.request.requestId);
  await applyOperatorAction(open.request.caseId!, "CANCEL").catch(
    () => undefined,
  );
  const twice = await getRequest(open.request.requestId);
  assert.equal(twice?.status, AssistanceRequestStatus.CANCELLED);
  assert.equal(twice?.cancelledAt, once?.cancelledAt);
});
