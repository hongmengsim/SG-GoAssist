import { logger } from "../services/logger";

export type EventHandler<T> = (message: T) => void;
export type Unsubscribe = () => void;

/** A subscriber to this topic receives every message, whatever its topics. */
export const ALL_TOPICS = "*";

/**
 * Topic-based publish/subscribe. Delivery cost depends on the subscribers of the
 * message's topics, never on the total number of subscribers, so a gateway can hold
 * many clients and still route one event cheaply. The interface is what a broker
 * (NATS, Redis, MQTT) would implement when the system is split across processes.
 */
export interface EventBus<T> {
  publish(topics: readonly string[], message: T): void;
  subscribe(topic: string, handler: EventHandler<T>): Unsubscribe;
  subscriberCount(topic?: string): number;
  topicCount(): number;
}

export type HandlerErrorReporter = (error: unknown, topic: string) => void;

const reportToLog: HandlerErrorReporter = (error, topic) => {
  logger.error("Event handler failed", undefined, {
    topic,
    error: error instanceof Error ? error.message : String(error),
  });
};

export class InProcessEventBus<T> implements EventBus<T> {
  private readonly subscribers = new Map<string, Set<EventHandler<T>>>();

  constructor(
    private readonly reportError: HandlerErrorReporter = reportToLog,
  ) {}

  subscribe(topic: string, handler: EventHandler<T>): Unsubscribe {
    let handlers = this.subscribers.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.subscribers.set(topic, handlers);
    }
    handlers.add(handler);
    return () => {
      const current = this.subscribers.get(topic);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.subscribers.delete(topic);
    };
  }

  publish(topics: readonly string[], message: T): void {
    const delivered = new Set<EventHandler<T>>();
    for (const topic of [...topics, ALL_TOPICS]) {
      const handlers = this.subscribers.get(topic);
      if (!handlers) continue;
      // Copy so a handler can unsubscribe itself while the message is delivered.
      for (const handler of [...handlers]) {
        if (delivered.has(handler)) continue;
        delivered.add(handler);
        try {
          handler(message);
        } catch (error) {
          this.reportError(error, topic);
        }
      }
    }
  }

  subscriberCount(topic?: string): number {
    if (topic !== undefined) return this.subscribers.get(topic)?.size ?? 0;
    let total = 0;
    for (const handlers of this.subscribers.values()) total += handlers.size;
    return total;
  }

  topicCount(): number {
    return this.subscribers.size;
  }
}
