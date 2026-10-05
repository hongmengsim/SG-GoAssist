/**
 * Backend timers that have to agree with what the bus agent does. They are here, with their
 * reasons, so a change to one is made knowing the other.
 *
 * - The agent posts telemetry on change and at least every 5 s (its heartbeat). The backend
 *   treats telemetry as stale only after three heartbeats; at exactly one heartbeat a healthy bus
 *   would look stale a few percent of the time, blocking and unblocking its case.
 * - A deployment command lives longer than the agent's own deployment timeout (30 s chosen by CE2),
 *   so the agent decides first that a deployment has stalled; if the backend expired the command
 *   first it would fail the case while the ramp was still out, and nothing retracts it afterwards.
 */
const fromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const AGENT_HEARTBEAT_MS = 5_000;
export const AGENT_DEPLOYMENT_TIMEOUT_MS = 30_000;

export const TELEMETRY_FRESHNESS_MS = fromEnv(
  "GOASSIST_TELEMETRY_FRESHNESS_MS",
  15_000,
);
export const ACTUATOR_COMMAND_TTL_MS = fromEnv(
  "GOASSIST_ACTUATOR_COMMAND_TTL_MS",
  60_000,
);
