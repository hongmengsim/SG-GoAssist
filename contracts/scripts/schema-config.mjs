/**
 * Types published as JSON Schema. These are the bodies a bus agent posts and the messages
 * an operator client receives; anything else in contracts/src stays TypeScript-only.
 */
export const SCHEMA_TYPES = [
  "BusStatusReport",
  "RampSimulationReport",
  "RampSafetyReport",
  "HelpRequiredReport",
  "SafetyTelemetryReport",
  "AssistRequestForBus",
  "BayStatus",
  "OperatorStatusUpdateMessage",
];
