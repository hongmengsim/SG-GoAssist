"""Package verified v5 exports; never modifies previous revisions."""
from pathlib import Path
import csv, json, re, zipfile, hashlib
from collections import Counter

OUT=Path(__file__).resolve().parents[1]/'print_v5'
parts=json.loads((OUT/'parts_manifest.json').read_text())
meshes=json.loads((OUT/'mesh_validation.json').read_text())
audit=json.loads((OUT/'assembly_audit.json').read_text())
plates=json.loads((OUT/'plate_manifest.json').read_text())
slices=json.loads((OUT/'slicing_report.json').read_text())
assert len(meshes)==len(parts['parts']) and all(m['pass'] for m in meshes)
assert not parts['invalid'] and not parts['feature_warnings']
assert not any(t['hits'] for t in audit['tests'])
assert all(h['a'].startswith('18_laser_carrier:') and h['b'].startswith('19_laser_collar:') for h in audit['static_intersections'])
expected=Counter({p['id']:p['quantity'] for p in parts['parts']})
actual=Counter(p['id'] for plate in plates for p in plate['parts'])
assert expected==actual
for p,m in zip(sorted(parts['parts'],key=lambda x:x['id']),sorted(meshes,key=lambda x:x['file'])):
    assert max(abs(a-b) for a,b in zip(p['size_mm'],m['size_mm']))<.02
    assert abs(m['volume_mm3']/p['volume_mm3']-1)<.01

def duration(seconds):
    return f'{seconds//3600}h {(seconds%3600)//60:02d}m {seconds%60:02d}s'

rows=[]
for r in slices:
    assert r['exit_code']==r['project_exit_code']==0 and r['extrusions_inside_bed']
    txt='\n'.join(r['estimates'])
    grams=float(re.search(r'^; total filament used \[g\] = ([\d.]+)$',txt,re.M)[1])
    time=re.search(r'normal mode\) = (.*)',txt)[1]
    seconds=sum(int(v)*{'h':3600,'m':60,'s':1}[u] for v,u in re.findall(r'(\d+)([hms])',time))
    log=(OUT/'plates'/(r['plate']+'.log')).read_text()
    assert 'print warning:' not in log,log
    rows.append({'plate':r['plate'],'grams':grams,'seconds':seconds,'normal_mode':duration(seconds),'xy_min_mm':r['extrusion_xy_min'],'xy_max_mm':r['extrusion_xy_max']})
g=round(sum(r['grams'] for r in rows),2);seconds=sum(r['seconds'] for r in rows)
assert g<=500 and seconds<=24*3600
report={'slicer':'PrusaSlicer 2.9.6','printer':'Prusa CORE One 0.4 nozzle','PLA_density_g_cm3':1.24,'layer_mm':.24,'perimeters':3,'infill_percent':10,'support_material':False,'brim_mm':3,'plates':rows,'total_grams':g,'total_seconds':seconds,'total_normal_mode':duration(seconds),'hard_limit_pass':True,'target_pass':g<=450 and seconds<=20*3600,'printed_quantity':sum(expected.values()),'unique_STLs':len(meshes),'note':'Slicer estimates, including all quantities, coupons and generated brims. No supports generated. Setup, cooling, assembly, failed prints and extra calibration repeats are not included.'}
(OUT/'budget_report.json').write_text(json.dumps(report,indent=2))
with (OUT/'parts_list.csv').open('w',newline='',encoding='utf-8-sig') as f:
    writer=csv.writer(f);writer.writerow(['Part','Quantity','Plate','Print X mm','Print Y mm','Print Z mm','Notes'])
    for p in sorted(parts['parts'],key=lambda p:p['id']):
        plate=next(pl['plate'] for pl in plates if any(q['id']==p['id'] for q in pl['parts']))
        writer.writerow([p['id'],p['quantity'],plate,*[round(x,3) for x in p['size_mm']],p['notes']])
table='\n'.join(f"| {r['plate']} | {r['grams']:.2f} | {r['normal_mode']} |" for r in rows)
guide=f'''# Robobus v5 — assembly and print guide

## Release result

**{g:.2f} g PLA; {duration(seconds)} total normal-mode slicer estimate.** All {sum(expected.values())} printed pieces, including calibration pieces and generated brims, are counted across eight plates. Both the 450 g / 20-hour target and the 500 g / 24-hour limits pass. These are slicer estimates, not guaranteed elapsed physical print times.

| Plate | PLA g | Normal-mode estimate |
|---|---:|---:|
{table}
| **TOTAL** | **{g:.2f}** | **{duration(seconds)}** |

The coarse enclosure study was sliced before detailed fixtures: 268.67 g / 8h 41m 51s. It is a design study and is **not** an additional set to print. The final totals above replace that study.

## What changed

- Nominal body: 300 × 110 × 125 mm above the tabletop; two 150 mm halves. Thin wheel discs, pin heads and clips project outside the nominal body width. Sensor structure reaches the 220 mm camera benchmark.
- Hollow connected bay, 1.4 mm walls, 1.8 mm floors, 1.2 mm roof skins. Floor underside is Z18.2; the separately printed wheels establish tabletop Z0. Body floors print directly on the bed.
- Two roofs, three floor joining keys, four removable roof clips. Continuous sloping socket braces and separate dovetail laser adapters avoid support-dependent steps.
- Open 80 × 100 mm doorway: X−40…40, Z20…120. No ramp, ramp hardware or moving door parts exist in this revision.
- Exterior deliberately simplified to the body silhouette, doorway and four wheels to reduce printing. No glazing or thick window backing.
- Two rounded rear cable ports, nominal 20 × 12 mm, and ventilation slots. Keep wiring clear of the centre joining pockets and roof clips.

## Files

- `Robobus_v5_Printable.f3d`: native Fusion assembly with separately editable solid components and base features. Open with Fusion's Open from Computer command. The dimensions in the parameter table are benchmarks; the base-feature geometry does not automatically regenerate when those values change. The supplied builder is the reproducible dimension-editing source.
- `Robobus_v5_Assembled.step`: assembled CAD exchange model of the bus. Calibration samples are hidden components in the Fusion archive and are omitted from the STEP export.
- `stl/`: {len(meshes)} individual part types, millimetres, already oriented for printing. Print the quantities in `parts_list.csv`.
- `plates/`: eight configured CORE One 3MF projects and matching quantity-correct plate meshes. **Print each plate once**, not both plate meshes and individual STLs. Re-slice the 3MF project to produce printer G-code.
- `assembled.png`, `roof_access.png`, `exploded.png`: native Fusion previews.
- `mesh_validation.json`, `assembly_audit.json`, `budget_report.json`, `plate_manifest.json`: detailed evidence.

## Printer settings and orientation

Prusa CORE One, 0.4 mm nozzle, Generic PLA (1.24 g/cm³), 0.24 mm layers, 0.20 mm first layer, three perimeters, 10% infill, supports off. The projects embed the flattened installed official CORE One profile plus these overrides. The layer setting is a v5 custom profile, not a stock named 0.24 preset.

Three-millimetre outer brims are included conservatively for thin shell edges and small fixture footprints. They are already in the budget; remove them carefully from mating edges. The two body halves stand upright on their floors. Roof outer faces lie down with skirts upward. Trays and wheels lie flat. Laser yokes, pivot adapters and the L-shaped camera mast lie on their broad faces. Laser sleeves stand aperture-down. Camera platform stands on its rail-channel end. Keep the supplied orientations.

All individual oriented parts fit 240 × 210 × 260 mm. Final extrusion paths, including brims, fit the 250 × 220 mm bed. The designs use small holes, short bridges and continuous 45° braces; no supports are generated. Physical surface quality and fit still require the calibration prints.

## Calibration first

1. Print plate 08. The three C01 key pockets test 0.2 / 0.3 / 0.4 mm clearance per face. Trial-fit an actual 05 joining key from plate 07; the bus currently uses 0.3 mm.
2. Test the five C02 rings against the actual laser barrel: 12.0 / 12.2 / 12.4 / 12.6 / 12.8 mm. The supplied split sleeve uses a 12.6 mm bore for nominal Ø12 × 30 mm hardware.
3. C03 discs test the 4.6 mm pivot bore with a 20 pivot pin. Use one disc with the actual 1.7 mm adapter face for the representative clamp stack, or test the actual yoke and adapter directly. Do not stack the two 3 mm coupon discs as a substitute for that stack; the second is a spare bore sample.
4. Trial the printed clamp, roof clip and one sleeve before committing to the shell print. If fit changes require reprints or geometry changes, re-slice and update the totals; extra prints are not part of this released set.

## Assembly order

1. Clean brim edges. Bring body halves 01/02 together on a flat surface. Their interiors remain connected. Drop three 05 keys into the floor pockets from above (rear-wall, centre and doorway-side pockets). Keys are removable; do not glue them.
2. Fit four 08 wheel discs over their short 09 pins. Push the split pins through the reinforced wheel holes until their retainers engage. Wheels are static display parts, not a rolling suspension.
3. Lower 10 breadboard tray and 11 controller tray onto the internal feet. The breadboard tray is 175 × 65 mm, intended for a nominal 165 × 55 mm board; the controller tray is 110 × 90 mm mounting allowance. Slide the eight 12 retainers into appropriate edge notches. Check actual board edges and connector access before pressing retainers home.
4. Both tray mounting surfaces are Z25.2. Keep the reserved 60 mm vertical component/wire envelope clear. Lift trays vertically after the roofs are removed; disconnect leads first. Run cables to the rear ports without crossing joining keys.
5. Seat fixed header 07 in the two doorway-jamb sockets. Seat L1/L2 yokes 15/16 in the body sockets and L3 yoke 17 in the header. Secure them with three 22 mount pins. The fourth 22 pin secures camera mast 23 in its socket at the body seam. All sensor supports attach to fixed body structure.
6. Slide each 18 sleeve's dovetail into adapter 13. Insert the nominal laser so its emitting aperture is flush with the sleeve's front datum. Fit 19 tapered collar over the split rear end to grip the barrel. The CAD collar intentionally overlaps the uncompressed sleeve; seat only as far as the physical fit permits. Rotation of the barrel sets the projected line orientation.
7. Place adapter 13 against its yoke, insert 20 pivot pin from the outside and engage 21 wedge in its radial slot. Align the pin slot with the sleeve's crosswise direction so the wedge clears the dovetail. The pin tip stays outside the optical bore. Loosen the wedge before changing tilt; align using C04 angle gauge, then seat the wedge gently to hold friction. Defaults: L1/L2 60° down, L3 45° down. Marks cover 40–85° in 5° steps; this is a manually set friction clamp, not an indexed toothed mechanism.
8. Slide camera platform 24 onto mast rail 23 from its open end. Use jaws 25 for the actual camera and pin 26 at the selected Y index. Default optical benchmark Y+10. Indices are Y−30, −20, −10, 0, +10 mm. Platform top is Z214.3; the actual optical centre must be positioned 5.7 mm above it to meet Z220. Actual camera dimensions and lens field of view remain unverified.
9. For sensing demonstrations, attach ToF bar 27 using jamb clips 29 and cap 28. Set the actual sensor's optical centre to (0,0,75). **This removable bar obstructs the doorway**; remove it when demonstrating an open passage.
10. Lower roofs 03/04 onto their skirts. Fit two 06 clips through each roof's rear slots and hook them below the body keepers. For access, release and remove the clips, lift each roof **70 mm vertically**, then slide the rear roof toward −X or front roof toward +X. This clears the fixed sensors and stays below the camera rail. Reverse to replace. Avoid simply lifting the roof into the camera rail.

## Sensor benchmarks

Coordinates: doorway centre X0, entrance face Y0, tabletop Z0; body interior extends toward negative Y. Laser pivot datums coincide with their nominal apertures.

| Benchmark | X mm | Y mm | Z mm |
|---|---:|---:|---:|
| L1 aperture | −70 | 0 | 155 |
| L2 aperture | +70 | 0 | 155 |
| L3 aperture | 0 | +10 | 170 |
| ToF optical centre | 0 | 0 | 75 |
| Camera optical centre, default | 0 | +10 | 220 |

These are demonstrator design datums, not verified OEM hardware locations. Laser size, sensor fit and camera coverage require the actual hardware. No wiring, control software or accessibility/structural certification is included.

## Validation

- {len(meshes)} / {len(meshes)} STLs: closed edge-manifold meshes, consistent winding, one connected component, no degenerate triangles, positive volume and reserved-envelope fit.
- STL dimensions agree with native millimetre dimensions within 0.02 mm; mesh volumes agree with native solids within 1% tessellation tolerance.
- Native solids: no invalid bodies or failed timeline features.
- {len(audit['tests'])} sampled CAD motion/envelope checks pass: roof lift and outward withdrawal, tray lift, laser angles every 5°, camera Y positions and electronics clearance volumes.
- The only static intersections are three deliberate elastic sleeve/collar compression regions. No other solid-to-solid interference remains in the assembled concept.
- Roof removal is checked with sensor carriers, collars and camera hardware present. Clips are removed first. CAD checks are sampled rigid geometry checks; they do not prove printed flexure life, friction strength or fit.
- Plate quantities match the parts list. All eight complete sliced plates pass material, normal-mode time and bed-boundary checks. All eight final 3MF projects were opened and sliced in the PrusaSlicer interface; top-view toolpaths and brim separation were inspected. GUI material totals agree with the reports, and no support/stability warnings remain. Screenshots are in `previews/`.

v4 files are preserved. No application code or public APIs were changed for this revision.
'''
(OUT/'ASSEMBLY_AND_PRINT_GUIDE.md').write_text(guide,encoding='utf-8')
(OUT/'VALIDATION_REPORT.md').write_text('# Robobus v5 validation\n\n'+guide.split('## Validation\n\n')[1]+'\n\n## Budget\n\n| Plate | PLA g | Normal-mode estimate |\n|---|---:|---:|\n'+table+f'\n\nTotal: **{g:.2f} g / {duration(seconds)}**. Complete set, normal mode.\n',encoding='utf-8')
source=OUT/'builder';source.mkdir(exist_ok=True)
for name in ('RobobusLite.py','RobobusLite.manifest','check_meshes.py','slice_parts.py'):
    (source/name).write_bytes((Path(__file__).parent/name).read_bytes())
# Keep geometry and configured projects; omit bulky intermediate G-code and coarse study.
files=[p for p in OUT.rglob('*') if p.is_file() and not any(x in p.parts for x in ('coarse','__pycache__')) and p.suffix not in ('.gcode','.log','.zip') and p.name!='SHA256.json']
hashes={str(p.relative_to(OUT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(OUT/'SHA256.json').write_text(json.dumps(hashes,indent=2))
with zipfile.ZipFile(OUT/'Robobus_v5_Print_Package.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for p in files+[OUT/'SHA256.json']:archive.write(p,p.relative_to(OUT))
print(json.dumps(report,indent=2))
