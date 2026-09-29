# Robobus v4 — printable electronics demonstrator

Separate printable revision, created in Autodesk Fusion. Previous bus models are preserved.

## Files

- `Robobus_v4_Printable.f3d`: native Fusion assembly with one editable solid base feature per unique part and repeated component instances.
- `Robobus_v4_Assembled.step`: assembled solids, millimetres. The ramp is deployed and the removable ToF bar is installed.
- `stl/`: 44 unique part files, in millimetres, normalized to the bed and oriented for printing. Print the quantities below, not just one of every file.
- `plates/`: 15 suggested plate STL layouts, PrusaSlicer 3MF projects with embedded settings, and sliced G-code. Layouts contain the required repeated parts.
- `parts_list.csv`: numbered parts, quantities, plate mapping and print notes.
- `assembled.png`, `exploded.png`, `roof_access.png`, `ramp_stowed.png`: assembly previews.
- `mesh_validation.json`, `assembly_audit.json`, `slicing_report.json`: machine-readable checks.

The Fusion base features can be edited with direct modelling tools. Named parameters record design benchmarks; changing them does **not** regenerate these base features. The accompanying `../RobobusPrint/RobobusPrint.py` rebuilds the design. This revision has separate components and sampled motion checks, rather than a joint-driven animation.

## Envelope and datums

The body is 600 × 180 × 220 mm, split at X−100 and X+100 into three 200 mm sections. Ground is Z0; the entrance face is Y0, the body occupies Y−180…0, and front is X+300. The 160 × 160 mm doorway occupies X−80…80 and Z40…200. There are no door leaves or actuators. Walls are 3 mm, with local backing behind the cosmetic window recesses to preserve a 3 mm minimum; floor thickness is 4 mm. Joining pockets, wheel mounts and sensor sockets are reinforced locally.

The roof, wheels and sensor hardware are separate prints. Supports/latches project beyond the nominal roof envelope; optical benchmarks extend to Z400. The deployed ramp extends outside the 180 mm body width.

| Benchmark | X | Y | Z | Setup |
|---|---:|---:|---:|---|
| L1 aperture/pivot | −110 | 0 | 260 | 60° downward |
| L2 aperture/pivot | 110 | 0 | 260 | 60° downward |
| L3 aperture/pivot | 0 | 20 | 280 | 45° downward |
| ToF optical centre | 0 | 0 | 140 | Removable doorway bar |
| Camera optical centre | 0 | +20 default | 400 | Y adjustable −60…+20 |

Angles are measured downward from horizontal toward +Y. Place each laser's emitting aperture at the sleeve's front plane. Bore is nominal Ø12.6 for an estimated Ø12 × 30 mm barrel. Actual optical locations depend on module seating. The camera platform top is Z392; its adjustable jaws provide a mounting allowance, and the real lens must be positioned 8 mm above that surface to achieve Z400. Camera fit, connector access and optical coverage remain unverified.

## Print coupons first

Use PLA, 0.4 mm nozzle, 0.20 mm layers and four perimeters. The embedded profile uses 20% infill, 3 mm outer brim, automatic snug supports and a 30° support threshold. All supports are breakaway PLA.

1. Print plate 15 (coupons). Also print one 07 joining key and one 09 roof latch from their individual STLs; those are the mating gauges and can subsequently be used in the assembly.
2. Test 07 in C01 clearance coupons (0.2, 0.3 and 0.4 mm per mating face). The bus uses 0.3 mm. Choose a freely removable fit after cooling; adjust mating pockets before large prints if needed.
3. Test 09 in C03 (6 × 3 mm channel around a 5.4 × 2.4 mm tongue).
4. Test C05 in C04 (Ø4 pin in Ø4.6 bore), including split-tip removal.
5. Test the real laser against C02 bores: 12.0, 12.2, 12.4, 12.6 and 12.8 mm. Check the split carrier and collar before printing all three. The tapered collar intentionally compresses the sleeve; do not force it onto an oversized module.

The small PLA split pins and face teeth require support removal and a physical fit trial. Their durability is not established by a manifold check.

## Assembly order

1. Remove supports and brims from all mating faces and bores. Check keys, latches and hinge pins with the coupons.
2. Place bodies 01–03 on a flat surface. Match X−100 and X+100 seams. Insert four 07 keys per seam from above, followed by two 08 pins per key. The two floor pockets and two rear-wall pockets leave the interior connected.
3. Fit four 10 wheels and four 11 axles, with axle heads facing outward. These are static display wheels.
4. Put 12 breadboard tray in the rear bay and 13 electronics tray in the front bay. Feet sit on Z40; mounting surfaces are Z55. Reserve the next 60 mm above each tray for parts and jumpers. Move eight 14 retainers between slots to suit the hardware. Nominal breadboard is 165 × 55; the 110 × 90 controller tray is an allowance, not an exact Pi fixture. Both trays lift out through the roofs.
5. Route cables through the two rounded 20 × 12 mm rear openings (X−300, Y−90, lower edges Z65/Z88). Keep wires above the seam pockets and behind the ramp. Rear ventilation slots remain open.
6. Fit ramp 29 to the body hinge with pin 31. Fit 30 to its folding hinge with pin 32. The walking length is 220 mm, split into 115 and 105 mm sections, 140 mm wide. This unequal split clears the floor when folded. The 4 mm deck has grip grooves, an underside landing taper and small butt stops.
7. Insert yokes 15/16/17 into the fixed header sockets and retain with three 21 pins. Install carriers 18, collars 19 and pivots 20. Orient each collar notch toward its toothed disc. Pull the pivot pin, disengage the face teeth slightly, select a 5° index in 40–85°, and reseat. Rotate the barrel to align the projected line, then seat its tapered collar by hand. Default L1/L2 is 60°, L3 is 45°.
8. Install camera mast 22 with the fourth 21 pin. Slide rail 23 through it, with its rear stop against the mast. Fit platform 24, jaws 25 and index pin 26. The forward default is Y+20; withdraw the pin before selecting another 10 mm rail index. Adjust the real camera for Z400.
9. For sensing demonstrations only, install removable ToF bar 27 and cap 28. **This bar occupies the doorway. Remove it before folding or using the ramp.**
10. Locate roofs 04–06 in their skirts and insert two 09 latches per panel. Slide each latch −X into the fixed body keeper to lock; slide +15 mm in X to unlock.

## Access and manual operation

- **Roof removal:** retract both latches, lift the panel vertically about 100 mm through its sensor clearances, then move it forward (+Y) about 80 mm to disengage the open rear mast notch. The fixed sensor mounts stay on the body. Roof panels are independent.
- **Trays:** unplug connected leads, remove the relevant roof and lift the tray vertically. There is no closed partition between modules.
- **Ramp stow:** remove the ToF bar/cap, retract or remove latch 33, fold the outer section upward 180°, then raise the folded packet upright about its body hinge. Slide latch 33 across its side edge. Deployment reverses this sequence. Keep the ramp manually supported during movement; no actuator or automatic interlock is included.
- **Landing:** the deployed top tip reaches Z0 from the 40 mm threshold at approximately 10.47° downward. The hinge centre is Z36 so deck thickness is included. Small printed barrel/notch gaps at the root and fold are intentional. This is a demonstration surface, not a load-rated ramp.

## Plate groups and slicing estimates

PrusaSlicer 2.9.6, CORE One 0.4 standard nozzle, Generic PLA, 0.20 mm STRUCTURAL with four perimeters. Estimates include supports/brims and were read after slicing; they are not measured print times. Total for all 15 plates: **118.7 hours and 3.06 kg PLA**, including coupons. Coupon mating gauges printed separately would add a small amount.

| Plate | Part IDs and quantities | Normal-mode estimate | PLA g |
|---|---|---:|---:|
| plate_01_body | 02×1 | 19h 54m 37s | 519.57 |
| plate_02_body | 01×1 | 1d 2h 24m 49s | 660.12 |
| plate_03_body | 03×1 | 1d 3h 12m 57s | 676.90 |
| plate_04_roof | 04×1 | 5h 50m 18s | 175.44 |
| plate_05_roof | 05×1 | 5h 20m 23s | 160.25 |
| plate_06_roof | 06×1 | 5h 50m 1s | 175.44 |
| plate_07_tray | 13×1, 12×1 | 5h 59m 48s | 166.29 |
| plate_08_ramp | 29×1 | 3h 37m 17s | 93.27 |
| plate_09_ramp | 30×1 | 2h 50m 39s | 75.22 |
| plate_10_laser | 17×1, 15×1, 16×1, 18×3 | 5h 53m 13s | 145.16 |
| plate_11_camera | 22×1, 24×1, 23×1 | 2h 28m 15s | 55.60 |
| plate_12_sensor | 27×1 | 11m 26s | 4.08 |
| plate_13_hardware | 10×4, 19×3, 28×1, 25×2, 07×8, 14×8, 20×3, 11×4, 32×1 | 4h 37m 54s | 106.70 |
| plate_14_hardware | 31×1, 21×4, 26×1, 08×16, 09×6, 33×1 | 1h 6m 51s | 14.28 |
| plate_15_coupon | C01×1, C01×1, C01×1, C02×1, C02×1, C02×1, C02×1, C02×1, C03×1, C04×1, C05×1 | 1h 22m 8s | 29.48 |

Bodies print upright. Supports are necessary under elevated floors, wheel arches, roof headers and joining ledges. Roofs are outer-face down with support under their offset plate and latch guides; trays also require support beneath their raised floor. Ramp walking faces are down with support around knuckles. Laser yokes/carriers print on their sides and require support beneath discs/bridges. The mast and long hinge pins lie down; support beneath circular pins is intentional. Carefully remove support from bores, channels and teeth. These conservative automatic-support layouts prioritize successful geometry over minimum material; re-slicing after a coupon trial may reduce support usage.

Every oriented part is within 240 × 210 × 260 mm. Toolpath extrusion bounds, including support and brim, were checked against the full 250 × 220 bed. The 3MF files contain the settings; opening a raw STL alone does not load them. Re-slice if you alter any geometry, orientation, clearance, printer or material.

## Numbered parts list

Dimensions below are the oriented STL bounding boxes, not assembled dimensions.

| Part | Qty | Print X × Y × Z mm |
|---|---:|---|
| 01_body_rear | 1 | 200.0 × 180.0 × 202.0 |
| 04_roof_rear | 1 | 199.4 × 180.0 × 18.0 |
| 02_body_centre | 1 | 200.0 × 192.0 × 197.0 |
| 05_roof_centre | 1 | 199.4 × 180.0 × 18.0 |
| 03_body_front | 1 | 200.0 × 180.0 × 202.0 |
| 06_roof_front | 1 | 199.4 × 180.0 × 18.0 |
| 07_join_key | 8 | 26.0 × 10.0 × 6.4 |
| 08_key_retaining_pin | 16 | 6.0 × 6.0 × 21.0 |
| 09_roof_sliding_latch | 6 | 44.0 × 5.4 × 8.7 |
| 10_static_wheel | 4 | 64.0 × 64.0 × 11.0 |
| 11_wheel_axle | 4 | 9.0 × 9.0 × 28.0 |
| 12_breadboard_tray | 1 | 190.0 × 85.0 × 20.0 |
| 13_electronics_tray | 1 | 110.0 × 90.0 × 20.0 |
| 14_tray_adjustable_retainer | 8 | 11.0 × 9.0 × 18.0 |
| 15_L1_yoke | 1 | 77.0 × 50.0 × 42.0 |
| 16_L2_yoke | 1 | 77.0 × 50.0 × 42.0 |
| 17_L3_yoke | 1 | 99.0 × 70.0 × 42.0 |
| 18_laser_split_carrier_12p6 | 3 | 54.0 × 48.0 × 23.4 |
| 19_laser_taper_collar | 3 | 24.0 × 24.0 × 8.0 |
| 20_laser_pivot_pin | 3 | 9.0 × 9.0 × 15.0 |
| 21_mount_foot_pin | 4 | 6.0 × 6.0 × 42.0 |
| 22_camera_mast | 1 | 54.0 × 192.0 × 18.0 |
| 23_camera_forward_rail | 1 | 217.0 × 20.0 × 10.0 |
| 24_camera_platform | 1 | 56.0 × 40.0 × 13.0 |
| 25_camera_sliding_jaw | 2 | 11.0 × 20.0 × 25.0 |
| 26_camera_index_pin | 1 | 6.0 × 6.0 × 19.0 |
| 27_ToF_removable_bar | 1 | 156.0 × 19.0 × 4.0 |
| 28_ToF_retaining_cap | 1 | 26.6 × 20.0 × 8.3 |
| 29_ramp_inner | 1 | 140.0 × 126.0 × 17.0 |
| 30_ramp_outer | 1 | 140.0 × 110.0 × 13.0 |
| 31_ramp_root_pin | 1 | 7.0 × 156.0 × 7.0 |
| 32_ramp_fold_pin | 1 | 7.0 × 146.0 × 7.0 |
| 33_ramp_stow_latch | 1 | 30.0 × 3.4 × 8.0 |
| C01_joint_0p2 | 1 | 36.0 × 20.0 × 10.0 |
| C01_joint_0p3 | 1 | 36.0 × 20.0 × 10.0 |
| C01_joint_0p4 | 1 | 36.0 × 20.0 × 10.0 |
| C02_laser_bore_12 | 1 | 20.0 × 20.0 × 8.0 |
| C02_laser_bore_12p2 | 1 | 20.0 × 20.0 × 8.0 |
| C02_laser_bore_12p4 | 1 | 20.0 × 20.0 × 8.0 |
| C02_laser_bore_12p6 | 1 | 20.0 × 20.0 × 8.0 |
| C02_laser_bore_12p8 | 1 | 20.0 × 20.0 × 8.0 |
| C03_roof_latch_channel | 1 | 25.0 × 12.0 × 8.0 |
| C04_hinge_bore_4p6 | 1 | 12.0 × 12.0 × 12.0 |
| C05_short_hinge_pin | 1 | 7.0 × 7.0 × 17.0 |

## Scope

All sensor supports and mechanisms are proposed demonstrator hardware. Electronics, wiring and laser modules are supplied separately. There are no purchased fasteners, magnets, bearings, motors, baseboard, reference board or optical-ray solids in the printable set. The exterior is simplified for printing, with window recesses and static wheels. Physical fit, PLA pin fatigue, electronics cooling, optical coverage and sensor calibration still require the hardware and coupon trials.
