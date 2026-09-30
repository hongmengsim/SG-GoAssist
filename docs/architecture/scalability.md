# Scalability design

This document explains how the SG GoAssist system is designed to grow from a competition prototype to a service used by a large population of passengers and a large fleet, and which of those measures exist today. It is written so that sections 1 to 9 can be lifted into the project report. Every claim is labelled with its status.

## 1. How to read this document

| Label        | Meaning                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| **Built**    | In the repository and verified by a test or a measurement                               |
| **Designed** | Specified here and scheduled in [`docs/roadmap.md`](../roadmap.md); not implemented yet |
| **Deferred** | Deliberately outside the prototype; described so the path is clear                      |

The prototype runs on one computer. It does not itself serve a million users, and this document does not claim it does. What it claims is narrower and checkable: the architecture separates the workloads that would have to scale differently, the measured limits of the current implementation are known, and each limit has a named method that removes it without redesigning the parts around it.

## 2. Design scenario and assumptions

The scenario is the owner's: **one million registered passenger apps, thousands of buses, one hundred operator consoles.** The remaining parameters are assumptions chosen to make the arithmetic concrete. They are inputs to the model, so every derived figure changes in proportion if an assumption changes. **The team should confirm or replace these.**

| Parameter                           | Value                                                 | Basis                                                    |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Registered passenger apps           | 1,000,000                                             | Owner's scenario                                         |
| Buses in the fleet                  | 5,000                                                 | "Thousands" (owner), fixed at 5,000 for the model        |
| Operator consoles                   | 100                                                   | Owner's scenario                                         |
| Concurrently connected apps at peak | 50,000 (5% of registered)                             | Assumption                                               |
| Assistance requests at peak         | 2,000 per hour (about 0.6 per second)                 | Assumption                                               |
| Bus status message rate             | One per bus every 5 s, plus one on every state change | Assumption; design for 3,000 messages per second at peak |
| Passenger browsing requests         | One per connected app every 30 s                      | Assumption                                               |
| Operator scope                      | Each console watches one region of about 50 buses     | Assumption                                               |

## 3. Five workloads that scale differently

Today one backend process serves all of these. They only look like one problem because they share a process.

| #   | Workload                                              | Derived load                                                                                                                                      | Character                                            | Safety-critical?        |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| W1  | Passenger browsing: stops, arrivals, journey planning | 50,000 / 30 s, about **1,700 requests per second**                                                                                                | Read-mostly, cacheable, no per-user state            | No                      |
| W2  | Assistance requests and their status updates          | About **0.6 new requests per second**; with an assumed 5-minute life, about 180 requests in flight                                                | Low volume, needs durability and exactly-once effect | Indirectly              |
| W3  | Bus status and telemetry ingest                       | 5,000 / 5 s = **1,000 messages per second** steady, 3,000 at peak                                                                                 | High-rate small writes, latest value matters most    | Inputs to safety checks |
| W4  | Operator live view                                    | Unscoped, every event to every console: 1,000 x 100 = **100,000 sends per second**. Scoped to a region: about **1,000 to 2,000 sends per second** | Fan-out; cost is set by how subscriptions are scoped | No                      |
| W5  | Halt-or-continue decision for the ramp                | **No backend load**: decided on the bus                                                                                                           | Real-time                                            | Yes                     |

Two consequences drive the design. W1 is two orders of magnitude larger than W2 and needs none of W2's guarantees, so it must not share a service with it. And W5 is the only safety-critical loop and already sits outside the backend, which is what makes the rest scalable without putting safety at risk.

## 4. Evidence: the limit of the current implementation

**Historical: this section describes the store as it was on 30 Sep 2026. That store has since been retired (see the end of this section).**

The backend persisted its operations state (cases, telemetry, commands, devices) as one JSON document. Every update rewrote the whole document and every read cloned it. The cost of one write therefore grew with **everything ever stored**, not with the size of the change.

Measured with `npm run bench:store` ([`scripts/bench-operations-store.mjs`](../../scripts/bench-operations-store.mjs)) on an Intel Core i7-10750H, Node 22.15.1, 20 repetitions per size, SQLite driver, synthetic cases of about 0.9 KB each:

| Cases stored | State size (MB) | Time per update (ms) | Updates per second | Time per snapshot (ms) |
| -----------: | --------------: | -------------------: | -----------------: | ---------------------: |
|            0 |            0.00 |                  1.3 |                758 |                    0.0 |
|          100 |            0.09 |                  3.9 |                254 |                    2.0 |
|        1,000 |            0.89 |                 21.1 |                 47 |                   14.3 |
|        5,000 |            4.46 |                157.2 |                  6 |                   82.9 |
|       20,000 |           17.89 |                584.8 |                  2 |                  460.6 |

The JSON-file driver shows the same growth. Absolute times vary between runs (an earlier run gave about 15 ms at 1,000 cases); the linear growth is the finding.

**Retired.** The whole-state store was replaced by one row per record (`backend/src/cases`, `backend/src/storage/documentTable.ts`, `backend/src/services/operationsData.ts`). The same script now measures one case write on the new storage (SQLite with a full flush per write, same machine and Node version, 20 repetitions, synthetic cases):

| Cases stored | Time per update (ms) | Updates per second | Time per read (ms) |
| -----------: | -------------------: | -----------------: | -----------------: |
|            0 |                1.303 |                767 |              0.013 |
|        1,000 |                1.290 |                775 |              0.017 |
|        5,000 |                1.311 |                763 |              0.022 |
|       20,000 |                1.327 |                754 |              0.021 |

The write cost no longer grows with what is stored (x1.0 from 0 to 20,000, against about x450 before). What follows describes the old store and is kept as the evidence for why it was replaced.

What this meant against the scenario:

- One telemetry post performs at least two whole-state clones and one whole-state write, then re-evaluates every open case for that bus. Even at only 1,000 stored cases the store sustains about 50 writes per second, against a requirement of **1,000 to 3,000 messages per second** (W3). The shortfall is roughly 20 to 60 times, and it widens as data accumulates.
- The write runs on the single Node thread, so while it runs nothing else is served.
- Nothing prunes or archives cases (the only expiry in the code is for actuator commands), so the state only grows.
- The request logger keeps every log entry in memory without bound and prints each synchronously.

## 5. Design principles

1. **Keep safety local.** A backend that is slow, overloaded or down must never be able to make a bus unsafe.
2. **Separate workloads by how they scale**, not by team or file.
3. **Make the cost of an operation independent of total data.** No operation may touch everything ever stored.
4. **Keep services stateless.** State lives behind interfaces in a store that can be swapped and shared; any instance can serve any request.
5. **Send only what a reader needs.** Subscriptions are scoped; devices send on change plus a slow heartbeat.
6. **Assume messages repeat, arrive late or out of order.** Every write is idempotent.
7. **Fail closed and say so.** Missing or stale data is treated as unavailable, never as safe.
8. **Measure, then claim.** Every scaling claim has a reproducible test with a stated threshold.

## 6. Methods

Numbers in the last column refer to workloads in section 3.

| ID   | Method                                                                                                                                                                                                                                                                                    | Problem it removes                                                                                                                                        | How it is done in this project                                                                                                                                                                                                                                   | Status                                                                                                                                                                                                                                                                                      | Verified by                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| SM1  | **Independent roles.** Passenger API, fleet controller and operator gateway are separate modules that a deployment can run together (prototype) or separately (scale).                                                                                                                    | One process shared by all workloads; a spike in one starves the others (W1 to W4)                                                                         | Routers are already separate (`/api/assistance`, `/api/location`, `/api/bus-stops`, `/api/journeys`, `/api/passenger` for apps; `/api/operations` for buses and consoles). Add a `GOASSIST_ROLES` setting that mounts a chosen subset and separate entry points. | Route separation **Built**; role mounting **Built** for `passenger` and `operations` (`GOASSIST_ROLES`); splitting fleet from operator **Designed**                                                                                                                                         | Test that a process started with one role serves only that role's routes                            |
| SM2  | **Stateless services, externalised state.** All domain state sits behind repository interfaces with in-memory (tests), SQLite (prototype) and PostgreSQL (scale) adapters. No module-level maps holding domain data.                                                                      | State trapped in one process cannot be shared or survive restart. The legacy request store is an in-memory map.                                           | New entities are written to repositories first; existing entities are wrapped behind the same interfaces and migrated.                                                                                                                                           | **Designed**                                                                                                                                                                                                                                                                                | Two service instances against one store return identical results                                    |
| SM3  | **Per-record, indexed persistence.** One row per case, bus status, decision and audit event, with indexes on the lookup keys.                                                                                                                                                             | Whole-state rewrite (section 4)                                                                                                                           | Replace the whole-document write with row writes. The audit table already works this way.                                                                                                                                                                        | Audit **Built**; new entities (bus status, bay, ramp state, decision, help) **Built**, write time x0.56 from 0 to 19,500 records; existing cases, telemetry, commands and the other case-service records **Built** (SC10, 1 Oct 2026: one row each; write time x1.0 from 0 to 20,000 cases) | Time per write at 20,000 stored records stays within 2x of the time at 0 (the current code is 450x) |
| SM4  | **Latest-state store for high-rate signals.** Bus status and telemetry are upserted per bus (key: bus id), overwriting the previous value. History is sampled or written on change to a time-series table with a retention limit.                                                         | Storing every telemetry message forever, and rewriting shared state for each one (W3)                                                                     | Separate table keyed by bus; the safety gate reads the latest row and its age.                                                                                                                                                                                   | Bus status, ramp, decision, help **Built** (one row per bus); the existing telemetry store **Designed**                                                                                                                                                                                     | Ingest throughput independent of fleet history                                                      |
| SM5  | **Scoped, event-driven fan-out.** An `EventBus` interface (in-process now; NATS, Redis or Kafka later) with topics per stop, bus and region. A WebSocket gateway subscribes on behalf of its clients. Operators subscribe to a scope.                                                     | Every event goes to every operator: 100,000 sends per second instead of about 1,000 to 2,000 (W4). Client list is per-process, so it cannot span servers. | Replace the "send to all operators" broadcast with topic subscriptions; keep the client registry local to each gateway instance.                                                                                                                                 | **Built** (`EventBus`, topics, scoped operator subscriptions, tests); broker **Deferred**                                                                                                                                                                                                   | Test that a console subscribed to one stop receives events for that stop only                       |
| SM6  | **Push, not poll, for devices.** A message broker (MQTT) pushes commands on a per-bus topic, with last-will messages to detect an offline bus. Until then, cursor-based polling (`since` sequence) with back-off and jitter.                                                              | Thousands of buses polling on a timer (W3)                                                                                                                | Devices keep a sequence cursor; the server returns only newer commands.                                                                                                                                                                                          | **Designed**; broker **Deferred**                                                                                                                                                                                                                                                           | Idle buses cost no server work beyond the heartbeat                                                 |
| SM7  | **Idempotent, ordered, at-least-once messaging.** Idempotency keys on every write, per-sender sequence numbers, replay-safe handlers, and store-and-forward on the device during outages.                                                                                                 | Duplicates and retries causing repeated actions                                                                                                           | Signals and actuator commands already carry idempotency keys and are de-duplicated. Extend to acknowledgement and status endpoints; buffer in the bus agent while the backend is unreachable.                                                                    | Signals, commands, bus status, reports and acknowledgement **Built**; agent retries **Built**, store-and-forward buffer **Designed**                                                                                                                                                        | Replaying a request N times has the effect of one                                                   |
| SM8  | **Backpressure and rate limiting.** Token-bucket limits per device and per client, bounded queues, early rejection with `429` and `Retry-After`, and priority for safety and acknowledgement traffic over browsing. Devices send on change plus a slow heartbeat, never per sensor frame. | Overload taking everything down together (W1, W3)                                                                                                         | Middleware with an in-memory bucket now and a shared bucket later.                                                                                                                                                                                               | **Built**: token buckets per class and key, priority shedding under load, 429 with Retry-After; limits are placeholders to be set from load tests                                                                                                                                           | Load test: excess traffic is rejected while acknowledgements still succeed                          |
| SM9  | **Caching and read scaling for browsing.** HTTP cache headers and ETags on read-only stop, route and amenity data; a CDN in front; read replicas for the rest. The 5,204-stop snapshot is static data and should be served as such.                                                       | W1 dominating the assistance service                                                                                                                      | Add `Cache-Control` and `ETag` to the read-only routes.                                                                                                                                                                                                          | **Built** for bus-stop reference data (`Cache-Control` and ETag, 304 on repeat); CDN **Deferred**                                                                                                                                                                                           | Repeat requests answered with `304` and no body                                                     |
| SM10 | **Bounded data growth.** Completed cases move out of the hot store after a retention period; audit data is partitioned by time; the in-memory logger becomes bounded, structured and asynchronous.                                                                                        | State and memory that only grow (section 4)                                                                                                               | Retention job and a bounded log buffer.                                                                                                                                                                                                                          | In-memory log bounded **Built**; retention of finished cases and growing series **Built** (archive file, configurable limits; the audit table is not trimmed)                                                                                                                               | Hot-store size stays flat under a sustained request stream                                          |
| SM11 | **Partition keys.** Bay state is keyed by stop, bus state by bus, cases by case id; controllers shard by region or depot. Each key has a single writer, so no cross-shard transactions are needed.                                                                                        | Contention on shared state; scaling out the controller                                                                                                    | The keys already exist in the contract. Add a routing function from key to shard.                                                                                                                                                                                | Keys **Built**; sharding **Designed**                                                                                                                                                                                                                                                       | Two shards process disjoint stops with no shared writes                                             |
| SM12 | **Safety independent of the backend.** The Pi decides halt or continue locally; missing or stale data is never clear; a bus that loses its backend link or a sensor halts rather than continues. The backend treats telemetry older than 5 seconds as unavailable.                        | Backend load or outage affecting safety (W5)                                                                                                              | Backend stale-telemetry rule exists. The local decision and link-loss behaviour are in the roadmap.                                                                                                                                                              | Backend staleness **Built**; local decision **Built** (`pi/safety-gate`, agent scenario tests, halts with the backend down); halt on lost link **Built** in the agent, off until a value is agreed (`linkLossHaltSeconds`)                                                                  | Scenario tests: kill the backend or a sensor, the ramp halts                                        |
| SM13 | **Observability and repeatable load tests.** Request rates, latency percentiles, queue depth and connected clients exposed as metrics; health and readiness endpoints; load tests with pass/fail thresholds.                                                                              | Scaling claims nobody can check                                                                                                                           | `npm run bench:store` exists. Add a metrics endpoint and a load-test harness.                                                                                                                                                                                    | Benchmark, `/admin/metrics`, `/ready` and the load-test harness **Built**; the 3,000 messages per second target is **not met** on one process (see section 9)                                                                                                                               | The thresholds in section 9                                                                         |
| SM14 | **Contract-first design and enforced module boundaries.** Messages are typed once in `contracts/`; a checker fails the build if a module imports across a boundary; each module runs and is tested alone.                                                                                 | Parts that cannot evolve or scale independently                                                                                                           | `scripts/check-modules.mjs` (12 tests) and the module registry.                                                                                                                                                                                                  | **Built**                                                                                                                                                                                                                                                                                   | `npm run check:modules`                                                                             |
| SM15 | **Security that scales.** Signed device requests with a 60-second timestamp window, per-device credentials instead of one shared secret, short-lived operator tokens, rotation.                                                                                                           | One leaked secret compromising every device                                                                                                               | HMAC signing exists with a single shared secret.                                                                                                                                                                                                                 | HMAC **Built**, including from the Python agent and for the bus's WebSocket subscription (`SUBSCRIBE_DEVICE`, own bus only, no operator token on the Pi); per-device secrets and rotation **Designed**                                                                                      | Request with a wrong or stale signature is rejected                                                 |
| SM16 | **Deployment scaling.** Containers, autoscaling per role, health-based rollout, multi-zone database, multiple regions.                                                                                                                                                                    | Single point of failure                                                                                                                                   | Out of scope for the prototype.                                                                                                                                                                                                                                  | **Deferred**                                                                                                                                                                                                                                                                                | n/a                                                                                                 |

## 7. Target architecture and how it grows

```text
 Passenger apps ──► CDN / cache ──► Passenger API  ─────┐  (W1, W2; stateless, autoscaled)
                                                        │
 Buses (agents) ──► MQTT broker ──► Fleet controller ───┼──► Database (per-record, indexed)
   (decide locally)   (push, QoS 1)   (sharded by        │       + latest-state store
                                       region/depot)     │
 Operator consoles ◄── WebSocket gateway ◄── Event bus ──┘  (W4; scoped subscriptions)
```

| Stage            | Shape                                                                                                         | What changes in code          | Status                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| 0. Prototype     | One process, every role, SQLite or JSON                                                                       | Nothing; this is today        | **Built**; bottleneck measured (section 4) |
| 1. Split by role | Three stateless services, one shared database, per-record storage, scoped fan-out, rate limits, cache headers | SM1 to SM5, SM7 to SM10, SM13 | **Designed**                               |
| 2. Fleet scale   | Message broker for buses, event bus behind the WebSocket gateway, controller sharded by region or depot       | SM6, SM11                     | **Designed**                               |
| 3. Multi-region  | Replicated database, regional deployments, autoscaling, monitoring                                            | SM15, SM16                    | **Deferred**                               |

Each stage is a refactor of the previous one, not a rewrite, because the contract, the module boundaries and the safety-local rule stay fixed. This also matches the 29 September handoff, which lists division of controllers by depot as a future, unsettled item.

## 8. Failure and degradation

| Failure                                | Behaviour                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Backend down or overloaded             | Buses keep making local halt decisions. A bus that cannot reach the backend does not start a deployment and buffers its messages. |
| Sensor or camera data missing or stale | Treated as unavailable, never as clear; the ramp halts.                                                                           |
| Database slow                          | Ingest sheds load (`429`) and prioritises acknowledgements and safety messages over browsing.                                     |
| Broker down (Stage 2)                  | Buses fall back to cursor polling; consoles fall back to periodic refresh.                                                        |
| Operator console floods the gateway    | Subscriptions are scoped and rate-limited per client; other roles are unaffected because they run separately.                     |
| Duplicate or replayed messages         | Idempotency keys make the effect single.                                                                                          |

## 9. Verification plan and acceptance thresholds

A laptop cannot prove production capacity. These tests prove the **shape**: that cost does not grow with stored data, that fan-out is scoped, and that overload is shed. Thresholds are targets to be confirmed by the team; the measured results are in the table after this one.

| Test                                  | Pass condition                                                                                                                                | Method                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Write cost independent of stored data | Time per write at 20,000 stored records within 2x of the time at 0                                                                            | `npm run bench:store`, extended to the new storage |
| Sustained ingest                      | 3,000 status messages per second for 60 s with 95th-percentile latency under 100 ms on the test rig                                           | Load-test harness                                  |
| Scoped fan-out                        | A console subscribed to one stop receives only that stop's events; events delivered per event is bounded by the number of interested consoles | WebSocket integration test                         |
| Idempotency                           | Replaying any write 10 times leaves one effect                                                                                                | Unit and integration tests                         |
| Bounded growth                        | Hot-store size stays flat over a sustained request stream with retention on                                                                   | Soak test                                          |
| Overload shedding                     | Above the limit, browsing requests get `429` while acknowledgements still succeed                                                             | Load test                                          |
| Local safety                          | With the backend killed, the simulated bus still halts on a blocked path and does not start a deployment                                      | End-to-end scenario                                |
| Role isolation                        | A process started with one role serves only that role's routes                                                                                | Route test                                         |
| Boundaries                            | No module imports across a boundary                                                                                                           | `npm run check:modules` (**passes today**)         |

### Measured on 30 Sep 2026 (one Windows laptop, one Node process, SQLite, `npm run load:test`)

Bus status messages posted open loop by 2,000 buses that had already reported once (5% of messages change the bus's movement, the rest are heartbeats):

| Rate (messages per second) | Achieved | p50 (ms) | p95 (ms) | Result against "p95 under 100 ms" |
| -------------------------- | -------- | -------- | -------- | --------------------------------- |
| 1,000                      | 996      | 3.8      | 8.5      | pass                              |
| 2,000                      | 1,993    | 6.9      | 52.8     | pass                              |
| 3,000                      | 2,445    | 1,377    | 2,188    | **fail**: saturated               |

- The target of 3,000 messages per second is **not met** by one process on this laptop; about 2,000 per second is sustained within the threshold. The report must not claim 3,000.
- **A finding that changed the design:** before audit events were written in batches, the same test failed at 500 messages per second when 2,000 buses reported for the first time (p95 1.6 s), because every change was audited with its own database transaction and file append on the event loop; steady-state heartbeats were unaffected. Batching audit writes (one transaction per batch, flushed before the audit log is read and on shutdown) brought the same cold start to p95 7.6 ms and lifted the sustained rate from about 1,000 to about 2,000 per second. The cost is stated in code: a crash can lose the audit events of the last tens of milliseconds.
- **Overload shedding** (`npm run load:overload`): a browsing flood from one client received 429 for almost every request while buses reporting at 300 per second were all acknowledged (p95 150 ms under the flood).
- These prove the shape on a laptop, not production capacity. No test has run with a network between the buses and the backend.

### Measured on 1 Oct 2026: two backend processes on shared Postgres and Redis

Same laptop, Postgres 14 and Redis in WSL on the same machine, `npm run load:test -- --processes N` (bus status ingest, steady state, 300 buses, 5% change movement, `GOASSIST_LOCKS=database`, p95 under 100 ms):

| Processes | Rate (msg/s) | Achieved | p50 (ms) | p95 (ms) | Result |
| --------: | -----------: | -------: | -------: | -------: | ------ |
|         1 |          100 |      100 |     10.7 |     17.8 | pass   |
|         1 |          300 |      300 |     11.6 |     18.5 | pass   |
|         1 |          600 |      597 |     64.5 |    384.3 | fail   |
|         2 |          300 |      300 |     13.2 |     20.3 | pass   |
|         2 |          600 |      597 |     12.8 |     49.6 | pass   |
|         2 |        1,000 |      996 |    253.2 |    475.0 | fail   |

- The sustainable rate roughly doubles with the second process (300 to 600), which is the scale-out property. It is far below the single-process SQLite figure (about 2,000) because every message now makes database round trips, and the lock lease adds more.
- With per-process locks (not correct across processes) two processes reached 983 msg/s at p50 9.7 ms, so the lease was the main cost.

**After the lock-free hot path** (repeats and stale reports use one compare-and-swap and no lease; same rig, same test, 8 s runs):

| Processes | Rate (msg/s) | Achieved | p50 (ms) | p95 (ms) | Result |
| --------: | -----------: | -------: | -------: | -------: | ------ |
|         1 |          600 |      597 |      7.2 |     15.5 | pass   |
|         1 |        1,000 |      887 |    890.0 |  1,031.7 | fail   |
|         2 |        1,000 |      998 |      8.2 |     17.7 | pass   |
|         2 |        1,500 |    1,330 |    844.1 |  1,137.3 | fail   |

- One process now holds 600 msg/s (was 300) and two hold 1,000 (was 600). The second process adds about 50% here rather than 100% because the load generator, both backends, Postgres and Redis share one laptop.
- Real changes (5% of the traffic in this test) still take the lock lease; that is the remaining cost on this path.
- Not measured: separate machines, more than two processes, the 3,000 msg/s target.

## 10. What can and cannot be claimed

**Can be claimed today:**

- The architecture separates five workloads that scale differently, and keeps the only safety-critical loop off the backend.
- The current limit is identified, measured and reproducible: whole-state persistence, about 50 writes per second at 1,000 stored cases and about 2 per second at 20,000.
- Idempotent signals and commands, signed device requests, stale-data handling, an append-only audit log, a typed contract and enforced module boundaries exist and are tested.

**Cannot be claimed today:**

- That the system serves a million users or thousands of buses. It has not been run at that scale, and the measured limit says the current storage could not.
- That the methods marked **Designed** are implemented.

**How the claim will be made honestly in the report:** "The prototype is a single-process system whose scaling limit has been measured. The design separates workloads, keeps safety local to each bus, and specifies the methods, thresholds and staged path to scale it."
