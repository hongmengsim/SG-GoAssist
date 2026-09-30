import test from "node:test";
import assert from "node:assert/strict";
import { MemoryBroker, type MessageBroker } from "../events/broker";
import { BrokerEventBus } from "../events/brokerEventBus";
import { ALL_TOPICS } from "../events/eventBus";
import { eventBusFromEnvironment } from "../events/eventHub";
import { RedisBroker, type RedisLikeClient } from "../events/redisBroker";

/** Lets queued microtasks and promise callbacks run, as a broker round trip would. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** A stand-in Redis server. It follows the rules that matter to the adapter. */
class FakeRedisServer {
  readonly channels = new Map<string, Set<FakeRedisClient>>();
  subscribeCalls = 0;
  unsubscribeCalls = 0;
}

class FakeRedisClient implements RedisLikeClient {
  private readonly listeners: Array<
    (channel: string, message: string) => void
  > = [];
  private readonly joined = new Set<string>();
  closed = false;

  constructor(private readonly server: FakeRedisServer) {}

  async publish(channel: string, message: string): Promise<number> {
    // A real connection in subscriber mode can do nothing but (un)subscribe.
    if (this.joined.size > 0)
      throw new Error("Connection in subscriber mode cannot publish");
    const receivers = this.server.channels.get(channel) ?? new Set();
    for (const client of receivers)
      queueMicrotask(() => client.receive(channel, message));
    return receivers.size;
  }

  async subscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) {
      this.server.subscribeCalls += 1;
      this.joined.add(channel);
      let set = this.server.channels.get(channel);
      if (!set) {
        set = new Set();
        this.server.channels.set(channel, set);
      }
      set.add(this);
    }
    return this.joined.size;
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    for (const channel of channels) {
      this.server.unsubscribeCalls += 1;
      this.joined.delete(channel);
      this.server.channels.get(channel)?.delete(this);
    }
    return this.joined.size;
  }

  on(
    _event: "message",
    listener: (channel: string, message: string) => void,
  ): void {
    this.listeners.push(listener);
  }

  async quit(): Promise<void> {
    this.closed = true;
  }

  private receive(channel: string, message: string): void {
    for (const listener of this.listeners) listener(channel, message);
  }
}

function redisBroker(server: FakeRedisServer): RedisBroker {
  return new RedisBroker(
    new FakeRedisClient(server),
    new FakeRedisClient(server),
  );
}

const adapters: Array<{ name: string; makeShared: () => () => MessageBroker }> =
  [
    {
      name: "memory broker",
      makeShared: () => {
        const broker = new MemoryBroker();
        // Two processes on one broker: each gets its own view but the same channels.
        return () => broker;
      },
    },
    {
      name: "redis broker (fake server)",
      makeShared: () => {
        const server = new FakeRedisServer();
        return () => redisBroker(server);
      },
    },
  ];

for (const adapter of adapters) {
  const label = `event bus over the ${adapter.name}`;

  test(`${label}: an event published by one process reaches a subscriber in another`, async () => {
    const connect = adapter.makeShared();
    const processA = new BrokerEventBus<{ n: number }>(connect());
    const processB = new BrokerEventBus<{ n: number }>(connect());
    const received: number[] = [];
    processB.subscribe("bus:AV-1", (message) => received.push(message.n));
    await settle();
    processA.publish(["bus:AV-1"], { n: 1 });
    processA.publish(["bus:AV-1"], { n: 2 });
    await settle();
    assert.deepEqual(received, [1, 2]);
  });

  test(`${label}: a publisher also hears its own event, and only on the topics it joined`, async () => {
    const connect = adapter.makeShared();
    const bus = new BrokerEventBus<string>(connect());
    const mine: string[] = [];
    const other: string[] = [];
    bus.subscribe("a", (message) => mine.push(message));
    bus.subscribe("b", (message) => other.push(message));
    await settle();
    bus.publish(["a"], "for a");
    await settle();
    assert.deepEqual(mine, ["for a"]);
    assert.deepEqual(other, []);
  });

  test(`${label}: a handler on two of a message's topics gets it once`, async () => {
    const connect = adapter.makeShared();
    const publisher = new BrokerEventBus<string>(connect());
    const subscriber = new BrokerEventBus<string>(connect());
    const seen: string[] = [];
    const handler = (message: string) => seen.push(message);
    subscriber.subscribe("bus:AV-1", handler);
    subscriber.subscribe("stop:18331", handler);
    await settle();
    publisher.publish(["bus:AV-1", "stop:18331"], "once");
    await settle();
    assert.deepEqual(seen, ["once"]);
  });

  test(`${label}: a subscriber to every topic gets every event`, async () => {
    const connect = adapter.makeShared();
    const publisher = new BrokerEventBus<string>(connect());
    const subscriber = new BrokerEventBus<string>(connect());
    const seen: string[] = [];
    subscriber.subscribe(ALL_TOPICS, (message) => seen.push(message));
    await settle();
    publisher.publish(["bus:AV-1"], "one");
    publisher.publish(["stop:1"], "two");
    publisher.publish([], "three");
    await settle();
    assert.deepEqual(seen.sort(), ["one", "three", "two"]);
  });

  test(`${label}: after unsubscribing a handler receives nothing more`, async () => {
    const connect = adapter.makeShared();
    const bus = new BrokerEventBus<string>(connect());
    const seen: string[] = [];
    const unsubscribe = bus.subscribe("t", (message) => seen.push(message));
    await settle();
    bus.publish(["t"], "before");
    await settle();
    unsubscribe();
    await settle();
    bus.publish(["t"], "after");
    await settle();
    assert.deepEqual(seen, ["before"]);
    assert.equal(bus.subscriberCount(), 0);
    assert.equal(bus.topicCount(), 0);
  });

  test(`${label}: one handler failing does not stop the others`, async () => {
    const connect = adapter.makeShared();
    const errors: string[] = [];
    const bus = new BrokerEventBus<string>(connect(), (error) =>
      errors.push(String(error)),
    );
    const seen: string[] = [];
    bus.subscribe("t", () => {
      throw new Error("boom");
    });
    bus.subscribe("t", (message) => seen.push(message));
    await settle();
    bus.publish(["t"], "x");
    await settle();
    assert.deepEqual(seen, ["x"]);
    assert.equal(errors.length, 1);
  });

  test(`${label}: an unreadable payload on a channel is ignored`, async () => {
    const connect = adapter.makeShared();
    const broker = connect();
    const bus = new BrokerEventBus<string>(broker);
    const seen: string[] = [];
    bus.subscribe("t", (message) => seen.push(message));
    await settle();
    await broker.publish("goassist:events:t", "not json");
    await broker.publish(
      "goassist:events:t",
      JSON.stringify({ message: "no id" }),
    );
    bus.publish(["t"], "good");
    await settle();
    assert.deepEqual(seen, ["good"]);
  });
}

test("the redis adapter joins a channel once however many handlers listen, and leaves with the last", async () => {
  const server = new FakeRedisServer();
  const bus = new BrokerEventBus<string>(redisBroker(server));
  const first = bus.subscribe("t", () => undefined);
  const second = bus.subscribe("t", () => undefined);
  await settle();
  // The bus asks the broker once per topic, and the adapter once per channel.
  assert.equal(server.subscribeCalls, 1);
  first();
  await settle();
  assert.equal(server.unsubscribeCalls, 0);
  second();
  await settle();
  assert.equal(server.unsubscribeCalls, 1);
  assert.equal(server.channels.get("goassist:events:t")?.size ?? 0, 0);
});

test("the redis adapter publishes and subscribes on separate connections", async () => {
  const server = new FakeRedisServer();
  const publisher = new FakeRedisClient(server);
  const subscriber = new FakeRedisClient(server);
  const broker = new RedisBroker(publisher, subscriber);
  const seen: string[] = [];
  await broker.subscribe("c", (payload) => seen.push(payload));
  // Publishing on the subscriber connection would be refused; the adapter must not do that.
  await broker.publish("c", "hello");
  await settle();
  assert.deepEqual(seen, ["hello"]);
  await broker.close();
  assert.ok(publisher.closed && subscriber.closed);
});

test("a broker that refuses a publish is counted and logged, and never thrown into the caller", async () => {
  const failing: MessageBroker = {
    publish: async () => {
      throw new Error("broker down");
    },
    subscribe: async () => () => undefined,
    close: async () => undefined,
  };
  const bus = new BrokerEventBus<string>(failing);
  assert.doesNotThrow(() => bus.publish(["a", "b"], "x"));
  await settle();
  // Once per topic, plus the all-topics channel.
  assert.equal(bus.publishFailures, 3);
});

test("the bus is chosen from the environment, and a wrong choice is refused", () => {
  assert.ok(eventBusFromEnvironment({}));
  assert.ok(eventBusFromEnvironment({ GOASSIST_EVENT_BUS: "memory" }));
  assert.throws(
    () => eventBusFromEnvironment({ GOASSIST_EVENT_BUS: "redis" }),
    /GOASSIST_REDIS_URL/,
  );
  assert.throws(
    () => eventBusFromEnvironment({ GOASSIST_EVENT_BUS: "kafka" }),
    /Unknown GOASSIST_EVENT_BUS/,
  );
  let asked = "";
  const bus = eventBusFromEnvironment(
    { GOASSIST_EVENT_BUS: "redis", GOASSIST_REDIS_URL: "redis://x:6379" },
    (url) => {
      asked = url;
      return new MemoryBroker();
    },
  );
  assert.ok(bus);
  assert.equal(asked, "redis://x:6379");
});

test("a subscribe that fails once can be retried, and the failed attempt leaves nothing behind", async () => {
  const server = new FakeRedisServer();
  const publisher = new FakeRedisClient(server);
  const subscriber = new FakeRedisClient(server);
  let failNext = true;
  const original = subscriber.subscribe.bind(subscriber);
  subscriber.subscribe = async (...channels: string[]) => {
    if (failNext) {
      failNext = false;
      throw new Error("connection reset");
    }
    return original(...channels);
  };
  const broker = new RedisBroker(publisher, subscriber);
  const received: string[] = [];
  await assert.rejects(
    broker.subscribe("c", (payload) => received.push(payload)),
  );
  // The retry must really subscribe on the connection, not assume the first attempt did.
  await broker.subscribe("c", (payload) => received.push(payload));
  await broker.publish("c", "hello");
  await settle();
  assert.deepEqual(received, ["hello"]);
});
