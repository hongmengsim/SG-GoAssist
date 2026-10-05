// A request must not be merged into one whose case is over: the bus would never hear about it.
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
import { ALL_TOPICS } from "../events/eventBus";
import { getEventHub } from "../events/eventHub";

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

test("after an operator cancels the case, a new request is a new request and the bus is told", async () => {
  await clearAllRequests();
  await clearOperations();
  const first = await ask("one");
  await processSimulatorCommand({
    requestId: first.request.requestId,
    command: "ACKNOWLEDGE",
  });
  assert.equal(
    (await getRequest(first.request.requestId))?.status,
    AssistanceRequestStatus.ACKNOWLEDGED,
  );
  await applyOperatorAction(first.request.caseId!, "CANCEL");

  const heard: Array<{ type: string }> = [];
  const stop = getEventHub().subscribe(ALL_TOPICS, (message) =>
    heard.push(message as unknown as { type: string }),
  );
  try {
    const second = await ask("two");
    assert.equal(
      second.duplicateOfRequestId,
      undefined,
      "not merged into the dead one",
    );
    assert.notEqual(second.request.requestId, first.request.requestId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(
      heard.some((message) => message.type === "ASSIST_REQUESTED"),
      "ASSIST_REQUESTED was published for the bus",
    );
  } finally {
    stop();
  }
});

test("a request whose case is still open is still merged, so a double tap makes one", async () => {
  await clearAllRequests();
  await clearOperations();
  const first = await ask("a");
  const again = await ask("b");
  assert.equal(again.duplicateOfRequestId, first.request.requestId);
});
