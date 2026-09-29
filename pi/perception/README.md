# pi/perception

**Status: planned, not implemented.** The working prototype (pretrained YOLO11n, object safe/unsafe policy, tests) is in the separate ML workspace and will be ported here, renamed to this repo's conventions.

## Purpose

Look at the ramp zone with the Pi camera and report what is in it. It runs the detector, decides for each object whether it is safe or unsafe to deploy over, and reports camera health. It makes no decision about the ramp: that belongs to `pi/safety-gate`.

Camera frames stay in memory. They are never written to disk or stored. A live view for the controller, if enabled, is streamed and not recorded.

## Interface

Output, one per processed frame:

```
PerceptionResult
  objects:        [ { className, safety: SAFE | UNSAFE, confidence, inZone, boxNorm } ]
  imageOk:        bool
  degradedReason: none | no_frame | too_dark | overexposed | low_contrast_or_blocked | inference_error
  observedAt:     ISO timestamp
```

- `inZone` is true when the object's box overlaps the ramp polygon (not only when its centre is inside).
- Policy: **unsafe by default.** Only an explicit list is safe, and never a person, wheelchair, walker, stroller or bicycle. Proposed safe list: `leaf`, `plastic_bag`, and only at or above the repo's existing light-debris confidence of 0.92. A size limit is an open question for the team.
- A frame that cannot be trusted (`imageOk` false) reports no objects and a reason. It never reads as "empty".

Input: a frame (numpy array) and a model file. Class labels follow the repo's names (`wheelchair`, `walker`, `stroller`, `luggage`, `leaf`) plus additions the handoff needs (`person`, `bicycle`, `bag_or_box`, `animal`, `plastic_bag`, `other_object`).

## Run it alone

Planned: `python -m perception --image path.jpg --model model.pt` on a recorded image, no camera, Pi, backend or ESP32 needed. The pretrained YOLO11n weights cannot detect wheelchairs, strollers, boxes or bottles; only a fine-tuned model can.

## Test

Planned: `python -m pytest` with recorded images and a stub detector. No camera or model file required for the logic tests.

## Depends on

No other repo module. External: the model file (produced by the separate ML repository), and on the Pi: `opencv`, `ultralytics`, `picamera2`. Its output type is consumed by `pi/safety-gate`.
