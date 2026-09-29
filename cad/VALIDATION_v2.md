# Robobus v2 validation

## Result

The nominal boarding concept was built and operated in Autodesk Fusion. V1 remains a separate unchanged archive. Both side badges were visually checked upright.

| Check | Result |
|---|---|
| Native solid validity | 189 solid bodies; no non-solid bodies |
| Timeline health | No failed or warning features at the final geometry check |
| Movable assembly | Eight native as-built joints; grounded vehicle/context components |
| Clearance sweep | 73 sampled positions; zero moving-part intersection volumes; zero check errors |
| Door motion | Both leaves plug outward 70 mm, then slide 570 mm in opposite X directions |
| Ramp motion | 1825 mm outward, 75 mm upward, 6.379370° downward |
| Main doorway | Native 1100 × 2000 mm cut, X centre 3000, floor Z350 |
| Ramp section | Nominal 900 × 1800 × 35 mm with tapered underside at curb tip |
| Threshold contact | Upper root at Y1025, Z350 |
| Curb contact | Upper tip at approximately Y2813.854382, Z150.000007 |
| Operating states | Travel, Doors Open, Ramp Extended, Boarding Ready |
| Exports | Native Fusion archive; separate travel/deployed STEP and PNG files |

## Clearance method and limits

The check copied actual Fusion solid bodies into temporary boundary-representation geometry in assembly coordinates, filtered candidate pairs by bounding boxes, and intersected candidate solids. It checked moving components against the vehicle, wheels, fixed access hardware and curb, and against other moving components. Parts within the same rigid component were excluded: their assembly/weld/appearance overlaps are not deployment collisions.

Every controlled stage was sampled at 25%, 50%, 75% and 100%, during opening/deployment and reverse retraction, together with the initial travel state. The reported 73 poses include repeated stationary stages used by the safe-return sequence. Volumetric intersections above 0.01 mm³ were reported; surface-only contact was not treated as interference. This is a discrete CAD packaging check, not continuous collision certification, structural analysis or a vehicle safety validation.

The final ramp angle was driven with six-decimal angular precision, avoiding a 6.4° display-rounding error at the curb. Fusion's previous angular display preference was restored after each drive operation. The upper walking surface, rather than the deck centreline, defines the threshold and curb heights.

## Entrance panel correction

The right silver lower skirt originally crossed the doorway. The moving-part sweep did not detect this static passage obstruction. A native cut now removes the strip within the doorway; the pre-correction archive is retained separately.

An additional Boarding Ready solid-intersection check tests the entrance plane at Y1000–1024 mm: the full nominal doorway width above Z400.1 mm, and the ramp walking strip (X2565.1–3434.9 mm) from Z350.1–400.1 mm. The small boundary offsets avoid counting intended surface contact. Hinge and bearing hardware occupies the lower side margins: the floor-level walking strip is 870 mm wide, so the full 1100 mm frame width is not clear down to the floor.

The earlier 73-pose sweep predates this removal of static material; moving geometry is unchanged. The new passage check returned zero intersections in both tested regions, addressing the obstruction missed by that sweep. Final checks found no invalid solids or timeline warnings, and travel/deployed exports were regenerated.

## Driving-parameter checks

The following temporary changes were made in Fusion, recomputed, measured, and restored:

| Parameter | Test | Measured result |
|---|---:|---:|
| rampWidth | 901 mm | Deck width 901 mm |
| doorWidth | 1101 mm | Doorway sketch width 1101 mm |
| doorHeight | 2001 mm | Doorway sketch height 2001 mm |
| curbHeight | 151 mm | Curb solid height 151 mm |

The main deck length and thickness also have native expression dimensions. Travel limits are synchronized from the named parameters by the demonstration script. Nominal trim, tip taper, mounts and frames are not a fully adaptive OEM design; see README_v2.md before changing the main dimensions.

## Sequence and provenance

The controller raises the bridge, levels/lowers/retracts the ramp, and only then slides and plugs the doors closed. Deployment opens the doors before extending the ramp, then raises and tilts it before lowering the bridge. Manual joint edits can bypass this demonstration sequence.

The four corner LiDAR units and roof receiver retain photo-based labels. Cameras/radar details, all boarding sensors and all mechanisms are proposed or estimated hardware. The model makes no claims of structural certification, accessibility compliance, OEM accuracy or operational interlock reliability.

Machine-readable evidence: `v2_final_report.json`, `v2_model_report.json` and `v2_clearance_report.json`. Earlier failed packaging iterations remain in `v2_build.log` for traceability; the final clearance report describes the corrected geometry.
