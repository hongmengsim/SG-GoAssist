import test from "node:test";
import assert from "node:assert/strict";
import type { BusStatus, BusStatusUpdateMessage } from "@buspass/shared";
import { MemoryBroker } from "../events/broker";
import { BrokerEventBus } from "../events/brokerEventBus";
import { InProcessEventBus } from "../events/eventBus";
import { configureEventHub, publishEvent } from "../events/eventHub";
import { operatorTopicsFor, passengerTopicsFor } from "../events/topics";
import type { BusEvent } from "../events/types";
import { startTestServer } from "./helpers/integration";
import { connect } from "./helpers/ws";

function busStatus(busId: string): BusStatusUpdateMessage {
  const status: BusStatus = {
    busId,
    busService: "95",
    stopCode: "18331",
    movement: "POSITIONED_AT_STOP",
    simulated: true,
    observedAt: new Date().toISOString(),
  };
  return { type: "BUS_STATUS", status, timestamp: new Date().toISOString() };
}

/** What another backend process does when it publishes an event: same topics, same broker. */
function publishFromAnotherProcess(
  other: BrokerEventBus<BusEvent>,
  message: BusEvent,
): void {
  other.publish(
    [...passengerTopicsFor(message), ...operatorTopicsFor(message)],
    message,
  );
}

test("an operator connected to this process receives an event published by another process", async () => {
  const broker = new MemoryBroker();
  configureEventHub(new BrokerEventBus<BusEvent>(broker));
  const otherProcess = new BrokerEventBus<BusEvent>(broker);
  const server = await startTestServer();
  try {
    const operator = await connect(server.wsUrl);
    operator.socket.send(JSON.stringify({ type: "SUBSCRIBE_OPERATIONS" }));
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    // Give the gateway's broker subscription time to be in place.
    await new Promise((resolve) => setTimeout(resolve, 20));

    publishFromAnotherProcess(otherProcess, busStatus("B-REMOTE"));
    await operator.waitFor(
      (m) =>
        m.type === "BUS_STATUS" && (m.status as BusStatus).busId === "B-REMOTE",
    );

    // An event published by this process itself arrives too, once.
    publishEvent(busStatus("B-LOCAL"));
    await operator.waitFor(
      (m) =>
        m.type === "BUS_STATUS" && (m.status as BusStatus).busId === "B-LOCAL",
    );
    const seen = operator.messages
      .filter((m) => m.type === "BUS_STATUS")
      .map((m) => (m.status as BusStatus).busId);
    assert.deepEqual(seen.sort(), ["B-LOCAL", "B-REMOTE"]);
    operator.socket.close();
  } finally {
    await server.close();
    configureEventHub(new InProcessEventBus<BusEvent>());
  }
});

test("a scoped operator still sees only its own buses when events come through the broker", async () => {
  const broker = new MemoryBroker();
  configureEventHub(new BrokerEventBus<BusEvent>(broker));
  const otherProcess = new BrokerEventBus<BusEvent>(broker);
  const server = await startTestServer();
  try {
    const operator = await connect(server.wsUrl);
    operator.socket.send(
      JSON.stringify({ type: "SUBSCRIBE_OPERATIONS", buses: ["B-MINE"] }),
    );
    await operator.waitFor((m) => m.type === "SUBSCRIBED_OPERATIONS");
    await new Promise((resolve) => setTimeout(resolve, 20));

    publishFromAnotherProcess(otherProcess, busStatus("B-OTHER"));
    publishFromAnotherProcess(otherProcess, busStatus("B-MINE"));
    await operator.waitFor(
      (m) =>
        m.type === "BUS_STATUS" && (m.status as BusStatus).busId === "B-MINE",
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const seen = operator.messages
      .filter((m) => m.type === "BUS_STATUS")
      .map((m) => (m.status as BusStatus).busId);
    assert.deepEqual(seen, ["B-MINE"]);
    operator.socket.close();
  } finally {
    await server.close();
    configureEventHub(new InProcessEventBus<BusEvent>());
  }
});
