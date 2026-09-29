# pi/perception

**Status: policy layer implemented (software only). No camera and no model runner yet; both are deferred until a Pi and a model are available.**

## Purpose

Judge what is in the ramp zone. Given a frame and a detector, it decides for each object whether it is safe or unsafe to deploy over, whether it overlaps the ramp polygon, and whether the frame can be trusted at all. It makes no decision about the ramp: that belongs to `pi/safety-gate`.

Camera frames stay in memory. Only summary statistics (mean and spread) are read for the health check; nothing is written to disk or stored. A live view for the controller, if enabled later, is streamed and not recorded.

## Interface

```python
from perception import StubDetector, RawDetection, analyse

result = analyse(frame, detector, polygon)   # -> PerceptionResult
```

```
PerceptionResult
  objects:         tuple of PerceptionObject, or None
  imageOk:         bool          (image_ok)
  degradedReason:  none | no_frame | too_dark | overexposed | low_contrast_or_blocked | inference_error
  observedAt:      ISO timestamp

PerceptionObject: class_name, safety (SAFE | UNSAFE), confidence, in_zone, box_norm (centre x, y, width, height)
```

- `objects` is `None` whenever the frame cannot be trusted or the detector fails. That means "unavailable", never "empty". An empty tuple means a healthy frame with nothing detected.
- `in_zone` is true when the object's box overlaps the ramp polygon (not only when its centre is inside). A polygon with fewer than 3 points, or a box with broken numbers, counts as overlapping.
- Policy: **unsafe by default.** Only `leaf` and `plastic_bag` are safe, and only at or above the repo's light-debris confidence of 0.92 (owner decision 29 Sep 2026). A person, wheelchair, walker, scooter, stroller, bicycle, crutches, cane or animal can never be safe, even if a custom list names them. Unknown classes, invalid confidence, and boxes with broken numbers are unsafe. A size limit is an open question for the team.
- Detectors implement `detect(frame) -> [RawDetection]` (`Detector` protocol). Only `StubDetector` exists; a model runner plugs in later.

Class labels follow the repo's names (`wheelchair`, `walker`, `stroller`, `luggage`, `leaf`) plus additions the handoff needs (`person`, `bicycle`, `bag_or_box`, `animal`, `plastic_bag`, `other_object`).

## Run it alone

It is a library; nothing to run. A command-line tool for recorded images (`python -m perception --image ...`) needs OpenCV and a model, so it is deferred with the model runner.

## Test

From this directory:

```
python -m unittest
```

33 tests: box-overlaps-polygon geometry (including concave polygons and fail-safe cases), the safe/unsafe policy, image health, and the analysis pipeline with a stub detector and a fake frame. No camera, model file or numpy needed.

## What changed from the ML prototype

Geometry, policy and image-health checks are ported from `bus-project-2/obstacle`. The prototype also fused the ToF distance and published a message in its own format; that fusion is now `pi/safety-gate`, and the output here is a plain `PerceptionResult`. Names follow this repo: `SAFE`/`UNSAFE` (not `safe`/`unsafe`), and a confidence floor for safe classes is new.

## Depends on

No other repo module. On a Pi later: `opencv`, `ultralytics`, `picamera2`, and a model file produced by the separate ML repository. Its output is converted into `pi/safety-gate` inputs by `pi/bus-agent`.
