import test from "node:test";
import assert from "node:assert/strict";
import { Metrics, percentile } from "../platform/metrics";
import {
  DEFAULT_LIMITS,
  RateLimiter,
  classifyRequest,
  type LimitConfig,
} from "../platform/rateLimit";
import { parseRoles } from "../platform/roles";
import { logger, MAX_LOG_ENTRIES } from "../services/logger";

test("percentile picks the value at that rank and copes with empty input", () => {
  assert.equal(percentile([], 95), 0);
  const values = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 95);
  assert.equal(percentile(values, 100), 100);
});

test("metrics count requests by group and status class and report latency percentiles", () => {
  const metrics = new Metrics(() => 1_000);
  for (let index = 1; index <= 100; index += 1) {
    metrics.record("safety", 202, index);
  }
  metrics.record("browse", 200, 5);
  metrics.record("browse", 429, 1);
  metrics.record("browse", 500, 2);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.total, 103);
  assert.deepEqual(snapshot.groups.safety.status, { "2xx": 100 });
  assert.deepEqual(snapshot.groups.browse.status, {
    "2xx": 1,
    "4xx": 1,
    "5xx": 1,
  });
  assert.equal(snapshot.groups.safety.p95Ms, 95);
  assert.equal(snapshot.groups.safety.maxMs, 100);
});

test("metrics keep memory bounded however many requests arrive", () => {
  const metrics = new Metrics(() => 0, 50);
  for (let index = 0; index < 10_000; index += 1)
    metrics.record("browse", 200, index);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.groups.browse.count, 10_000);
  assert.ok(snapshot.groups.browse.samples <= 50);
});

test("in-flight requests are tracked", () => {
  const metrics = new Metrics(() => 0);
  metrics.started();
  metrics.started();
  metrics.finished();
  assert.equal(metrics.snapshot().inFlight, 1);
});

const config: LimitConfig = {
  safety: { perSecond: 1000, burst: 1000, shedAbove: Infinity },
  operator: { perSecond: 10, burst: 10, shedAbove: 100 },
  passenger: { perSecond: 5, burst: 5, shedAbove: 50 },
  browse: { perSecond: 2, burst: 2, shedAbove: 5 },
};

test("requests are classified by what they are for", () => {
  const cases: Array<[string, string, string]> = [
    ["POST", "/api/operations/vehicles/AV-1/status", "safety"],
    ["POST", "/api/operations/vehicles/AV-1/assist-ack", "safety"],
    ["GET", "/api/operations/actuators/pending", "safety"],
    ["POST", "/api/operations/devices/heartbeat", "safety"],
    ["GET", "/api/operations/cases", "operator"],
    ["POST", "/api/operations/bays/18331/proceed", "operator"],
    ["POST", "/api/assistance/request", "passenger"],
    ["GET", "/api/passenger/context", "passenger"],
    ["GET", "/api/bus-stops/nearby", "browse"],
    ["GET", "/api/journeys/plan", "browse"],
    ["GET", "/health", "browse"],
  ];
  for (const [method, path, expected] of cases) {
    assert.equal(classifyRequest(method, path), expected, `${method} ${path}`);
  }
});

test("a key that exceeds its rate is refused with a wait time, and refills over time", () => {
  let now = 0;
  const limiter = new RateLimiter(config, () => now);
  assert.equal(limiter.admit("browse", "ip-1").ok, true);
  assert.equal(limiter.admit("browse", "ip-1").ok, true);
  const refused = limiter.admit("browse", "ip-1");
  assert.equal(refused.ok, false);
  assert.ok(refused.retryAfterSeconds >= 1);
  now += 1_000;
  assert.equal(limiter.admit("browse", "ip-1").ok, true);
});

test("one key cannot use up another key's allowance", () => {
  const limiter = new RateLimiter(config, () => 0);
  limiter.admit("browse", "noisy");
  limiter.admit("browse", "noisy");
  assert.equal(limiter.admit("browse", "noisy").ok, false);
  assert.equal(limiter.admit("browse", "quiet").ok, true);
});

test("safety traffic is never shed by load; browsing is shed first", () => {
  const limiter = new RateLimiter(config, () => 0);
  for (let index = 0; index < 6; index += 1) limiter.enter();
  assert.equal(
    limiter.admit("browse", "a").ok,
    false,
    "browsing is shed above its in-flight limit",
  );
  assert.equal(
    limiter.admit("safety", "bus-1").ok,
    true,
    "acknowledgements still get through",
  );
  assert.equal(limiter.admit("operator", "op").ok, true);
});

test("idle keys are forgotten so the table stays bounded", () => {
  let now = 0;
  const limiter = new RateLimiter(config, () => now, {
    maxKeys: 100,
    idleMs: 60_000,
  });
  for (let index = 0; index < 100; index += 1)
    limiter.admit("browse", `ip-${index}`);
  now += 120_000;
  limiter.admit("browse", "fresh");
  assert.ok(limiter.trackedKeys() <= 100);
  assert.ok(limiter.trackedKeys() < 100, "idle keys were dropped");
});

test("the default limits leave a device far more room than a browsing client", () => {
  assert.ok(
    DEFAULT_LIMITS.safety.perSecond > DEFAULT_LIMITS.browse.perSecond * 5,
  );
  assert.equal(DEFAULT_LIMITS.safety.shedAbove, Infinity);
});

test("roles: nothing set means everything; names are checked", () => {
  assert.deepEqual([...parseRoles(undefined)].sort(), [
    "operations",
    "passenger",
  ]);
  assert.deepEqual([...parseRoles("passenger")], ["passenger"]);
  assert.deepEqual([...parseRoles("fleet, operator")], ["operations"]);
  assert.deepEqual([...parseRoles("passenger,operations")].sort(), [
    "operations",
    "passenger",
  ]);
  assert.throws(() => parseRoles("passanger"), /passanger/);
  assert.throws(() => parseRoles(""), /at least one/);
});

test("the in-memory log is bounded", () => {
  logger.clearLogs();
  for (let index = 0; index < MAX_LOG_ENTRIES + 500; index += 1) {
    // The bound is on what is kept, not on what is printed, so skip the console.
    logger.record("INFO", `entry ${index}`);
  }
  const logs = logger.getLogs();
  assert.equal(logs.length, MAX_LOG_ENTRIES);
  assert.equal(logs[logs.length - 1].message, `entry ${MAX_LOG_ENTRIES + 499}`);
  logger.clearLogs();
});
