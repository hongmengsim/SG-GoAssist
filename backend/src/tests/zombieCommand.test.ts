import test from "node:test";
import assert from "node:assert/strict";
import { getOperationsData } from "../services/operationsData";
import { listPendingActuatorCommands } from "../services/assistanceCaseService";

test("a command whose terminal status was stored but never closed is not offered, and is closed when seen", async () => {
  const data = await getOperationsData();
  await data.commands.clear();
  await data.statuses.clear();
  const command = {
    commandId: "ZOMBIE-1",
    caseId: "CASE-Z",
    busId: "AV-Z",
    stopCode: "18331",
    command: "DEPLOY_RAMP",
    idempotencyKey: "ZOMBIE-1",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  await data.putCommand(command as never);
  // A crash between the two writes of putStatus: the status is stored, the command still open.
  await data.statuses.put({
    commandId: "ZOMBIE-1",
    caseId: "CASE-Z",
    busId: "AV-Z",
    state: "COMPLETED",
    updatedAt: new Date().toISOString(),
  } as never);
  assert.equal((await data.openCommands(10)).length, 1, "the zombie is open");
  assert.deepEqual(await listPendingActuatorCommands("AV-Z"), []);
  assert.equal(
    (await data.openCommands(10)).length,
    0,
    "reading it closed it, so it is not scanned again",
  );
});
