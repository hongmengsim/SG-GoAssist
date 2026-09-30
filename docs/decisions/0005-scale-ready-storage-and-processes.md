# 0005. Build for scale from the start: async storage ports, then shared services

Status: accepted by CE2 on 1 Oct 2026. Steps 1 and 2 are built (step 2 tested against a fake Redis only); steps 3 and 4 are planned. The teammate has not reviewed it yet.

## Decision

Keep the architecture (contract-first messages, the Pi as safety authority, repository and event-bus seams, roles). Do not rewrite it. Change the parts that would stop it running as several backend processes, while the code is still small:

1. **Async storage ports** (built, 1 Oct 2026). Every storage interface returns promises: `CaseRepository`, `DocumentTable`, `OperationsData`, the audit read, retention and the legacy import. The case service and everything that calls it became asynchronous. SQLite is still the adapter, so behaviour is unchanged; a network database (Postgres) can now be added as another adapter without touching the services.
2. **Shared event bus** (built, 1 Oct 2026; Redis adapter tested against a fake server only). `MessageBroker` port (`events/broker.ts`), `BrokerEventBus` (`events/brokerEventBus.ts`: same delivery rules as the in-process bus, de-duplicates per handler, never throws into a request), `RedisBroker` (`events/redisBroker.ts`, over any ioredis-shaped client; ioredis is loaded only when chosen and is not a dependency), and `GOASSIST_EVENT_BUS=memory|redis` (`events/eventHub.ts`; an unknown value is refused). A gateway test shows a WebSocket client receiving an event another process published. Limits of a broker: delivery is asynchronous, events on different topics may arrive out of order, and delivery is at most once. See `docs/runbooks/multi-process.md`.
3. **Concurrency in the database, not in memory** (planned). The in-process `KeyedMutex` (bus reports, operator halt, bay coordination) is replaced by transactions or compare-and-set, so two processes cannot interleave a read-modify-write.
4. **No domain state in process memory** (planned). Remaining module-level state moves behind repositories or out to its own process: the legacy request and vehicle maps and announcement list (`aviator.ts`, `assistanceRequestService.ts`), the assistant diagnostics map, the case-change listeners, and the simulated bus (its timers).

## Definition of done

A Postgres adapter and a Redis event-bus adapter exist, and the existing end-to-end scenario and the load test pass with **two backend processes** sharing them. Until then the system is described as "scale-ready by design, single-process by measurement" and no multi-process claim is made.

## What step 1 changed

- `backend/src/storage/documentTable.ts`, `backend/src/cases/*`: ports and adapters are async.
- `backend/src/services/operationsData.ts`: `getOperationsData()`, `configureOperationsData()` and `resetOperationsData()` are async; `ready` resolves once old data is imported and retention has run; `getAuditLog()` gives synchronous access for fire-and-forget audit writes; the server starts listening only after the data is ready.
- The audit log write stays synchronous (write-behind, batched); its read is async.
- About 40 call sites in seven services, four routes and the WebSocket gateway were converted. The conversion was made with a type-aware tool that adds `await` to every unawaited promise, so no call was missed silently; the array-callback and constructor sites it cannot handle were fixed by hand.
- Tests: the backend tests pass (341), including the teammate's case-service tests, converted mechanically (`assert.throws` on a call became `await assert.rejects`).

## Cost and risk

The change touches most of the teammate's case service. There is no behaviour change intended. Async handlers can interleave where synchronous ones could not (two messages for the same case can now run their read-modify-write concurrently in one process); step 3 is the fix, and until then the risk is the same one a second process would have.
