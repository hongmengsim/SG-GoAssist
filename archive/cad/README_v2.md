# Robobus v2 — boarding-system concept

The v1 files are preserved. V2 adds a recessed entrance, independently jointed doors and ramp stages, and proposed access sensors to the photographic exterior study.

## Coordinate system and dimensions

Millimetres. X increases from front to rear; the entrance is on +Y; ground is Z=0. The provisional bus envelope remains 5500 × 2050 × 2650 with a 3800 wheelbase. See README.md for the published dimensional sources and unresolved height discrepancy.

| Item | Nominal value |
|---|---:|
| Door frame opening width × height | 1100 × 2000 |
| Ramp walking strip at floor level | 870 wide |
| Entrance centre behind front | 3000 |
| Threshold elevation | 350 |
| Door outward plug travel | 70 |
| Each leaf longitudinal travel | 570 |
| Ramp deck width × length × thickness | 900 × 1800 × 35 |
| Ramp extension | 1825 |
| Ramp lift | 75 |
| Curb height | 150 |
| Ramp nominal tilt | asin(200/1800) = 6.379° downward |

The ramp tip is tapered. The 200 mm fall is measured between the upper walking surfaces, not between deck centrelines. The curb begins at the tip contact edge. Its component can be hidden independently.

The lower silver body panel is cut back across the doorway. Hinge and bearing hardware remains in the lower side margins; the full frame width is therefore not clear down to floor level. See the entrance passage check in VALIDATION_v2.md.

## Operating the assembly

Open the v2 Fusion archive, then run **RobobusV2** under Utilities → Scripts and Add-Ins. If necessary, add the local `cad/RobobusV2` folder. Run it again to select one of these exact position names:

1. **Travel** — doors closed; ramp level, lowered and stored; bridge raised.
2. **Doors Open** — both leaves move outward, then apart.
3. **Ramp Extended** — doors open; ramp extended horizontally at cassette height.
4. **Boarding Ready** — ramp extended, raised and tilted; bridge lowered.

The demonstration controller first returns through the safe retraction sequence before moving to the requested state. Door closing occurs only after the ramp is level, lowered and retracted. Ramp extension occurs only after both doors have moved outward and apart. This is a CAD demonstration sequence, not a vehicle safety controller. Manual joint manipulation bypasses the scripted sequencing.

The archive contains separate components and native as-built joints. The root attributes also store the named state values and sequence description. STEP exports retain solid geometry at their exported pose, but do not preserve Fusion joints or the controller.

The four positions are also captured as named Fusion position features near the end of the timeline. Use the script for the ordered demonstration. The doorway cut, primary ramp deck dimensions and curb height use native parameter expressions. The script reads the travel parameters and synchronizes the joint limits when run. Small trim, taper, grip strips, frames and sensor mounts retain nominal placement; changing the main dimensions is not an automatic redesign of those details.

## Sensor provenance

**PHOTO-BASED vehicle sensor** names identify the four retained corner LiDAR units, their brackets, and the roof GNSS receiver. Locations and detailed housings remain photographic approximations.

**PROPOSED** identifies front/rear camera optics and radar housings whose detailed construction and placement are estimated, as well as all access-system hardware: doorway beam heads at two heights, door-position proximity switches, ramp end switches, a moving hinge-angle encoder and an overhead boarding detector. The access sensor component is independently hideable.

| Sensor | Approximate centre/location (mm) |
|---|---|
| Four corner LiDAR units | X430 / 5110, Y±1110, Z2275–2505 |
| Roof GNSS | X1050, Y0, Z2650–2745 |
| Front/rear camera | X−18 / 5510, Y0, Z1450 |
| Front/rear lower radar | X−18 / 5510, Y0, Z530–620 |
| Doorway obstruction heads | Beside both jambs, Z500 and Z1150 |
| Door-position switches | Beside both jambs, Z2320–2345 |
| Boarding detector | Above opening, X2950–3050, Z2360–2400 |
| Ramp angle encoder | On moving lift carriage, coaxial with deck hinge |
| Ramp end switches | Beside cassette rear and deployed carriage location |

## Scope

This is a movable packaging and visual concept, not an OEM reproduction. The entrance recess is usable local space, not a complete passenger interior. Mechanism actuators, guide rails, seals, bearings and sensor mounts are simplified. It excludes structural certification, accessibility-compliance validation, wiring, vehicle control software and fabrication drawings.

Final geometry and clearance results are recorded separately in the validation report. Parameter changes outside the nominal configuration require renewed clearance/contact checks and may require mechanism-detail adjustments.
