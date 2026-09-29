import { InProcessEventBus, type EventBus } from "./eventBus";
import { operatorTopicsFor, passengerTopicsFor } from "./topics";
import type { BusEvent } from "./types";

/**
 * The process-wide event bus. Services publish here; the WebSocket gateway subscribes
 * on behalf of its clients. When the system is split across processes this is the seam
 * where a broker-backed EventBus replaces the in-process one.
 */
const hub = new InProcessEventBus<BusEvent>();

export function getEventHub(): EventBus<BusEvent> {
  return hub;
}

/** Route an event to the passenger and operator topics it belongs to. */
export function publishEvent(message: BusEvent): void {
  hub.publish(
    [...passengerTopicsFor(message), ...operatorTopicsFor(message)],
    message,
  );
}
