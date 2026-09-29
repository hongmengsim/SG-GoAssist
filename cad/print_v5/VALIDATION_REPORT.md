# Robobus v5 validation

- 38 / 38 STLs: closed edge-manifold meshes, consistent winding, one connected component, no degenerate triangles, positive volume and reserved-envelope fit.
- STL dimensions agree with native millimetre dimensions within 0.02 mm; mesh volumes agree with native solids within 1% tessellation tolerance.
- Native solids: no invalid bodies or failed timeline features.
- 77 sampled CAD motion/envelope checks pass: roof lift and outward withdrawal, tray lift, laser angles every 5°, camera Y positions and electronics clearance volumes.
- The only static intersections are three deliberate elastic sleeve/collar compression regions. No other solid-to-solid interference remains in the assembled concept.
- Roof removal is checked with sensor carriers, collars and camera hardware present. Clips are removed first. CAD checks are sampled rigid geometry checks; they do not prove printed flexure life, friction strength or fit.
- Plate quantities match the parts list. All eight complete sliced plates pass material, normal-mode time and bed-boundary checks. All eight final 3MF projects were opened and sliced in the PrusaSlicer interface; top-view toolpaths and brim separation were inspected. GUI material totals agree with the reports, and no support/stability warnings remain. Screenshots are in `previews/`.

v4 files are preserved. No application code or public APIs were changed for this revision.


## Budget

| Plate | PLA g | Normal-mode estimate |
|---|---:|---:|
| plate_01_body | 209.97 | 7h 27m 52s |
| plate_02_roof | 43.24 | 1h 06m 42s |
| plate_03_tray | 18.32 | 0h 37m 15s |
| plate_04_laser | 18.06 | 0h 44m 22s |
| plate_05_camera | 15.65 | 0h 45m 01s |
| plate_06_sensor | 5.39 | 0h 15m 20s |
| plate_07_hardware | 26.75 | 1h 05m 56s |
| plate_08_coupon | 4.53 | 0h 14m 56s |

Total: **341.91 g / 12h 17m 24s**. Complete set, normal mode.
