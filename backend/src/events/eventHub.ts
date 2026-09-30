import { logger } from "../services/logger";
import type { MessageBroker } from "./broker";
import { BrokerEventBus } from "./brokerEventBus";
import { InProcessEventBus, type EventBus } from "./eventBus";
import { createRedisBroker } from "./redisBroker";
import { operatorTopicsFor, passengerTopicsFor } from "./topics";
import type { BusEvent } from "./types";

/**
 * The process-wide event bus. Services publish here; the WebSocket gateway subscribes
 * on behalf of its clients. It is in-process by default. To run several backend processes,
 * `configureEventHub` swaps in a broker-backed bus (see `eventBusFromEnvironment`), so an
 * event published in one process reaches clients connected to another.
 */
let hub: EventBus<BusEvent> = new InProcessEventBus<BusEvent>();

export function getEventHub(): EventBus<BusEvent> {
  return hub;
}

/**
 * Replaces the process-wide bus. Call it once at start-up, before anything subscribes:
 * subscriptions made on the old bus are not carried over.
 */
export function configureEventHub(bus: EventBus<BusEvent>): void {
  hub = bus;
}

export interface EventBusEnvironment {
  GOASSIST_EVENT_BUS?: string;
  GOASSIST_REDIS_URL?: string;
}

/**
 * Chooses the bus from the environment: nothing or `memory` for one process, `redis` (with
 * `GOASSIST_REDIS_URL`) to share events between processes. An unknown value is refused
 * rather than silently falling back, because a process that thinks it is sharing events but
 * is not would lose pushes without any sign.
 */
export function eventBusFromEnvironment(
  env: EventBusEnvironment = process.env,
  makeRedisBroker: (url: string) => MessageBroker = createRedisBroker,
): EventBus<BusEvent> {
  const kind = (env.GOASSIST_EVENT_BUS ?? "memory").trim().toLowerCase();
  if (kind === "memory" || kind === "")
    return new InProcessEventBus<BusEvent>();
  if (kind === "redis") {
    const url = env.GOASSIST_REDIS_URL?.trim();
    if (!url)
      throw new Error("GOASSIST_EVENT_BUS=redis needs GOASSIST_REDIS_URL");
    logger.info("Events are shared through Redis");
    return new BrokerEventBus<BusEvent>(makeRedisBroker(url));
  }
  throw new Error(`Unknown GOASSIST_EVENT_BUS: ${kind} (use memory or redis)`);
}

/** Route an event to the passenger and operator topics it belongs to. */
export function publishEvent(message: BusEvent): void {
  hub.publish(
    [...passengerTopicsFor(message), ...operatorTopicsFor(message)],
    message,
  );
}
