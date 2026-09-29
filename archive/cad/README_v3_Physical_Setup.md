# Robobus v3 — APAS physical setup

This separate tabletop revision follows `output/pdf/APAS_Three_Laser_Physical_Setup.pdf`, pages 4–5. Full-size v1/v2 archives are preserved. The source gives proposed build dimensions, not measured hardware specifications. The tabletop envelope is not a uniform scale reduction of v2, and its coordinate direction along the bus is reversed from v2.

## Open and use

Open `APAS_Robobus_v3_Physical_Setup.f3d` in Fusion. Components 08 and 09 contain independently hideable optical rays and benchmark sketches. Component 02 is the removable roof; component 10 is a hidden test obstacle. The STEP contains solid geometry, including mounting allowances and projected-line reference strips; sketch rays and labels remain in Fusion only.

The model is a static physical sensing setup. The PDF places the ToF sensor at the doorway centre. Its proposed removable crossbar occupies the entrance and must be removed for a separate boarding demonstration. The jointed full-size v2 assembly remains the source for the earlier door/ramp movement concept.

## Coordinate datum

All dimensions are mm. Origin `(0,0,0)` is directly below the centre door on the baseboard top. **+X points toward the front; +Y outward; +Z upward.** To obtain the PDF's baseboard coordinates, add 500 to X and 300 to Y.

| Envelope | Model benchmark |
|---|---|
| Baseboard | 1000 × 900; selected thickness 10 from source range 9–12 |
| Bus | X −300…300; Y −180…0; top Z220, including wheel elevation |
| Door opening | X −80…80; Z40…200; 160 × 160 |
| Floor/ramp upper hinge surface | Z40 |
| Ramp | 220 upper-surface length × 140 width; selected 4 thickness from source range 3–5; tapered tip |
| Ramp deployed reach | 216.333; slope 10.476°; upper tip Z0 |
| Marked area | X −110…110; Y0…300; side lines begin at Y20 |
| Ramp-to-side-line margin | 40 each side |
| Reference board | 300 wide × 280 high; optical face Y450; bottom Z0 |
| Test obstacle | 150 wide × 180 high, stable foot; hidden by default |

## Optical mounting benchmarks

Coordinates describe the optical centre/aperture, not the top or centre of a housing.

| Device | X | Y | Z | Height above bus roof | Starting direction |
|---|---:|---:|---:|---:|---|
| Camera | 0 | −60 | 400 | 180 | Outward, 60° below horizontal |
| L1 | −110 | 0 | 260 | 40 | Outward/down 60°; line along Y |
| L2 | 110 | 0 | 260 | 40 | Outward/down 60°; line along Y |
| L3 | 0 | 20 | 280 | 60 | Outward/down 45°; line along X |
| ToF | 0 | 0 | 140 | −80 | Level along +Y; 100 above floor |
| Reference optical target | 0 | 450 | 140 | — | Faces ToF |

Only one camera position is specified by the source. No additional camera position or lens coverage is assumed.

## Aiming and distance checks

- **L1/L2:** target X=±110, Y20…300 at Z0. Endpoint depression angles are 85.601° and 40.914°. Required angular span is **44.687°**; retaining a symmetric fan centred at 60° needs at least **51.203°** to reach both endpoints. Actual module fan angle must be measured; these are geometric requirements, not a module capability claim.
- **L3:** target Y300, X−110…110. The centre is 280 outward and 280 down from the aperture, giving exactly 45° depression. Required transverse fan is **31.050°**.
- **Camera:** at `(0,−60,400)`, a 60° centre ray reaches Z0 at **Y170.940**. Aiming at `(0,200,0)` requires **56.976°**. Corner sightlines show the area the selected camera must include. They are not an asserted camera field of view.
- **ToF:** matte reference face is **450** from the optical window. Source nominal 25° full FoV gives **199.525** diameter at that distance, with vertical interval **Z40.237…239.763**. At Y300 the corresponding width is only **133.017**, less than the 220-wide marked area. One clear ToF return does not establish whole-zone clearance.
- **Assembly height:** camera optical centre Z400; estimated support top Z424. Allow at least 424 above the baseboard for this fixture layout (434 including the selected base thickness). Actual hardware may require more.

## Camera obstruction found in the source arrangement

Native solid ray checks find that the specified `(0,−60,400)` camera position cannot see the ramp hinge or the near ground corner through the roof. The ideal roof shadow on the base extends from Y0 to **Y73.333**. Sightlines toward ground Y100, Y200 and the far corner clear the bus body. The model includes the shadow outline and a hidden **proposed alternative camera datum `(0,+20,400)`** in component 09. That forward position removes the roof overhang from the hinge sightline, but its bracket, lens coverage and obstruction by other hardware still need checking. It is an alternative to evaluate, not a source requirement or a verified camera configuration.

## Validation

Fusion returned 44 solid bodies and no failed/warning timeline features. Optical sketch points were read back at all five specified coordinates. Native bounding boxes confirm the 1000 × 900 × 10 baseboard and 300 × 280 reference board with its front face at Y450. Five camera sightlines were intersected with the bus and roof solids; the results above are recorded in `v3_physical_report.json`. This check is limited to those rays and those solids, not continuous image coverage or a clearance certification.

## Detail assumptions and editing limits

Source dimensions and optical coordinates are retained directly. Selected material thicknesses are 10 baseboard and 4 ramp, both within the source ranges. Housing allowances are estimated: lasers Ø12 × 30, camera Ø20 × 24, and ToF Ø10 × 8. Mounts, reference-board thickness, wheel styling and obstacle thickness are proposed visual/packaging allowances. They are not production fixing-hole or manufacturer envelopes.

Primary rectangular build envelopes use native dimensional expressions. Optical rays, housing/mount geometry and the tapered ramp are built at the nominal values and do not all update from parameter edits. Regenerate or explicitly revise those features when changing the setup. Source, calculations and nominal values are recorded in the model's APAS attributes and `v3_physical_report.json`.

No wiring, firmware, laser power settings, or vehicle controls were changed.
