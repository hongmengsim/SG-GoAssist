from pathlib import Path
import configparser,json,subprocess,re,time
from check_meshes import read_stl,write_stl
import numpy as np
OUT=Path(__file__).resolve().parents[1]/'print_v5'
EXE=r'C:/Program Files/Prusa3D/PrusaSlicer/prusa-slicer-console.exe'
def configuration():
    vendor=configparser.ConfigParser(interpolation=None,strict=False);vendor.optionxform=str
    vendor.read(r'C:/Users/simho/AppData/Roaming/PrusaSlicer/vendor/PrusaResearch.ini',encoding='utf-8-sig')
    def resolve(kind,name):
        data=dict(vendor[kind+':'+name]);result={}
        for parent in data.get('inherits','').split(';'):
            if parent.strip():result.update(resolve(kind,parent.strip()))
        result.update(data);return result
    seed={}
    for line in (OUT/'coreone_pla_024_3p.ini').read_text().splitlines():
        if ' = ' in line:
            k,v=line.split(' = ',1);seed[k]=v
    for kind,name in [('printer','Prusa CORE One 0.4 nozzle'),('print','0.20mm STRUCTURAL @COREONE 0.4'),('filament','Generic PLA @COREONE')]:seed.update(resolve(kind,name))
    for k in list(seed):
        if k=='inherits' or k.startswith(('compatible_','default_')):seed.pop(k)
    seed.update(perimeters='3',layer_height='0.24',first_layer_height='0.2',brim_width='3',brim_type='outer_only',skirts='0',fill_density='10%',binary_gcode='0',support_material='0',support_material_auto='1',support_material_style='snug',support_material_buildplate_only='0',support_material_threshold='30',printer_settings_id='Prusa CORE One 0.4 nozzle',print_settings_id='Robobus v5 0.24mm 3 perimeters',filament_settings_id='Generic PLA @COREONE')
    seed['arc_fitting']='disabled'
    (OUT/'coreone_pla_024_3p.ini').write_text('\n'.join(k+' = '+v for k,v in sorted(seed.items()))+'\n')
    return seed
def pack():
    manifest=json.loads((OUT/'parts_manifest.json').read_text())['parts']
    plates=[]
    # Separate major shells; shelf packing for remaining parts with 8 mm separation.
    for group in ['body','roof','tray','laser','camera','sensor','hardware','coupon']:
        items=[]
        for rec in manifest:
            if rec['group']!=group:continue
            for q in range(rec['quantity']):
                tri=read_stl(OUT/'stl'/(rec['id']+'.stl'))
                size=tri.max(axis=(0,1))-tri.min(axis=(0,1))
                if group in ('body','roof') or (size[1]>size[0] and size[1]<230):
                    tri=tri[:,:,[1,0,2]];tri[:,:,0]*=-1
                    tri-=tri.min(axis=(0,1));size=tri.max(axis=(0,1))
                items.append((rec['id'],q+1,tri,size))
        items.sort(key=lambda i:-i[3][1])
        current=None
        for ident,q,tri,size in items:
            if current is None or current['x']+size[0]>245:
                if current is not None:current['y']+=current['row']+8;current['x']=5;current['row']=0
            if current is None or current['y']+size[1]>215:
                current={'group':group,'items':[],'x':5,'y':5,'row':0};plates.append(current)
            tri=tri+np.array([current['x'],current['y'],0])
            current['items'].append((ident,q,tri));current['x']+=size[0]+8;current['row']=max(current['row'],size[1])
    directory=OUT/'plates';directory.mkdir(exist_ok=True)
    report=[]
    for i,plate in enumerate(plates,1):
        name=f'plate_{i:02d}_{plate["group"]}'
        mesh=np.concatenate([x[2] for x in plate['items']]);path=directory/(name+'.stl');write_stl(path,mesh)
        report.append({'plate':name,'parts':[{'id':a,'copy':b} for a,b,_ in plate['items']],'bounds_min':mesh.min(axis=(0,1)).tolist(),'bounds_max':mesh.max(axis=(0,1)).tolist()})
    (OUT/'plate_manifest.json').write_text(json.dumps(report,indent=2));return report
def slice_all(plates):
    results=[]
    for plate in plates:
        name=plate['plate'];directory=OUT/'plates';gcode=directory/(name+'.gcode')
        args=[EXE,'--load',str(OUT/'coreone_pla_024_3p.ini'),'--dont-arrange','--export-gcode','--output',str(gcode),str(directory/(name+'.stl'))]
        run=subprocess.run(args,capture_output=True,text=True);(directory/(name+'.log')).write_text(run.stdout+'\n'+run.stderr)
        rec={'plate':name,'exit_code':run.returncode}
        if run.returncode==0:
            txt=gcode.read_text();rec['estimates']=[s for s in txt.splitlines() if s.startswith(('; estimated printing time','; filament used','; total filament'))]
            # G-code after layer marker, exclude startup/purge. Absolute XY and relative E profile.
            x=y=0;printing=False;points=[]
            for line in txt.splitlines():
                if line.startswith(';LAYER_CHANGE'):printing=True
                if not printing or not line.startswith(('G1 ','G0 ')):continue
                vals={k:float(v) for k,v in re.findall(r'([XYE])(-?(?:\d+(?:\.\d*)?|\.\d+))',line)}
                x=vals.get('X',x);y=vals.get('Y',y)
                if vals.get('E',0)>0 and ('X' in vals or 'Y' in vals):points.append((x,y))
            if points:
                arr=np.array(points);rec['extrusion_xy_min']=arr.min(axis=0).tolist();rec['extrusion_xy_max']=arr.max(axis=0).tolist();rec['extrusions_inside_bed']=bool(np.all(arr>=0) and np.all(arr<=np.array([250,220])))
            export=subprocess.run([EXE,'--load',str(OUT/'coreone_pla_024_3p.ini'),'--dont-arrange','--export-3mf','--output',str(directory/(name+'.3mf')),str(directory/(name+'.stl'))],capture_output=True,text=True)
            rec['project_exit_code']=export.returncode
            if export.returncode==0:
                import zipfile
                config='; generated by PrusaSlicer 2.9.6\n'+'\n'.join('; '+line for line in (OUT/'coreone_pla_024_3p.ini').read_text().splitlines())+'\n'
                with zipfile.ZipFile(directory/(name+'.3mf'),'a',zipfile.ZIP_DEFLATED) as archive:archive.writestr('Metadata/Slic3r_PE.config',config)
        results.append(rec);(OUT/'slicing_report.json').write_text(json.dumps(results,indent=2));print(json.dumps(rec),flush=True)
    return results
if __name__=='__main__':
    import sys
    if '--coarse' in sys.argv:
        import shutil
        coarse=OUT/'coarse';shutil.copyfile(OUT/'coreone_pla_024_3p.ini',coarse/'coreone_pla_024_3p.ini');OUT=coarse
    configuration();plates=pack()
    if '--prepare-only' not in sys.argv:slice_all(plates)
