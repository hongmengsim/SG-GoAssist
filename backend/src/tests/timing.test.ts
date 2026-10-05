import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTUATOR_COMMAND_TTL_MS,
  AGENT_DEPLOYMENT_TIMEOUT_MS,
  AGENT_HEARTBEAT_MS,
  TELEMETRY_FRESHNESS_MS,
} from "../services/timing";

test("telemetry is stale only after several heartbeats, so a healthy bus never looks stale", () => {
  assert.ok(TELEMETRY_FRESHNESS_MS >= 3 * AGENT_HEARTBEAT_MS);
});

test("a deployment command outlives the agent's own deployment timeout with room to spare", () => {
  assert.ok(ACTUATOR_COMMAND_TTL_MS >= 2 * AGENT_DEPLOYMENT_TIMEOUT_MS);
});
