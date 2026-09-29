# Validation report — Robobus v4

## Geometry

- 44 unique STL files; 94 total copies including coupons.
- All 44 passed: closed two-manifold edges, consistent winding, one connected component, positive signed volume, no degenerate triangles, millimetre scale and reserved print envelope.
- Fusion native solids: one connected solid per part; no failed timeline features reported on export.
- Earlier revisions preserved. Reference graphics/baseboard excluded.

## Assembly and motion

Native Fusion BRep intersections were evaluated on 83 assembled part instances and 109 sampled extraction/motion configurations.

- No unintended positive-volume static intersections remain.
- Three intentional collar/split-sleeve overlaps remain, approximately 33.51 mm³ each. They represent elastic clamping; physical behavior is unverified.
- Roof lifts at 5, 10, 20, 30, 60 and 100 mm, followed by forward removal samples, clear the fixed structure/supports with latches retracted.
- Tray lift samples at 5, 30, 140 and 220 mm clear fixed structure.
- Three laser carrier/collar assemblies clear body, roof and yokes at every requested 5° index from 40° to 85°.
- Ramp outer folding sampled every 10° from 0° to 180°; folded packet raising sampled every 10° plus exact upright endpoint. No collisions with fixed body, roofs, wheels or trays after removing the ToF bracket and stow latch.
- Camera carriage sampled at every 10 mm index from Y−60 to Y+20; no interference with roof, mast, rail or laser mounts.
- Doorway nominal 160 × 160; removable ToF bar intentionally obstructs it in the sensing configuration. No permanent grey blocking panel is used. The folded ramp occupies the lower opening only when stowed.

These are sampled rigid-body CAD checks, not continuous swept-volume proof, deformation analysis or a physical assembly test. Cables and actual electronics were not simulated. Optical and cable benchmarks are dimensional provisions, not verified sensor coverage or connector compatibility.

## Slicing

- All 15 plate layouts sliced successfully in PrusaSlicer 2.9.6 using embedded CORE One 0.4 / Generic PLA / 0.20 mm / 4-perimeter settings.
- Linear extrusion paths after the startup sequence were checked against X0…250 and Y0…220, including automatically generated supports and brims. Arc fitting is disabled to permit direct path-bound checking. Extrusion endpoints remain at least 0.25 mm inside the bed, covering half the nominal line width.
- Slicer GUI inspection: body mesh/scale, roof model and its support/toolpath preview, and the 11-shell coupon layout; profile loaded as CORE One 0.4, Generic PLA. The settings panel confirmed 0.20 mm layers and four perimeters. Additional plate results are recorded in slicing_report.json.
- Estimated total: 118.68 hours normal mode; 3057.80 g PLA, including coupon plate. Times/material derive from sliced G-code only.

## Remaining physical checks

Print coupons before large parts. Confirm barrel diameter, clamp friction, printed tooth engagement, removable pin flex, roof latch fit, tray retention, real camera/ToF fit and cable routing. No structural certification or verified optical coverage is claimed.
