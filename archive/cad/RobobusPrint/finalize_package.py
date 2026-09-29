from pathlib import Path
import json,zipfile,hashlib,re,py_compile
CAD=Path(__file__).resolve().parents[1];OUT=CAD/'print_v4'
# Make the builder independent of earlier revisions, retaining the tested appearance helper.
p=CAD/'RobobusPrint/RobobusPrint.py';s=p.read_text(encoding='utf-8')
if "h=importlib.util.module_from_spec(s)" in s:
    old=(CAD/'Robobus/Robobus.py').read_text(encoding='utf-8')
    helper=old[old.index('def appearance('):old.index('\ndef refine_existing(')]
    s=s.replace('def run(context):',helper+'\ndef run(context):')
    lines=s.splitlines();lines=[x for x in lines if "spec_from_file_location('print_colors'" not in x]
    s='\n'.join(lines).replace('n:h.appearance(n,rgb,','n:appearance(n,rgb,')+'\n';p.write_text(s,encoding='utf-8')
py_compile.compile(str(p),doraise=True)
# Restore the v2 runner after temporary routing through its existing Fusion UI entry.
p=CAD/'RobobusV2/RobobusV2.py';s=p.read_text(encoding='utf-8')
s=re.sub(r"        if os.path.isfile\(os.path.join\(OUT,'print_v4.flag'\)\):\n            spec=.*?\n            module=.*?return\n",'',s)
p.write_text(s,encoding='utf-8');(CAD/'print_v4.flag').unlink(missing_ok=True)
manifest=json.loads((OUT/'parts_manifest.json').read_text())['parts'];meshes=json.loads((OUT/'mesh_validation.json').read_text())
for part in manifest:
    mesh=next(m for m in meshes if m['file']==part['id']+'.stl')
    mesh['native_size_difference_mm']=max(abs(a-b) for a,b in zip(mesh['size_mm'],part['size_mm']))
    mesh['native_volume_relative_error']=abs(mesh['volume_mm3']-part['volume_mm3'])/part['volume_mm3']
    assert mesh['native_size_difference_mm']<.05 and mesh['native_volume_relative_error']<.01,part['id']
(OUT/'mesh_validation.json').write_text(json.dumps(meshes,indent=2))
readme='''# Start here — printable Robobus v4

Read `ASSEMBLY_AND_PRINT_GUIDE.md` before printing. Print the calibration plate first, plus one joining key (07) and roof latch (09) as mating gauges.

- Native model: `Robobus_v4_Printable.f3d`
- Assembled exchange model: `Robobus_v4_Assembled.step`
- Individual millimetre STLs: `stl/`
- CORE One plate projects and sliced files: `plates/`
- Quantities: `parts_list.csv`
- Check results: `VALIDATION_REPORT.md`

The bus is hollow with three roof panels and removable electronics trays. Sensor mounts stay on fixed structure. Remove the ToF bar before ramp operation. Sensor/module fit is nominal and requires coupon/hardware checks.

For CAD rebuilding, add the sibling `RobobusPrint` folder in Fusion Scripts and Add-Ins and run RobobusPrint. Each run creates a new document and refreshes this revision's exports. Existing earlier bus models are preserved.
'''
(OUT/'README.md').write_text(readme)
files=[p for p in OUT.rglob('*') if p.is_file() and p.suffix not in ('.flag','.log')]
hashes={str(p.relative_to(OUT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(OUT/'SHA256.json').write_text(json.dumps(hashes,indent=2));files.append(OUT/'SHA256.json')
dest=CAD/'Robobus_v4_Printable_Package.zip'
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'print_v4/'+str(p.relative_to(OUT)).replace('\\','/'))
    for name in ['RobobusPrint.py','RobobusPrint.manifest','check_meshes.py','slice_parts.py','package_docs.py']:
        z.write(CAD/'RobobusPrint'/name,'RobobusPrint/'+name)
with zipfile.ZipFile(dest) as z:assert z.testzip() is None
print(json.dumps({'package':str(dest),'bytes':dest.stat().st_size,'files':len(files)}))
