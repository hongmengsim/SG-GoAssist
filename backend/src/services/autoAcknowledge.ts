/**
 * Whether the backend acknowledges assistance requests itself. On by default so the demo
 * and existing flows work; set GOASSIST_AUTO_ACK=off once a real bus agent is connected so
 * that "Confirmed by bus" can only originate from the bus. Read on every call so it can be
 * switched without a restart.
 */
export function isAutoAcknowledgeEnabled(): boolean {
  return process.env.GOASSIST_AUTO_ACK?.toLowerCase() !== "off";
}
