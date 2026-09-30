import type { Unsubscribe } from "./eventBus";

/**
 * The transport under a broker-backed event bus: named channels carrying text. Redis pub/sub,
 * NATS and MQTT all fit. A broker delivers each message to every subscriber of the channel in
 * every process, including the process that published it.
 *
 * Contract every adapter meets: messages on one channel arrive in the order they were
 * published; `subscribe` is reference-counted per channel (the channel is left when the last
 * handler unsubscribes); delivery is at most once and best effort, so a message published
 * while a process is disconnected is lost (events here are pushes; clients recover state by
 * reading it, as the bus agent does with its command poll).
 */
export interface MessageBroker {
  publish(channel: string, payload: string): Promise<void>;
  subscribe(
    channel: string,
    handler: (payload: string) => void,
  ): Promise<Unsubscribe>;
  close(): Promise<void>;
}

/**
 * A broker inside one process. It stands in for a real broker in tests: give two event buses
 * the same instance and they behave like two processes sharing a broker. Delivery is
 * asynchronous (a microtask later), like a network broker.
 */
export class MemoryBroker implements MessageBroker {
  private readonly channels = new Map<string, Set<(payload: string) => void>>();

  async publish(channel: string, payload: string): Promise<void> {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      queueMicrotask(() => {
        // A handler that was removed after the publish must not receive the message.
        if (this.channels.get(channel)?.has(handler)) handler(payload);
      });
    }
  }

  async subscribe(
    channel: string,
    handler: (payload: string) => void,
  ): Promise<Unsubscribe> {
    let handlers = this.channels.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.channels.set(channel, handlers);
    }
    handlers.add(handler);
    return () => {
      const current = this.channels.get(channel);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.channels.delete(channel);
    };
  }

  async close(): Promise<void> {
    this.channels.clear();
  }

  /** For tests: how many channels have a subscriber. */
  channelCount(): number {
    return this.channels.size;
  }
}
