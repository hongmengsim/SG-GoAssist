# pi/safety-gate

**Status: implemented (software only). Never run against a real sensor or camera.**

## Purpose

The Pi's decision: may the simulated ramp deploy or continue, or must it halt? It is pure logic with no camera, serial port or network, so it can be tested completely on its own and read in one sitting. The Pi is the safety authority; the backend records and relays the result and may add stricter checks, never looser ones.

## Interface

```python
from safety_gate import BeamInput, BusContext, CameraInput, DetectedObject, decide

decision = decide(camera, beam, context)   # camera may be None
report = decision.to_report("2026-09-30T00:00:00.000Z")   # body of a RampSafetyReport
```

- `camera`: `CameraInput(image_ok, degraded_reason, age_seconds, objects)`. `objects` is a tuple of `DetectedObject(class_name, safety, confidence, in_zone)`, or `None` if detection did not run. `in_zone` and `safety` come from `pi/perception` (geometry and the safe/unsafe policy); the gate does not repeat them.
- `beam`: `BeamInput(state, distance_mm, simulated)` with `state` one of `BEAM_CLEAR`, `BLOCKED`, `CHECKING`, `UNCALIBRATED`, `UNKNOWN` (the contract's `TofBeamState`). The teammate's `BeamState` in `pi/tof-link` spells the clear state `BEAM CLEAR`; the adapter in `pi/bus-agent` converts it.
- `context`: `BusContext(movement, has_accepted_request, operator_halt)`. `movement` is a `BusMovementState`.
- `config`: `GateConfig(max_camera_age_seconds)`, default 1.0 s. That default is a placeholder assumption until the real camera rate is known.
- Result: `zone_state` (`CLEAR` / `OCCUPIED` / `UNCERTAIN`), `permission` (`CONTINUE` / `HALT`), `reasons` (`HaltReason` values in a fixed order), and the inputs used. `to_report` uses the contract's field names and validates against `contracts/schema/RampSafetyReport.schema.json`.

## Rules

- `CONTINUE` only when `zone_state` is `CLEAR` **and** no halt reason applies. Anything else halts, and a halt always carries at least one reason.
- Missing, stale, invalid or unrecognised sensor data is never `CLEAR`. A camera is trusted only if it has a fresh frame, `image_ok`, no degraded reason, and detection ran.
- One unsafe object in the ramp zone halts even if the single beam is clear (one beam cannot prove the zone is empty). A missing or unknown `safety` verdict counts as unsafe.
- A blocked beam with a healthy camera showing nothing unsafe is a disagreement (`SENSORS_DISAGREE`, zone `UNCERTAIN`) and halts. There is no option to let a safe object override the beam; that would remove the beam's veto and is a decision for the team, not a setting.
- A bus that is not at the boarding position, is waiting for the bay, has no accepted request, or has an operator halt, halts.
- Safe objects never override an unsafe one or a degraded sensor.

## What changed from the ML prototype

The prototype in `bus-project-2/obstacle/zone_gate.py` judged a ToF distance against a 60 cm threshold. This repo's ToF is a single calibrated beam with named states, so the gate takes those states instead and the distance threshold is gone. Context checks (bay, request, operator halt) and the report shape are new. The prototype's geometry and object policy belong to `pi/perception` and are not part of this module.

## Run it alone

Nothing to run; it is a library.

## Test

From this directory:

```
python -m unittest
```

29 tests: the rules above one by one, plus exhaustive combinations of beam state, camera state, bus movement, request and operator halt that check the invariants (continue only when everything is good, a halt always has a reason, a clear zone needs a clear beam and a healthy camera), and a check that every decision is a valid report against the generated JSON Schema. No hardware, network or model file. The contract test needs `jsonschema` (`pip install -r requirements.txt`).

## Depends on

Nothing at run time. The contract test reads `contracts/schema`. Adapters in `pi/bus-agent` convert `pi/perception` and `pi/tof-link` output into this module's input types, so this module never imports either.
