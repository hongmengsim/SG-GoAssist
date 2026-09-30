import type { MessageBroker } from "./broker";
import type { Unsubscribe } from "./eventBus";

/**
 * The part of a Redis client this adapter uses. ioredis satisfies it as it is, so the
 * package is not a dependency of the backend: it is loaded only when Redis is chosen, and
 * tests give the adapter a fake that behaves like a Redis server.
 *
 * Redis needs one connection for publishing and another for subscribing, because a
 * connection in subscriber mode can do nothing else.
 */
export interface RedisLikeClient {
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  on(
    event: "message",
    listener: (channel: string, message: string) => void,
  ): unknown;
  quit(): Promise<unknown>;
}

/**
 * A MessageBroker over Redis pub/sub. Each channel is subscribed on the connection once
 * however many handlers listen to it, and left when the last one is removed.
 *
 * NOT YET RUN AGAINST A REAL REDIS SERVER: it is tested against a fake with the same
 * semantics. Run `docs/runbooks/multi-process.md` against a real server before relying on it.
 */
export class RedisBroker implements MessageBroker {
  private readonly handlers = new Map<string, Set<(payload: string) => void>>();

  constructor(
    private readonly publisher: RedisLikeClient,
    private readonly subscriber: RedisLikeClient,
  ) {
    subscriber.on("message", (channel, message) => {
      for (const handler of [...(this.handlers.get(channel) ?? [])])
        handler(message);
    });
  }

  async publish(channel: string, payload: string): Promise<void> {
    await this.publisher.publish(channel, payload);
  }

  async subscribe(
    channel: string,
    handler: (payload: string) => void,
  ): Promise<Unsubscribe> {
    let set = this.handlers.get(channel);
    const isFirst = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    if (isFirst) {
      try {
        await this.subscriber.subscribe(channel);
      } catch (error) {
        // Leave nothing behind, so the next attempt subscribes again instead of assuming this one did.
        set.delete(handler);
        if (set.size === 0 && this.handlers.get(channel) === set)
          this.handlers.delete(channel);
        throw error;
      }
    }
    return () => {
      const current = this.handlers.get(channel);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        this.handlers.delete(channel);
        void this.subscriber.unsubscribe(channel).catch(() => undefined);
      }
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }
}

/**
 * Connects to Redis with ioredis, which must be installed
 * (`npm install ioredis --workspace @buspass/backend`).
 */
export function createRedisBroker(url: string): RedisBroker {
  let Redis: new (url: string) => RedisLikeClient;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Redis = require("ioredis") as typeof Redis;
  } catch {
    throw new Error(
      "GOASSIST_EVENT_BUS=redis needs the ioredis package: npm install ioredis --workspace @buspass/backend",
    );
  }
  return new RedisBroker(new Redis(url), new Redis(url));
}
