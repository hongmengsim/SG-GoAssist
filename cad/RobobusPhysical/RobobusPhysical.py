"""Fusion physical-setup revision. Run through Fusion Scripts and Add-Ins.
Source: APAS_Three_Laser_Physical_Setup.pdf pp4-5. Units mm.
"""
import adsk.core, adsk.fusion, math, os, json, traceback, importlib.util
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def run(context):
    app=adsk.core.Application.get()
    try:
        active=adsk.fusion.Design.cast(app.activeProduct)
        if active and active.rootComponent.attributes.itemByName('APAS','Benchmarks'):
            finish_existing(app,active);return
        doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        doc.name='Robobus v3 - APAS physical setup and optical benchmarks'
        d=adsk.fusion.Design.cast(app.activeProduct)
        d.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType
        root=d.rootComponent
        h=load('physical_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
        v=load('physical_parameters',os.path.join(OUT,'RobobusV2','RobobusV2.py'))
        h.app=app;h.design=d;h.root=root;v.app=app;v.design=d;v.root=root;v.h=h
        pt=h.point
        values={'boardLength':1000,'boardWidth':900,'boardThickness':10,'busLength':600,'busWidth':180,'busHeight':220,'wallThickness':4,'doorWidth':160,'doorHeight':160,'floorHeight':40,'rampWidth':140,'rampLength':220,'rampThickness':4,'zoneWidth':220,'zoneDepth':300,'referenceDistance':450,'referenceWidth':300,'referenceHeight':280,'cameraX':0,'cameraY':-60,'cameraHeight':400,'laserSideHeight':260,'laserFarY':20,'laserFarHeight':280,'tofHeight':140}
        for n,x in values.items():d.userParameters.add(n,adsk.core.ValueInput.createByString(str(x)+' mm'),'mm','Physical setup pp4-5; nominal prototype benchmark')
        d.userParameters.add('tofNominalFov',adsk.core.ValueInput.createByString('25 deg'),'deg','Source nominal FoV; illustrative, not validated coverage')
        d.userParameters.add('cameraStartTilt',adsk.core.ValueInput.createByString('60 deg'),'deg','Source approximate starting tilt; actual lens unspecified')
        colors={n:h.appearance(n,rgb,['Paint - Enamel Glossy (Yellow)','Plastic - Matte (Black)','Aluminum - Satin']) for n,rgb in [('Bus purple',(105,60,162)),('Dark windows',(24,33,43)),('Matte base',(214,202,180)),('Ramp grey',(135,144,153)),('Laser red',(210,40,60)),('ToF green',(12,145,117)),('Camera blue',(35,102,185)),('White target',(238,240,236)),('Datum gold',(228,158,26))]}
        components=[];dims={};datums={}
        def comp(name):
            o=v.component(name,True);components.append(o);return o
        def rect(o,n,axis,offset,u,wcoord,w,height,depth,color):return v.rect(o,n,axis,str(offset),str(u),str(wcoord),str(w),str(height),str(depth),colors[color])
        def box(o,n,b,color):return v.box(o,n,b,colors[color])
        def rod(o,n,a,b,r,color):
            bf=o.component.features.baseFeatures.add();bf.name=n;bf.startEdit()
            t=adsk.fusion.TemporaryBRepManager.get().createCylinderOrCone(pt(*a),r/10,pt(*b),r/10)
            body=o.component.bRepBodies.add(t,bf);body.name=n;body.appearance=colors[color];bf.finishEdit();return body
        def datum(o,name,p):
            sk=o.component.sketches.add(o.component.xYConstructionPlane);sk.name=name
            sk.sketchPoints.add(pt(*p));sk.isVisible=True;datums[name]=list(p);return sk
        def wire(o,name,segments):
            sk=o.component.sketches.add(o.component.xYConstructionPlane);sk.name=name
            for a,b in segments:sk.sketchCurves.sketchLines.addByTwoPoints(pt(*a),pt(*b))
            sk.isVisible=True;return sk
        def label(o,name,x,y,text,size=10):
            h.root=o.component;sk,sign=h.plane_sketch('z',0.6,name)
            inp=sk.sketchTexts.createInput2(text,size/10)
            inp.setAsMultiLine(pt(x,y,0),pt(x+370,y+22,0),adsk.core.HorizontalAlignments.LeftHorizontalAlignment,adsk.core.VerticalAlignments.MiddleVerticalAlignment,0)
            sk.sketchTexts.add(inp);sk.isVisible=True;return sk
        board=comp('00 BASEBOARD - 1000 x 900 - top datum Z0')
        b=rect(board,'Baseboard - selected 10 mm from 9-12 range','z','-boardThickness',-500,-300,'boardLength','boardWidth','boardThickness','Matte base');dims['baseboard']=b
        bus=comp('01 BUS envelope - 600 x 180 x 220 - front +X')
        rect(bus,'Floor upper surface Z40','z','floorHeight-wallThickness','-busLength/2','-busWidth','busLength','busWidth','wallThickness','Ramp grey')
        for x,n in [('-busLength/2','Rear'),('busLength/2-wallThickness','Front')]:rect(bus,n+' bulkhead','x',x,'-busWidth','floorHeight','busWidth','busHeight-floorHeight-wallThickness','wallThickness','Bus purple')
        rect(bus,'Opposite side','y','-busWidth','-busLength/2','floorHeight','busLength','busHeight-floorHeight-wallThickness','wallThickness','Bus purple')
        for x,n in [('-busLength/2','Rear jamb panel'),('doorWidth/2','Front jamb panel')]:rect(bus,n,'y','-wallThickness',x,'floorHeight','(busLength-doorWidth)/2','busHeight-floorHeight-wallThickness','wallThickness','Bus purple')
        rect(bus,'Door header - clear top Z200','y','-wallThickness','-doorWidth/2','floorHeight+doorHeight','doorWidth','busHeight-floorHeight-doorHeight-wallThickness','wallThickness','Bus purple')
        roof=comp('02 ROOF - separately hideable - electronics access')
        rect(roof,'Removable roof - top Z220','z','busHeight-wallThickness','-busLength/2','-busWidth','busLength','busWidth','wallThickness','Bus purple')
        for x in [-295,85]:box(bus,'Window - illustrative',(x,-1,100,x+210,0,194),'Dark windows')
        box(bus,'Front windscreen',(299,-165,105,300,-15,198),'Dark windows')
        for x in [-210,210]:
            for y in [-180,-12]:v.cyl(bus,'Wheel - inside stated bus envelope','y',y,x,32,32,12,colors['Dark windows'])
        ramp=comp('03 RAMP - 220 x 140 x 4 - tapered tip - deployed')
        reach=math.sqrt(220**2-40**2);drop=4*220/reach
        h.root=ramp.component
        rb=h.polygon('x',-70,[(0,40),(reach,0),(reach-22,0),(0,40-drop)],140,'Deployed ramp - upper length 220',colors['Ramp grey']);dims['ramp']=rb
        zone=comp('04 LASER footprint benchmarks - reference geometry not hardware')
        for x in [-110,110]:box(zone,'Side line X'+str(x)+' Y20 to300',(x-0.6,20,0.1,x+0.6,300,0.3),'Laser red')
        box(zone,'Far line Y300 X-110 to110',(-110,299.4,0.1,110,300.6,0.3),'Laser red')
        target=comp('05 MATTE REFERENCE board - face Y450 - 300 x 280')
        tb=rect(target,'Reference face Y450; thickness 4 estimated','y','referenceDistance','-referenceWidth/2',0,'referenceWidth','referenceHeight',4,'White target');dims['reference']=tb
        for x in [-135,120]:box(target,'Reference board support foot',(x,425,0,x+15,485,8),'Ramp grey')
        datum(target,'Reference optical target (0,450,140)',(0,450,140))
        sensors=comp('06 OPTICAL centres - hardware sizes estimated - removable demo mounts')
        source=[('L1',(-110,0,260),(0,.5,-math.sqrt(3)/2),6,30,'Laser red'),('L2',(110,0,260),(0,.5,-math.sqrt(3)/2),6,30,'Laser red'),('L3',(0,20,280),(0,math.sqrt(.5),-math.sqrt(.5)),6,30,'Laser red'),('Camera',(0,-60,400),(0,.5,-math.sqrt(3)/2),10,24,'Camera blue'),('ToF',(0,0,140),(0,1,0),5,8,'ToF green')]
        for n,p,axis,r,length,color in source:
            datum(sensors,n+' optical centre '+str(p),p)
            back=tuple(p[i]-axis[i]*length for i in range(3))
            rod(sensors,n+' housing allowance - ESTIMATED',back,p,r,color)
            # Lens face terminates exactly at the source optical-centre coordinates.
            rod(sensors,n+' aperture',tuple(p[i]-axis[i]*.6 for i in range(3)),p,r*.65,'Dark windows')
        mounts=comp('07 ADJUSTABLE MOUNT allowances - proposed - no fixing hole specification')
        for x in [-110,110]:
            box(mounts,'Laser side stanchion',(x-5,-25,220,x+5,-15,290),'Ramp grey')
            box(mounts,'Laser mounting foot',(x-15,-40,220,x+15,-10,224),'Ramp grey')
        box(mounts,'L3 stanchion',(-5,-35,220,5,-25,306),'Ramp grey')
        box(mounts,'L3 cantilever',(-5,-30,298,5,8,304),'Ramp grey')
        box(mounts,'Camera raised post',(14,-90,220,22,-82,422),'Camera blue')
        box(mounts,'Camera top arm',(-12,-90,418,22,-70,424),'Camera blue')
        box(mounts,'ToF removable test crossbar',(-80,-14,129,80,-8,134),'ToF green')
        optics=comp('08 OPTICAL RAYS - nominal and required coverage - hide independently')
        for n,p,axis,r,length,col in source[:3]:
            ends=[(p[0],20,0),(p[0],300,0)] if n!='L3' else [(-110,300,0),(110,300,0)]
            wire(optics,n+' required line fan - verify actual module fan',[(p,t) for t in ends]+[(ends[0],ends[1])])
        cam=(0,-60,400)
        corners=[(-110,0,0),(110,0,0),(110,300,0),(-110,300,0)]
        wire(optics,'CAMERA required zone sightlines - NOT measured lens FoV',[(cam,p) for p in corners])
        wire(optics,'CAMERA 60deg centre ray - ground Y170.94',[(cam,(0,-60+400/math.sqrt(3),0))])
        wire(optics,'CAMERA target Y200 - requires 56.98deg tilt',[(cam,(0,200,0))])
        rad=450*math.tan(math.radians(12.5));segments=[((0,0,140),(0,450,140))]
        circle=[(rad*math.cos(i*math.pi/18),450,140+rad*math.sin(i*math.pi/18)) for i in range(36)]
        segments += [(circle[i],circle[(i+1)%36]) for i in range(36)]
        segments += [((0,0,140),circle[i]) for i in range(0,36,9)]
        wire(optics,'ToF nominal 25deg cone - width199.53 at450 - not whole zone',segments)
        marks=comp('09 DISTANCE and HEIGHT benchmarks - sketches - reference only')
        for y in [0,100,200,300,450]:
            wire(marks,'Distance Y'+str(y),[((180,y,0.5),(240,y,0.5)),((210,y-3,.5),(210,y+3,.5))])
            label(marks,'Distance label '+str(y),245,y-10,'Y '+str(y)+' mm',8)
        wire(marks,'450 mm reference ruler', [((210,0,.5),(210,450,.5))])
        for z in [0,40,140,220,260,280,400]:
            wire(marks,'Height Z'+str(z),[((-360,-60,z),(-330,-60,z))])
        wire(marks,'Height ruler Z0 to400', [((-345,-60,0),(-345,-60,400))])
        label(marks,'Title',-440,540,'APAS / PHYSICAL SETUP v3',15)
        label(marks,'Coordinates',-440,505,'Origin: door centre / baseboard top',9)
        label(marks,'Datum axes',-440,475,'+X front   +Y boarding   Z upward',9)
        label(marks,'Envelope',-440,-265,'BUS 600 x 180 x 220 / BASE 1000 x 900',10)
        label(marks,'Benchmarks',-440,-235,'Z: floor40 / ToF140 / L1,L2 260 / L3 280 / camera400',8)
        obstacle=comp('10 TEST OBSTACLE - 150 x 180 - hidden for clear reference state')
        box(obstacle,'Obstacle 150 W x 180 H; 12 thick estimated',(-75,350,0,75,362,180),'Datum gold')
        box(obstacle,'Obstacle stable foot',(-85,330,0,85,390,6),'Datum gold');obstacle.isLightBulbOn=False
        # Hide feature sketches, retaining only measurement and optical sketches.
        for o in components:
            o.component.constructionPlanes.isLightBulbOn=False
            if o not in [sensors,optics,marks,target]:o.component.sketches.isLightBulbOn=False
        for sk in sensors.component.sketches:sk.isVisible='optical centre' in sk.name
        for sk in target.component.sketches:sk.isVisible='optical target' in sk.name
        report={'source':'output/pdf/APAS_Three_Laser_Physical_Setup.pdf pages 4-5','coordinate_system':'Door centre at baseboard level; +X front, +Y outward, +Z up. Board coordinates = (X+500,Y+300,Z).','parameters_mm':values,'optical_centres_mm':datums,'measured_body_bbox_mm':{},'ramp_horizontal_reach_mm':reach,'ramp_slope_deg':math.degrees(math.asin(40/220)),'tof_nominal_width_at_450_mm':2*rad,'tof_nominal_vertical_interval_at_450_mm':[140-rad,140+rad],'camera_60deg_ground_y_mm':-60+400/math.sqrt(3),'camera_tilt_to_y200_deg':math.degrees(math.atan2(400,260)),'laser_sides_required_fan_deg':math.degrees(math.atan2(260,20)-math.atan2(260,300)),'laser_sides_symmetric_fan_at_60deg_min':2*max(abs(60-math.degrees(math.atan2(260,20))),abs(60-math.degrees(math.atan2(260,300)))),'laser_far_required_fan_deg':2*math.degrees(math.atan2(110,math.hypot(280,280))),'invalid_bodies':[],'feature_warnings':[],'solid_count':0,'limitations':['Hardware envelopes and mounts are estimated; actual camera lens FoV and laser fan angle are unspecified.','Removable ToF crossbar occupies doorway; this is a static sensing demonstrator, not a boarding-clearance configuration.','Optical rays and height marks are sketches; STEP exports do not retain them.','Nominal envelope revision follows tabletop source, not a uniform scale model of full-size v2.','Primary rectangular envelopes are native parameter-driven features; rays, mounts and ramp taper are nominal geometry. Regenerate the setup after changing optical parameters.']}
        for n,b in dims.items():
            bb=b.boundingBox;report['measured_body_bbox_mm'][n]={'min':[bb.minPoint.x*10,bb.minPoint.y*10,bb.minPoint.z*10],'max':[bb.maxPoint.x*10,bb.maxPoint.y*10,bb.maxPoint.z*10]}
        for o in components:
            for b in o.component.bRepBodies:
                report['solid_count']+=1
                if not b.isSolid:report['invalid_bodies'].append(o.name+'/'+b.name)
        for i in range(d.timeline.count):
            ent=d.timeline.item(i).entity
            if hasattr(ent,'healthState') and ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
        if report['invalid_bodies'] or report['feature_warnings']:raise RuntimeError(json.dumps(report))
        root.attributes.add('APAS','Source','Physical Setup PDF pp4-5; dimensions in mm; conceptual fixtures')
        root.attributes.add('APAS','Benchmarks',json.dumps(report))
        def view(name,eye,target,up):
            camera=app.activeViewport.camera;camera.cameraType=adsk.core.CameraTypes.OrthographicCameraType;camera.eye=pt(*eye);camera.target=pt(*target);camera.upVector=adsk.core.Vector3D.create(*up);camera.isFitView=True;app.activeViewport.camera=camera;app.activeViewport.refresh();adsk.doEvents();app.activeViewport.saveAsImageFile(os.path.join(OUT,'APAS_Robobus_v3_'+name+'.png'),1800,1200)
        view('overview',(1100,1500,1000),(0,130,120),(0,0,1))
        view('top',(0,150,1800),(0,150,0),(0,1,0))
        view('heights',(1500,170,220),(0,170,220),(0,0,1))
        view('overview',(1100,1500,1000),(0,130,120),(0,0,1))
        export=d.exportManager
        export.execute(export.createFusionArchiveExportOptions(os.path.join(OUT,'APAS_Robobus_v3_Physical_Setup.f3d')))
        export.execute(export.createSTEPExportOptions(os.path.join(OUT,'APAS_Robobus_v3_Physical_Setup.step'),root))
        with open(os.path.join(OUT,'v3_physical_report.json'),'w') as f:json.dump(report,f,indent=2)
        with open(os.path.join(OUT,'v3_build.log'),'a') as f:f.write('SUCCESS: physical setup exported; '+str(report['solid_count'])+' valid solids\n')
        finish_existing(app,d)
    except:
        s=traceback.format_exc()
        with open(os.path.join(OUT,'v3_build.log'),'a') as f:f.write(s+'\n')
        app.userInterface.messageBox(s,'APAS physical setup needs attention')

def finish_existing(app,d):
    root=d.rootComponent
    h=load('finish_helpers',os.path.join(OUT,'Robobus','Robobus.py'));h.app=app;h.design=d
    pt=h.point
    report=json.load(open(os.path.join(OUT,'v3_physical_report.json')))
    marks=next(o for o in root.occurrences if o.component.name.startswith('09'))
    if not root.attributes.itemByName('APAS','SightlineChecked'):
        h.root=marks.component
        sk,sign=h.plane_sketch('x',325,'HEIGHT LABELS - right view')
        for z,t in [(0,'Z0 BASE'),(40,'Z40 FLOOR'),(140,'Z140 ToF'),(220,'Z220 ROOF'),(260,'Z260 L1 / L2'),(280,'Z280 L3'),(400,'Z400 CAMERA')]:
            p=h.map_point(sk,'x',325,-290,z+2);q=h.map_point(sk,'x',325,-190,z+13)
            inp=sk.sketchTexts.createInput2(t,0.8)
            inp.setAsMultiLine(p,q,adsk.core.HorizontalAlignments.LeftHorizontalAlignment,adsk.core.VerticalAlignments.MiddleVerticalAlignment,0)
            sk.sketchTexts.add(inp)
        sk.isVisible=True
        guide=marks.component.sketches.add(marks.component.xYConstructionPlane);guide.name='CAMERA roof-shadow on base - Y0 to73.33 - geometric blind strip'
        for a,b in [((-110,0,.7),(110,0,.7)),((-110,73.333,.7),(110,73.333,.7)),((-110,0,.7),(-110,73.333,.7)),((110,0,.7),(110,73.333,.7))]:guide.sketchCurves.sketchLines.addByTwoPoints(pt(*a),pt(*b))
        guide.isVisible=True
        alt=marks.component.sketches.add(marks.component.xYConstructionPlane);alt.name='PROPOSED alternative camera optical centre (0,20,400) - avoids roof overhang'
        for a,b in [((-8,20,400),(8,20,400)),((0,12,400),(0,28,400)),((0,20,392),(0,20,408)),((0,20,400),(0,0,40))]:alt.sketchCurves.sketchLines.addByTwoPoints(pt(*a),pt(*b))
        alt.isVisible=False
        report['camera_forward_candidate_mm']=[0,20,400]
        report['camera_roof_shadow_on_base_y_mm']=[0,220*60/(400-220)]
        # Native solid ray intersection checks exclude sensor housings and reference graphics.
        manager=adsk.fusion.TemporaryBRepManager.get();cam=(0,-60,400)
        checks=[]
        for label,end in [('Ramp hinge',(0,0,40)),('Zone near corner',(-110,0,0)),('Ground Y100',(0,100,0)),('Ground Y200',(0,200,0)),('Far corner',(110,300,0))]:
            ray=manager.createCylinderOrCone(pt(*cam),.005,pt(*end),.005);hits=[]
            for o in root.occurrences:
                if not o.component.name.startswith(('01','02')):continue
                for b in o.component.bRepBodies:
                    temp=manager.copy(b.createForAssemblyContext(o))
                    if manager.booleanOperation(temp,manager.copy(ray),adsk.fusion.BooleanTypes.IntersectionBooleanType) and temp.volume>1e-7:hits.append(b.name)
            checks.append({'target':label,'point_mm':list(end),'intersected_bus_solids':hits})
        report['camera_sightline_checks']=checks
        root.attributes.add('APAS','SightlineChecked','1')
    if not root.attributes.itemByName('APAS','ReadableHeightLabels'):
        for old in marks.component.sketches:
            if old.name=='HEIGHT LABELS - right view':old.isVisible=False
        h.root=marks.component
        sk,sign=h.plane_sketch('x',325,'HEIGHT BENCHMARKS - horizontal labels')
        for z,t in [(0,'Z0 BASE'),(40,'Z40 FLOOR'),(140,'Z140 ToF'),(220,'Z220 ROOF'),(260,'Z260 L1/L2'),(280,'Z280 L3'),(400,'Z400 CAMERA')]:
            p=h.map_point(sk,'x',325,-290,z+2);direction=h.map_point(sk,'x',325,-289,z+2)
            angle=math.atan2(direction.y-p.y,direction.x-p.x)
            inp=sk.sketchTexts.createInput2(t,.7)
            inp.setAsMultiLine(p,adsk.core.Point3D.create(p.x+10,p.y+1.1,0),adsk.core.HorizontalAlignments.LeftHorizontalAlignment,adsk.core.VerticalAlignments.MiddleVerticalAlignment,0)
            text=sk.sketchTexts.add(inp);entities=adsk.core.ObjectCollection.create()
            for line in text.definition.rectangleLines:entities.add(line)
            transform=adsk.core.Matrix3D.create();transform.setToRotation(angle,adsk.core.Vector3D.create(0,0,1),p);sk.move(entities,transform)
        sk.isVisible=True
        root.attributes.add('APAS','ReadableHeightLabels','1')
    for o in root.occurrences:
        for sk in o.component.sketches:
            sk.arePointsShown=False;sk.areProfilesShown=False
            if sk.name.startswith('HEIGHT LABELS - right view'):sk.isVisible=False
    report['feature_warnings']=[]
    for i in range(d.timeline.count):
        e=d.timeline.item(i).entity
        if hasattr(e,'healthState') and e.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':e.name,'message':e.errorOrWarningMessage})
    report['measured_optical_points_mm']={}
    sensors=next(o for o in root.occurrences if o.component.name.startswith('06'))
    for sk in sensors.component.sketches:
        if 'optical centre' in sk.name:
            p=sk.sketchPoints.item(sk.sketchPoints.count-1).worldGeometry
            report['measured_optical_points_mm'][sk.name]=[p.x*10,p.y*10,p.z*10]
    if report['feature_warnings']:raise RuntimeError(json.dumps(report['feature_warnings']))
    root.attributes.add('APAS','Benchmarks',json.dumps(report))
    def view(name,eye,target,up):
        c=app.activeViewport.camera;c.cameraType=adsk.core.CameraTypes.OrthographicCameraType;c.eye=pt(*eye);c.target=pt(*target);c.upVector=adsk.core.Vector3D.create(*up);c.isFitView=True;app.activeViewport.camera=c;app.activeViewport.refresh();adsk.doEvents();app.activeViewport.saveAsImageFile(os.path.join(OUT,'APAS_Robobus_v3_'+name+'.png'),1800,1200)
    view('top',(0,150,1800),(0,150,0),(0,1,0))
    view('heights',(1500,170,220),(0,170,220),(0,0,1))
    view('overview',(1100,1500,1000),(0,130,120),(0,0,1))
    d.exportManager.execute(d.exportManager.createFusionArchiveExportOptions(os.path.join(OUT,'APAS_Robobus_v3_Physical_Setup.f3d')))
    d.exportManager.execute(d.exportManager.createSTEPExportOptions(os.path.join(OUT,'APAS_Robobus_v3_Physical_Setup.step'),root))
    with open(os.path.join(OUT,'v3_physical_report.json'),'w') as f:json.dump(report,f,indent=2)
    with open(os.path.join(OUT,'v3_build.log'),'a') as f:f.write('FINAL: sightlines checked, labelled heights, valid timeline, files refreshed\n')
