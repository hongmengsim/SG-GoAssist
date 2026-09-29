# Anonymous edge observer

This optional camera companion processes frames in memory and publishes only anonymous object classifications. It deliberately has no face-recognition, identity, diagnosis, screenshot, or recording path. In addition to passenger objects, a locally trained model may label `leaf`, `leaves`, `tissue`, or `paper_tissue` as light ramp debris.

For a no-camera integration check:

```powershell
python edge_observer.py --demo-label wheelchair
```

For live inference, install OpenCV and Ultralytics, then supply a locally trained object-detection model whose labels match `wheelchair`, `walker`, `stroller`, `suitcase`, or `luggage`:

```powershell
python edge_observer.py --model goassist-objects.pt --camera 0
```

The `ml1` folder now contains the controlled label guide, private dataset layout,
local training/export script, and evaluation report generator. Start with
[`ml1/README.md`](ml1/README.md); a model file is not treated as competition
evidence until its generated evaluation report passes the documented thresholds.

When backend device authentication is enabled, set the same secret without putting
it in source control:

```powershell
$env:GOASSIST_DEVICE_SHARED_SECRET = "replace-with-device-secret"
python edge_observer.py --model goassist-objects.pt --camera 0 --device-id EDGE-OBSERVER-01
```

For a light-debris integration check:

```powershell
python edge_observer.py --demo-label tissue --bus DEMO-BUS-01
```

The camera label never clears the ramp by itself. The backend and mock-bus controller require a fresh VL53L5CX measurement showing a small object outside critical zones before a high-confidence light-debris label can be treated as non-blocking.

Camera-only ramp detections enter `NEEDS_CONFIRMATION`. They cannot produce a ramp command until a passenger or operator confirms the intent and the mock bus clears every safety interlock.

## Precision docking observer

`docking_observer.py` fuses an ArUco marker pose with a fresh ToF distance written
by the low-level controller. Calibrate the actual camera (the example values are
not valid evidence), mount the marker at the boarding point, then run:

```powershell
python docking_observer.py --calibration camera-calibration.json --tof-file tof-mm.txt
```

The mock autonomous controller will remain in precision stopping and keep its
doors closed if the marker is missing, either reading is stale, the two ranges
disagree, or lateral/heading/range tolerances are exceeded. Use `--demo` only for
software integration checks, not as a physical docking result.
