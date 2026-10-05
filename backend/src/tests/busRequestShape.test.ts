// What the backend pushes to a bus (toBusRequest) must match the JSON Schema the Pi side validates
// against, and must never carry passenger identity.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AssistanceRequestStatus,
  type PassengerAssistanceRequest,
} from "@buspass/shared";
import { toBusRequest } from "../services/busRequest";

const schema = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../contracts/schema/AssistRequestForBus.schema.json",
    ),
    "utf8",
  ),
) as {
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties?: boolean;
};

const request: PassengerAssistanceRequest = {
  requestId: "REQ-1",
  sessionId: "secret-session",
  caseId: "CASE-1",
  busService: "95",
  busId: "AV-095-01",
  boardingStop: "18301",
  stopCode: "18331",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
  status: AssistanceRequestStatus.SENDING,
  createdAt: "2026-10-05T00:00:00.000Z",
} as PassengerAssistanceRequest;

test("a request pushed to a bus has exactly the fields the schema allows and none that identify the passenger", () => {
  const pushed = toBusRequest(request);
  assert.equal(schema.additionalProperties, false);
  for (const key of Object.keys(pushed))
    assert.ok(key in schema.properties, `${key} is not in the schema`);
  for (const key of schema.required)
    assert.ok(key in pushed, `${key} is required by the schema`);
  assert.equal("sessionId" in pushed, false);
  assert.equal("source" in pushed, false);
});
