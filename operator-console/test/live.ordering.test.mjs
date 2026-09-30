// C-H2: a message pushed while a snapshot is being read must not be overwritten by older data.
import test from "node:test";
import assert from "node:assert/strict";
import { createLiveSource } from "../src/live/source.js";

const T = "2026-09-30T00:00:00.000Z";
const LATER = "2026-09-30T00:00:05.000Z";

class FakeSocket {
  static instances = [];
  constructor() {
    this.readyState = 0;
    this.sent = [];
    FakeSocket.instances.push(this);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  push(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const oldCase = { caseId: "CASE-1", state: "CONFIRMED", busId: "AV-1", updatedAt: T };

/** A backend whose case list can be held back, to reproduce a snapshot that is in flight. */
function heldBackend() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const empty = {
    statuses: [],
    records: [],
    requests: [],
    events: [],
  };
  const fetchFn = async (url) => {
    const { pathname } = new URL(url);
    if (pathname === "/api/operations/cases") {
      await gate;
      return { ok: true, status: 200, json: async () => ({ cases: [oldCase] }) };
    }
    return { ok: true, status: 200, json: async () => structuredClone(empty) };
  };
  return { fetchFn, release };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test("a case update pushed during a snapshot read survives the older snapshot", async () => {
  FakeSocket.instances.length = 0;
  const { fetchFn, release } = heldBackend();
  const source = createLiveSource({
    baseUrl: "http://x",
    fetchFn,
    WebSocketCtor: FakeSocket,
    schedule: () => () => {},
  });
  source.start();
  const socket = FakeSocket.instances[0];
  socket.open(); // starts a snapshot, which waits on the case list
  await settle();
  socket.push({
    type: "CASE_STATUS",
    caseId: "CASE-1",
    state: "COMPLETED",
    timestamp: LATER,
  });
  release();
  await settle();
  assert.equal(source.state.cases["CASE-1"].state, "COMPLETED");
  source.stop();
});

test("a push during a read that fails is not lost", async () => {
  FakeSocket.instances.length = 0;
  let fail;
  const gate = new Promise((_, reject) => (fail = reject));
  const fetchFn = async (url) => {
    if (new URL(url).pathname === "/api/operations/cases") await gate;
    return { ok: true, status: 200, json: async () => ({ statuses: [], records: [], requests: [], events: [], cases: [] }) };
  };
  const source = createLiveSource({
    baseUrl: "http://x",
    fetchFn,
    WebSocketCtor: FakeSocket,
    schedule: () => () => {},
  });
  source.start();
  const socket = FakeSocket.instances[0];
  socket.open();
  await settle();
  socket.push({ type: "CASE_STATUS", caseId: "CASE-2", state: "FAILED", timestamp: LATER });
  fail(new Error("network down"));
  await settle();
  assert.equal(source.state.cases["CASE-2"].state, "FAILED");
  source.stop();
});
