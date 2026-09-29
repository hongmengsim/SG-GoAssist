# Autonomous Passenger Assistance task traceability

This document turns the supplied challenge task into testable GoAssist requirements. “Implemented” refers to the portable mock-bus and bus-stop prototype, not a road-certified vehicle system.

## Required assistance loop

1. **Voluntary request:** app, NFC or tactile stop control records anonymous passenger intent.
2. **Environmental perception:** edge camera and distance/laser sensors report need and zone observations without images or identity.
3. **Intent assessment:** observations may produce `LIKELY`, but only passenger/operator confirmation produces `CONFIRMED` for a particular bus.
4. **Assistance decision:** the case selects ramp, audio, visual, vibration and/or extended dwell actions.
5. **Safety verification:** correct stop and bus, stationary vehicle, brake, door, ramp envelope, wheelchair space, controller health and fresh telemetry are checked.
6. **Verified actuation:** the mock ramp deploys only after clearance and continuously checks interlocks while moving.
7. **Outcome verification:** boarding/alighting completion triggers retraction; the case becomes complete or cancelled only after the stowed limit switch is verified. Autonomous departure independently requires a stowed ramp.

## Functional requirements

| ID    | Prototype implementation                                                            | Evidence / acceptance                                                              |
| ----- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| FR-01 | Edge classifications for wheelchair and walking-aid indicators                      | Controlled labelled trials through the perception-evaluation API                   |
| FR-02 | Shared app, NFC, physical-button and operator signal contract                       | Each explicit source delivers 30/30 requests in controlled trials                  |
| FR-03 | Auditable `BoardingIntentAssessment`; sensor fusion cannot confirm intent by itself | Unit test for `LIKELY` versus `CONFIRMED`; operator console shows reasoning        |
| FR-04 | Assistance-case rule/state machine and vehicle capability matching                  | Tests cover validation, assignment, safety, blocked, failed and escalated states   |
| FR-05 | ESP32-controlled miniature centre-door ramp                                         | Deployed and stowed limit switches must agree with command status                  |
| FR-06 | External speaker command                                                            | Visual equivalent is issued with every bus-identification announcement             |
| FR-07 | Stop/bus visual display and status light                                            | Passenger and operator status remains visible during actions                       |
| FR-08 | Reversible extended-dwell command                                                   | May proceed from detection; does not authorize mechanical movement                 |
| FR-09 | Anonymous boarding-zone position from camera/depth/laser                            | Validate door-zone orientation after every sensor mount change                     |
| FR-10 | Pressure or edge-observer boarding/alighting completion signals                     | Low confidence requires confirmation; high confidence starts safe ramp closure     |
| FR-11 | Deployed/stowed switches plus actuator status                                       | `READY` requires deployed verification; terminal case requires stowed verification |
| FR-12 | Passenger/app, voice and operator cancellation                                      | Unstarted ramp commands are cancelled; active movement stops or retracts safely    |

## Safety, reliability, usability and privacy

| ID    | Enforced behavior                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR-01 | Ramp movement requires stopped vehicle, active brake and open centre door.                                                                                                        |
| SR-02 | Hard obstruction input and VL53L5CX 8×8 ramp-envelope sensing block movement. High-confidence leaf/tissue classification may clear only a small, distant, non-critical footprint. |
| SR-03 | Autonomous departure is rejected unless the ramp is verified `STOWED`, the door is closed and the path is clear.                                                                  |
| SR-04 | Camera-only or other sensor-only ramp intent remains `NEEDS_CONFIRMATION`; uncertainty fails safe.                                                                                |
| RR-01 | Explicit requests remain authoritative when perception is unavailable. Independent hard interlocks remain active if the camera fails. Laser/camera disagreement blocks.           |
| RR-02 | The ESP32 rechecks local safety during movement. Missing network or stale safety data blocks new movement and alerts the operator.                                                |
| UX-01 | Passenger controls use direct actions and plain-language status rather than technical sensor terms.                                                                               |
| UX-02 | Essential status has visual, spoken and vibration equivalents where configured.                                                                                                   |
| UX-03 | Cancellation is available throughout the request lifecycle and never permits departure with an unverified ramp.                                                                   |
| UX-04 | Passenger and operator views expose current case, safety and equipment state.                                                                                                     |
| PR-01 | The model recognises objects/needs, not faces, diagnoses or identities.                                                                                                           |
| PR-02 | Perception runs on the local edge observer; only classifications and confidence are sent.                                                                                         |
| PR-03 | Camera frames stay in memory and are not stored or transmitted.                                                                                                                   |

## Performance evidence

| ID    | Measurement path                                                                                                          | Target                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| PF-01 | `/api/operations/metrics` acknowledgement P95 and completion median                                                       | Acknowledgement under 2 seconds at P95 on the demo network                                  |
| PF-02 | Label trials through `POST /api/operations/perception/evaluations`; results from `GET /api/operations/perception/metrics` | Report per-class TP, FP, FN, precision and recall; controlled precision/recall at least 90% |
| PF-03 | Append-only actuator/audit events plus interlock trials                                                                   | Zero unsafe movements across at least 50 obstruction/interlock trials                       |

## Physical validation still required

- Train or select an edge model that exposes the required wheelchair, walking-aid, stroller and luggage classes; do not treat demo labels as measured recognition performance.
- Calibrate the centre-door camera and VL53L5CX zones against the actual ramp sweep and landing area.
- Fit a hard-wired emergency stop, current limiting and mechanically safe actuator before public demonstrations.
- Run representative-user trials with consent and accessibility advocates.
- Treat the tabletop controller as a research demonstrator only. Road deployment requires certified automotive controllers, independent safety engineering and authority approval.
