# pi/safety-gate

**Status: planned, not implemented.** The fail-safe rules and 71 tests exist in the separate ML workspace prototype and will be ported here, renamed to this repo's conventions.

## Purpose

The Pi's decision: may the simulated ramp deploy or continue, or must it halt? It is pure logic with no camera, serial port or network, so it can be tested completely on its own and read in one sitting. The Pi is the safety authority; the backend records and relays the result and may add stricter checks, never looser ones.

## Interface

```
decide(perception, beam, context) -> RampSafetyDecision
```

- `perception`: a `PerceptionResult` (from `pi/perception`), or nothing if unavailable.
- `beam`: the ToF beam state (`BEAM_CLEAR`, `BLOCKED`, `CHECKING`, `UNCALIBRATED`, `UNKNOWN`) and distance, from `pi/tof-link`.
- `context`: bus movement, whether an accepted request exists, operator halt.
- Result: `zoneState` (`CLEAR` / `OCCUPIED` / `UNCERTAIN`), `permission` (`CONTINUE` / `HALT`), `reasons` (`HaltReason` values), and the inputs used. Field names match `RampSafetyDecision` in `contracts/`.

Rules:

- `CONTINUE` only when `zoneState` is `CLEAR` **and** every check passes. Anything else halts.
- Missing, stale, invalid or unknown sensor data is never `CLEAR`.
- One unsafe object in the ramp zone halts, even if the single ToF beam is clear (one beam cannot prove the zone is empty).
- A blocked beam with a healthy camera showing nothing unsafe disagrees, and halts.
- A bus that is not at the boarding position, is waiting for the bay, or has no accepted request halts.
- Safe objects never override an unsafe one or a degraded sensor.

## Run it alone

Nothing to run; it is a library. Import `decide` and call it with plain values.

## Test

Planned: `python -m pytest`. Pure unit tests, no hardware, network or model file.

## Depends on

No other repo module. It defines its own small input types; adapters in `pi/bus-agent` convert `pi/perception` and `pi/tof-link` output into them, so this module never imports either.
