# 0004. Design for scale, build in stages

Date: 30 Sep 2026. Status: decided by the project owner; implementation scheduled.

## Decision

New backend code is designed for scale from the start, and the methods used are written down for the project report. The prototype stays a single process, but every new part is built so that it can be split without a rewrite. The full method list, assumptions, evidence and acceptance thresholds are in [`architecture/scalability.md`](../architecture/scalability.md).

## Why

The backend measured at about 50 writes per second at 1,000 stored cases and about 2 per second at 20,000, because every write rewrites the whole stored state. The design scenario (one million registered apps, thousands of buses, one hundred operator consoles) needs telemetry ingest in the thousands of messages per second. The gap is 20 to 60 times at small data sizes and grows as data accumulates. Splitting the work by how it scales, and keeping the safety decision on each bus, removes the limit without touching the parts around it.

## What this commits us to

1. New backend entities use repository interfaces and per-record persistence, never another array in the whole-state document.
2. Operator subscriptions are scoped by stop, bus or region.
3. Every write is idempotent; devices send on change plus a slow heartbeat.
4. Each scaling claim has a reproducible test with a stated threshold (section 9 of the scalability document).
5. The report states only what is **Built**; **Designed** and **Deferred** methods are labelled as such.

## What it does not commit us to

Running at scale, or migrating the teammate's existing case and telemetry storage now. That migration (SC10 in the roadmap) touches the backend core and needs the teammate's agreement.

## Open

The load assumptions in section 2 of the scalability document are the author's and need the team's confirmation. The acceptance thresholds are targets, not results.
