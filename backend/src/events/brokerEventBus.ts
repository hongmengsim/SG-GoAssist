import crypto from "crypto";
import { logger } from "../services/logger";
import type { MessageBroker } from "./broker";
import {
  ALL_TOPICS,
  type EventBus,
  type EventHandler,
  type HandlerErrorReporter,
  type Unsubscribe,
} from "./eventBus";

/** What travels on a channel: one event, with an id so a handler is never given it twice. */
interface Envelope<T> {
  id: string;
  message: T;
}

/** How many recent event ids are remembered for de-duplication. */
const RECENT_LIMIT = 2_000;

const CHANNEL_PREFIX = "goassist:events:";

const reportToLog: HandlerErrorReporter = (error, topic) => {
  logger.error("Event handler failed", undefined, {
    topic,
    error: error instanceof Error ? error.message : String(error),
  });
};

function channelFor(topic: string): string {
  return `${CHANNEL_PREFIX}${topic}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * An EventBus whose events travel through a broker, so a change made in one backend process
 * reaches clients connected to another.
 *
 * Same behaviour as InProcessEventBus for a subscriber: it gets each message once, however
 * many of the message's topics it subscribed to, and a subscriber to ALL_TOPICS gets every
 * message. Differences that come with a broker: delivery is asynchronous, events on
 * different topics may arrive in a different order than they were published, and delivery is
 * best effort (see MessageBroker).
 *
 * The interface stays synchronous (services publish without waiting). Broker calls are made
 * in the background, and failures are logged and counted, never thrown into a request.
 */
export class BrokerEventBus<T> implements EventBus<T> {
  private readonly local = new Map<string, Set<EventHandler<T>>>();
  private readonly brokerSubscriptions = new Map<
    string,
    Promise<Unsubscribe>
  >();
  /** Event id to the handlers that already received it, newest last. */
  private readonly recent = new Map<string, Set<EventHandler<T>>>();
  private failedPublishes = 0;

  constructor(
    private readonly broker: MessageBroker,
    private readonly reportError: HandlerErrorReporter = reportToLog,
  ) {}

  subscribe(topic: string, handler: EventHandler<T>): Unsubscribe {
    let handlers = this.local.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.local.set(topic, handlers);
      this.joinChannel(topic);
    }
    handlers.add(handler);
    return () => {
      const current = this.local.get(topic);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        this.local.delete(topic);
        this.leaveChannel(topic);
      }
    };
  }

  publish(topics: readonly string[], message: T): void {
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      message,
    } satisfies Envelope<T>);
    for (const topic of new Set([...topics, ALL_TOPICS])) {
      this.broker
        .publish(channelFor(topic), payload)
        .catch((error: unknown) => {
          this.failedPublishes += 1;
          logger.error("Event publish failed", undefined, {
            topic,
            error: describe(error),
          });
        });
    }
  }

  subscriberCount(topic?: string): number {
    if (topic !== undefined) return this.local.get(topic)?.size ?? 0;
    let total = 0;
    for (const handlers of this.local.values()) total += handlers.size;
    return total;
  }

  topicCount(): number {
    return this.local.size;
  }

  /** How many publishes the broker refused or dropped since start (for metrics). */
  get publishFailures(): number {
    return this.failedPublishes;
  }

  /** Leaves every channel and closes the broker connection. */
  async close(): Promise<void> {
    for (const pending of this.brokerSubscriptions.values()) {
      const unsubscribe = await pending.catch(() => undefined);
      unsubscribe?.();
    }
    this.brokerSubscriptions.clear();
    this.local.clear();
    await this.broker.close();
  }

  private joinChannel(topic: string): void {
    const pending = this.broker.subscribe(channelFor(topic), (payload) =>
      this.receive(topic, payload),
    );
    pending.catch((error: unknown) => {
      logger.error("Event subscribe failed", undefined, {
        topic,
        error: describe(error),
      });
    });
    this.brokerSubscriptions.set(topic, pending);
  }

  private leaveChannel(topic: string): void {
    const pending = this.brokerSubscriptions.get(topic);
    this.brokerSubscriptions.delete(topic);
    pending?.then((unsubscribe) => unsubscribe()).catch(() => undefined);
  }

  private receive(topic: string, payload: string): void {
    let envelope: Envelope<T>;
    try {
      envelope = JSON.parse(payload) as Envelope<T>;
      if (typeof envelope?.id !== "string") throw new Error("no event id");
    } catch (error) {
      logger.warn("Ignored an unreadable event", undefined, {
        topic,
        error: describe(error),
      });
      return;
    }
    const handlers = this.local.get(topic);
    if (!handlers) return;
    let delivered = this.recent.get(envelope.id);
    if (!delivered) {
      delivered = new Set();
      this.recent.set(envelope.id, delivered);
      if (this.recent.size > RECENT_LIMIT) {
        const oldest = this.recent.keys().next().value;
        if (oldest !== undefined) this.recent.delete(oldest);
      }
    }
    // Copy so a handler can unsubscribe itself while the message is delivered.
    for (const handler of [...handlers]) {
      if (delivered.has(handler)) continue;
      delivered.add(handler);
      try {
        handler(envelope.message);
      } catch (error) {
        this.reportError(error, topic);
      }
    }
  }
}
