from pathlib import Path
base=Path(__file__).resolve().parents[1]
s=(base/'RobobusPrint/RobobusPrint.py').read_text()
header=s[:s.index('def run(context):')].replace('print_v4','print_v5').replace('Robobus v4','Robobus v5')
(base/'RobobusLite/RobobusLite.py').write_text(header)
for name in ['check_meshes.py','slice_parts.py']:
 p=base/'RobobusLite'/name;s=p.read_text().replace('print_v4','print_v5').replace('coreone_pla_020_4p.ini','coreone_pla_024_3p.ini')
 if name=='slice_parts.py':
  s=s.replace("perimeters='4',layer_height='0.2'","perimeters='3',layer_height='0.24'").replace("fill_density='20%'","fill_density='10%'").replace("support_material='1'","support_material='0'").replace('Robobus 0.20mm STRUCTURAL 4 perimeters','Robobus v5 0.24mm 3 perimeters')
  s=s.replace("for group in ['body','roof','tray','ramp','laser','camera','sensor','hardware','coupon']:","for group in ['body','roof','tray','laser','camera','sensor','hardware','coupon']:")
 p.write_text(s)
p=base/'RobobusV2/RobobusV2.py';s=p.read_text();needle='        design=adsk.fusion.Design.cast(app.activeProduct);root=design.rootComponent'
assert needle in s
s=s.replace(needle,"        if os.path.isfile(os.path.join(OUT,'print_v5.flag')):\n            spec=importlib.util.spec_from_file_location('robobus_lite',os.path.join(OUT,'RobobusLite','RobobusLite.py'))\n            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.run(context);return\n"+needle,1);p.write_text(s)
(base/'print_v5.flag').write_text('route')
(base/'print_v5/coarse.flag').write_text('coarse budget gate')
(base/'RobobusLite/RobobusLite.manifest').write_text('{"autodeskProduct":"Fusion360","type":"script","author":"GoAssist","description":{"":"Robobus v5 compact demonstrator"},"version":"5.0.0","runOnStartup":false,"supportedOS":"windows|mac"}')
