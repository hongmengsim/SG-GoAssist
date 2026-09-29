from pathlib import Path
import json,csv,re,zipfile,hashlib
OUT=Path(__file__).resolve().parents[1]/'print_v4'
parts=json.loads((OUT/'parts_manifest.json').read_text())['parts']
plates=json.loads((OUT/'plate_manifest.json').read_text())
slices=json.loads((OUT/'slicing_report.json').read_text())
audit=json.loads((OUT/'assembly_audit.json').read_text())
meshes=json.loads((OUT/'mesh_validation.json').read_text())
assert len(slices)==len(plates) and all(s['exit_code']==0 and s['extrusions_inside_bed'] for s in slices)
assert all(m['pass'] for m in meshes)
assert not [t for t in audit['tests'] if t['intersections']]
assert all(h['a'].startswith('18_') and h['b'].startswith('19_') for h in audit['static_intersections'])
def estimate(s,token):return next(x.split(' = ',1)[1] for x in s['estimates'] if x.startswith(token))
seconds=0;grams=0
for s in slices:
    tm=estimate(s,'; estimated printing time (normal mode)')
    seconds+=sum(float(n)*{'d':86400,'h':3600,'m':60,'s':1}[u] for n,u in re.findall(r'(\d+)([dhms])',tm))
    grams+=float(estimate(s,'; filament used [g]'))
with (OUT/'parts_list.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f);w.writerow(['Part','Quantity','Print X mm','Print Y mm','Print Z mm','Plate','Notes'])
    for p in parts:w.writerow([p['id'],p['quantity'],*[round(v,3) for v in p['size_mm']],', '.join(q['plate'] for q in plates if any(x['id']==p['id'] for x in q['parts'])),p['notes']])
rows='\n'.join('| '+p['id']+' | '+str(p['quantity'])+' | '+' × '.join(f'{x:.1f}' for x in p['size_mm'])+' |' for p in parts)
plate_rows='\n'.join('| '+p['plate']+' | '+', '.join(x['id'].split('_')[0]+('×'+str(sum(y['id']==x['id'] for y in p['parts']))) for i,x in enumerate(p['parts']) if not any(y['id']==x['id'] for y in p['parts'][:i]))+' | '+estimate(s,'; estimated printing time (normal mode)')+' | '+estimate(s,'; filament used [g]')+' |' for p,s in zip(plates,slices))
guide=f'''# Robobus v4 — printable electronics demonstrator

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

PrusaSlicer 2.9.6, CORE One 0.4 standard nozzle, Generic PLA, 0.20 mm STRUCTURAL with four perimeters. Estimates include supports/brims and were read after slicing; they are not measured print times. Total for all 15 plates: **{seconds/3600:.1f} hours and {grams/1000:.2f} kg PLA**, including coupons. Coupon mating gauges printed separately would add a small amount.

| Plate | Part IDs and quantities | Normal-mode estimate | PLA g |
|---|---|---:|---:|
{plate_rows}

Bodies print upright. Supports are necessary under elevated floors, wheel arches, roof headers and joining ledges. Roofs are outer-face down with support under their offset plate and latch guides; trays also require support beneath their raised floor. Ramp walking faces are down with support around knuckles. Laser yokes/carriers print on their sides and require support beneath discs/bridges. The mast and long hinge pins lie down; support beneath circular pins is intentional. Carefully remove support from bores, channels and teeth. These conservative automatic-support layouts prioritize successful geometry over minimum material; re-slicing after a coupon trial may reduce support usage.

Every oriented part is within 240 × 210 × 260 mm. Toolpath extrusion bounds, including support and brim, were checked against the full 250 × 220 bed. The 3MF files contain the settings; opening a raw STL alone does not load them. Re-slice if you alter any geometry, orientation, clearance, printer or material.

## Numbered parts list

Dimensions below are the oriented STL bounding boxes, not assembled dimensions.

| Part | Qty | Print X × Y × Z mm |
|---|---:|---|
{rows}

## Scope

All sensor supports and mechanisms are proposed demonstrator hardware. Electronics, wiring and laser modules are supplied separately. There are no purchased fasteners, magnets, bearings, motors, baseboard, reference board or optical-ray solids in the printable set. The exterior is simplified for printing, with window recesses and static wheels. Physical fit, PLA pin fatigue, electronics cooling, optical coverage and sensor calibration still require the hardware and coupon trials.
'''
(OUT/'ASSEMBLY_AND_PRINT_GUIDE.md').write_text(guide,encoding='utf-8')
report=f'''# Validation report — Robobus v4

## Geometry

- 44 unique STL files; {sum(p['quantity'] for p in parts)} total copies including coupons.
- All 44 passed: closed two-manifold edges, consistent winding, one connected component, positive signed volume, no degenerate triangles, millimetre scale and reserved print envelope.
- Fusion native solids: one connected solid per part; no failed timeline features reported on export.
- Earlier revisions preserved. Reference graphics/baseboard excluded.

## Assembly and motion

Native Fusion BRep intersections were evaluated on {audit['body_count']} assembled part instances and {len(audit['tests'])} sampled extraction/motion configurations.

- No unintended positive-volume static intersections remain.
- Three intentional collar/split-sleeve overlaps remain, approximately {audit['static_intersections'][0]['mm3']:.2f} mm³ each. They represent elastic clamping; physical behavior is unverified.
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
- Estimated total: {seconds/3600:.2f} hours normal mode; {grams:.2f} g PLA, including coupon plate. Times/material derive from sliced G-code only.

## Remaining physical checks

Print coupons before large parts. Confirm barrel diameter, clamp friction, printed tooth engagement, removable pin flex, roof latch fit, tray retention, real camera/ToF fit and cable routing. No structural certification or verified optical coverage is claimed.
'''
(OUT/'VALIDATION_REPORT.md').write_text(report,encoding='utf-8')
print(json.dumps({'unique_parts':len(parts),'copies':sum(p['quantity'] for p in parts),'plates':len(plates),'hours':seconds/3600,'grams':grams,'motion_checks':len(audit['tests'])}))

