import test from "node:test";
import assert from "node:assert/strict";
import { ALL_TOPICS, InProcessEventBus } from "../events/eventBus";

function collector() {
  const received: string[] = [];
  return {
    received,
    handler: (message: string) => void received.push(message),
  };
}

test("a message reaches only subscribers of its topics", () => {
  const bus = new InProcessEventBus<string>();
  const a = collector();
  const b = collector();
  bus.subscribe("bus:1", a.handler);
  bus.subscribe("bus:2", b.handler);
  bus.publish(["bus:1"], "for one");
  assert.deepEqual(a.received, ["for one"]);
  assert.deepEqual(b.received, []);
});

test("a subscriber to the all-topics wildcard receives every message", () => {
  const bus = new InProcessEventBus<string>();
  const all = collector();
  bus.subscribe(ALL_TOPICS, all.handler);
  bus.publish(["bus:1"], "one");
  bus.publish(["stop:9"], "two");
  bus.publish([], "three");
  assert.deepEqual(all.received, ["one", "two", "three"]);
});

test("a handler subscribed to several matching topics gets the message once", () => {
  const bus = new InProcessEventBus<string>();
  const client = collector();
  bus.subscribe("bus:1", client.handler);
  bus.subscribe("case:7", client.handler);
  bus.subscribe(ALL_TOPICS, client.handler);
  bus.publish(["bus:1", "case:7"], "once");
  assert.deepEqual(client.received, ["once"]);
});

test("unsubscribing stops delivery, and doing it twice is harmless", () => {
  const bus = new InProcessEventBus<string>();
  const client = collector();
  const unsubscribe = bus.subscribe("bus:1", client.handler);
  bus.publish(["bus:1"], "before");
  unsubscribe();
  unsubscribe();
  bus.publish(["bus:1"], "after");
  assert.deepEqual(client.received, ["before"]);
  assert.equal(bus.subscriberCount("bus:1"), 0);
});

test("a handler that throws does not stop delivery to others, and the error is reported", () => {
  const errors: string[] = [];
  const bus = new InProcessEventBus<string>((error, topic) => {
    errors.push(`${topic}:${(error as Error).message}`);
  });
  const good = collector();
  bus.subscribe("bus:1", () => {
    throw new Error("boom");
  });
  bus.subscribe("bus:1", good.handler);
  bus.publish(["bus:1"], "still delivered");
  assert.deepEqual(good.received, ["still delivered"]);
  assert.deepEqual(errors, ["bus:1:boom"]);
});

test("a handler may unsubscribe itself while a message is being delivered", () => {
  const bus = new InProcessEventBus<string>();
  const other = collector();
  const unsubscribeSelf = bus.subscribe("bus:1", () => unsubscribeSelf());
  bus.subscribe("bus:1", other.handler);
  bus.publish(["bus:1"], "x");
  assert.deepEqual(other.received, ["x"]);
  assert.equal(bus.subscriberCount("bus:1"), 1);
});

test("delivery touches only interested handlers, however many others exist", () => {
  const bus = new InProcessEventBus<string>();
  let invoked = 0;
  for (let index = 0; index < 20_000; index += 1) {
    bus.subscribe(`bus:${index}`, () => {
      invoked += 1;
    });
  }
  bus.publish(["bus:12345"], "only one");
  assert.equal(invoked, 1);
  assert.equal(bus.subscriberCount(), 20_000);
});

test("publishing among many idle subscribers stays fast", () => {
  const bus = new InProcessEventBus<string>();
  for (let index = 0; index < 20_000; index += 1)
    bus.subscribe(`bus:${index}`, () => undefined);
  const started = process.hrtime.bigint();
  for (let index = 0; index < 20_000; index += 1)
    bus.publish([`bus:${index}`], "x");
  const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(
    milliseconds < 2_000,
    `20,000 publishes took ${milliseconds.toFixed(0)} ms`,
  );
});

test("empty subscriber sets are removed so topics do not accumulate", () => {
  const bus = new InProcessEventBus<string>();
  const unsubscribe = bus.subscribe("stop:1", () => undefined);
  assert.equal(bus.topicCount(), 1);
  unsubscribe();
  assert.equal(bus.topicCount(), 0);
});
