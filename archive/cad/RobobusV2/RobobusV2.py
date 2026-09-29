"""Native Fusion v2 assembly builder and sequenced demonstration controller.
Run via Fusion Utilities > Scripts and Add-Ins. Dimensions in mm, angles rad.
The demonstration interlocks apply to this controller, not manual joint dragging.
"""
import adsk.core, adsk.fusion, os, json, math, traceback, importlib.util
OUT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P=adsk.core.Point3D.create
V=adsk.core.ValueInput.createByReal
E=adsk.core.ValueInput.createByString
M=adsk.core.Matrix3D.create
STATES=['Travel','Doors Open','Ramp Extended','Boarding Ready']
def log(t):
    with open(os.path.join(OUT,'v2_build.log'),'a',encoding='utf8') as f:f.write(str(t)+'\n')
def pt(x,y,z):return P(x/10,y/10,z/10)
def param(n):return design.userParameters.itemByName(n).value*10
def component(name,ground=False):
    o=root.occurrences.addNewComponent(M());o.component.name=name
    o.isGrounded=ground
    return o
def use(o):
    h.root=o.component
    return o.component
def box(o,name,xyz,app):
    use(o);return h.box(*xyz,name,app)
def cyl(o,name,axis,offset,u,v,r,length,app):
    use(o);return h.cylinder(axis,offset,u,v,r,length,name,app)
def rect(o,name,axis,offset,u,v,w,d,depth,app=None,target=None):
    """Rectangle dimensions and plane/depth expressions remain native driving parameters."""
    c=use(o)
    def val(expr):return design.unitsManager.evaluateExpression(str(expr),'mm')*10
    off=val(offset);uu=val(u);vv=val(v);ww=val(w);dd=val(d)
    sk,sgn=h.plane_sketch(axis,off,name)
    plane=sk.referencePlane
    # Offset plane is a parametric feature with its own expression.
    try:plane.timelineObject.entity.definition.offset.expression='('+str(offset)+') / '+str(sgn)
    except:pass
    p0=h.map_point(sk,axis,off,uu,vv);p1=h.map_point(sk,axis,off,uu+ww,vv+dd)
    lines=sk.sketchCurves.sketchLines.addTwoPointRectangle(p0,p1)
    corner=lines.item(0).startSketchPoint
    # Locate corner relative to the origin with signed-side-preserving dimensions.
    orient=adsk.fusion.DimensionOrientations
    axis_u=h.map_point(sk,axis,off,uu+1,vv);axis_v=h.map_point(sk,axis,off,uu,vv+1)
    for expr,coord,axisvec in [(u,p0,axis_u),(v,p0,axis_v)]:
        horizontal=abs(axisvec.x-p0.x)>0.01
        actual=p0.x if horizontal else p0.y
        if abs(actual)>1e-8:
            dim=sk.sketchDimensions.addDistanceDimension(sk.originPoint,corner,orient.HorizontalDimensionOrientation if horizontal else orient.VerticalDimensionOrientation,P(p0.x+3,p0.y+3,0))
            dim.parameter.expression='abs('+str(expr)+')'
    first_is_u=abs(axis_u.x-p0.x)>0.01
    for line,expr in [(lines.item(0),w if first_is_u else d),(lines.item(1),d if first_is_u else w)]:
        dim=sk.sketchDimensions.addDistanceDimension(line.startSketchPoint,line.endSketchPoint,orient.AlignedDimensionOrientation,P(p1.x+4,p1.y+4,0))
        dim.parameter.expression=str(expr)
    profiles=adsk.core.ObjectCollection.create()
    for p in sk.profiles:profiles.add(p)
    inp=c.features.extrudeFeatures.createInput(profiles,h.CUT if target else h.NEW)
    inp.setDistanceExtent(False,E('('+str(depth)+') / '+str(sgn)))
    if target:inp.participantBodies=[target]
    f=c.features.extrudeFeatures.add(inp);f.name=name;sk.isVisible=False
    if target:return target
    b=f.bodies.item(0);b.name=name
    if app:b.appearance=app
    return b
def joint(name,moving,fixed,axis,pivot,lo,hi,revolute=False):
    sk=fixed.component.sketches.add(fixed.component.xYConstructionPlane)
    sk.name=name+' joint datum'
    sp=sk.sketchPoints.add(pt(*pivot));sk.isVisible=False
    geo=adsk.fusion.JointGeometry.createByPoint(sp.createForAssemblyContext(fixed))
    inp=root.asBuiltJoints.createInput(moving,fixed,geo)
    direction=getattr(adsk.fusion.JointDirections,axis.upper()+'AxisJointDirection')
    if revolute:inp.setAsRevoluteJointMotion(direction)
    else:inp.setAsSliderJointMotion(direction)
    j=root.asBuiltJoints.add(inp);j.name=name
    limits=j.jointMotion.rotationLimits if revolute else j.jointMotion.slideLimits
    limits.minimumValue=lo if revolute else lo/10
    limits.maximumValue=hi if revolute else hi/10
    limits.isMinimumValueEnabled=True;limits.isMaximumValueEnabled=True
    return j
def motion(name,value):
    j=root.asBuiltJoints.itemByName(name)
    if 'hinge' in name:
        preferences=app.preferences.unitAndValuePreferences
        previous=preferences.angularPrecision
        try:
            preferences.angularPrecision=6
            j.jointMotion.rotationValue=value
        finally:preferences.angularPrecision=previous
    else:j.jointMotion.slideValue=value/10
def pose(p):
    for name,value in p.items():motion(name,value)
    adsk.doEvents()
def targets(state):
    opened=state!='Travel';extended=state in ['Ramp Extended','Boarding Ready'];ready=state=='Boarding Ready'
    return {'Door front plug':param('doorPlug') if opened else 0,'Door rear plug':param('doorPlug') if opened else 0,
      'Door front slide':-param('doorSlide') if opened else 0,'Door rear slide':param('doorSlide') if opened else 0,
      'Ramp slide':param('rampTravel') if extended else 0,'Ramp lift':param('rampLift') if ready else 0,
      'Ramp hinge':-math.asin((param('floorHeight')-param('curbHeight'))/param('rampLength')) if ready else 0,
      'Bridge hinge':0 if ready else math.radians(80)}
def transition(state,sample=None):
    for name,limit,negative in [('Door front plug',param('doorPlug'),False),('Door rear plug',param('doorPlug'),False),('Door front slide',param('doorSlide'),True),('Door rear slide',param('doorSlide'),False),('Ramp slide',param('rampTravel'),False),('Ramp lift',param('rampLift'),False)]:
        limits=root.asBuiltJoints.itemByName(name).jointMotion.slideLimits
        if negative:limits.minimumValue=-limit/10
        else:limits.maximumValue=limit/10
    root.asBuiltJoints.itemByName('Ramp hinge').jointMotion.rotationLimits.minimumValue=-math.asin((param('floorHeight')-param('curbHeight'))/param('rampLength'))
    # Always retract first in safe order, then deploy to requested state.
    def drive(updates):
        start={k:(root.asBuiltJoints.itemByName(k).jointMotion.rotationValue if 'hinge' in k else root.asBuiltJoints.itemByName(k).jointMotion.slideValue*10) for k in updates}
        for fraction in [0.25,0.5,0.75,1]:
            pose({k:start[k]+(v-start[k])*fraction for k,v in updates.items()})
            if sample:sample()
    drive({'Bridge hinge':math.radians(80)})
    drive({'Ramp hinge':0});drive({'Ramp lift':0});drive({'Ramp slide':0})
    drive({'Door front slide':0,'Door rear slide':0});drive({'Door front plug':0,'Door rear plug':0})
    if state!='Travel':
        drive({'Door front plug':param('doorPlug'),'Door rear plug':param('doorPlug')})
        drive({'Door front slide':-param('doorSlide'),'Door rear slide':param('doorSlide')})
    if state in ['Ramp Extended','Boarding Ready']:drive({'Ramp slide':param('rampTravel')})
    if state=='Boarding Ready':
        drive({'Ramp lift':param('rampLift')});drive({'Ramp hinge':targets(state)['Ramp hinge']});drive({'Bridge hinge':0})
    root.attributes.add('RobobusV2','State',state)
def view():
    cam=app.activeViewport.camera;cam.isSmoothTransition=False
    cam.cameraType=adsk.core.CameraTypes.OrthographicCameraType
    cam.eye=pt(-5700,10800,6200);cam.target=pt(2800,650,1150)
    cam.upVector=adsk.core.Vector3D.create(0,0,1);cam.isFitView=True
    app.activeViewport.camera=cam;app.activeViewport.refresh();adsk.doEvents()
def export(state):
    transition(state);view()
    name='Punggol_WeRide_Robobus_v2_'+('travel' if state=='Travel' else 'deployed')
    exp=design.exportManager
    exp.execute(exp.createSTEPExportOptions(os.path.join(OUT,name+'.step'),root))
    app.activeViewport.saveAsImageFile(os.path.join(OUT,name+'.png'),1800,1200)
def validate():
    report={'samples':[],'interferences':[],'errors':[]}
    manager=adsk.fusion.TemporaryBRepManager.get()
    def sample():
        index=len(report['samples']);pairs=[];items=[]
        for o in root.occurrences:
            if not o.isLightBulbOn:continue
            moving=o.component.name.startswith(('02','03','04','05','06','07'))
            for b in o.component.bRepBodies:
                proxy=b.createForAssemblyContext(o)
                items.append((o.name,b.name,proxy,proxy.boundingBox,moving))
        for i,a in enumerate(items):
            for b in items[i+1:]:
                if a[0]==b[0] or not(a[4] or b[4]):continue
                if any(min(getattr(a[3].maxPoint,k),getattr(b[3].maxPoint,k))-max(getattr(a[3].minPoint,k),getattr(b[3].minPoint,k))<0.0001 for k in ['x','y','z']):continue
                try:
                    aa=manager.copy(a[2]);bb=manager.copy(b[2])
                    ok=manager.booleanOperation(aa,bb,adsk.fusion.BooleanTypes.IntersectionBooleanType)
                    if ok and aa.volume>0.00001:
                        hit={'sample':index,'a':a[0]+'/'+a[1],'b':b[0]+'/'+b[1],'volume_mm3':aa.volume*1000}
                        report['interferences'].append(hit);pairs.append(hit)
                except Exception as e:report['errors'].append(str(e))
        report['samples'].append({'index':index,'collisions':len(pairs)})
    transition('Travel');sample();transition('Boarding Ready',sample);transition('Travel',sample)
    transition('Boarding Ready')
    report['final_transforms']={o.name:o.transform2.asArray() for o in root.occurrences}
    with open(os.path.join(OUT,'v2_clearance_report.json'),'w') as f:json.dump(report,f,indent=2)
    log('VALIDATED '+str(len(report['samples']))+' poses; hits '+str(len(report['interferences'])))
def repair():
    global h
    spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.app=app;h.design=design
    transition('Travel')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Travel before packaging refinement'
    def occ(prefix):return next(o for o in root.occurrences if o.component.name.startswith(prefix))
    vehicle=occ('01');slide=occ('04');lift=occ('05');deck=occ('06');bridge=occ('07');sensors=occ('08')
    silver=design.appearances.itemByName('Satin silver lower body');black=design.appearances.itemByName('Rubber and trim');teal=design.appearances.itemByName('Sensor teal')
    def remove(o,match):
        for b in list(o.component.bRepBodies):
            if match in b.name:o.component.features.removeFeatures.add(b)
    hull=vehicle.component.bRepBodies.itemByName('01 Purple body envelope')
    rect(vehicle,'Lift bearing clearance pocket','z','300 mm','2480 mm','975 mm','1040 mm','130 mm','80 mm',target=hull)
    rect(vehicle,'Recessed bridge clearance pocket','z','338 mm','2550 mm','960 mm','900 mm','150 mm','16 mm',target=hull)
    for b in list(vehicle.component.bRepBodies):
        if 'Right silver lower skirt' in b.name and b.boundingBox.minPoint.x*10<3520 and b.boundingBox.maxPoint.x*10>2480:
            rect(vehicle,'Lift pocket skirt relief','z','300 mm','2480 mm','1010 mm','1040 mm','100 mm','85 mm',target=b)
    remove(vehicle,'PROPOSED cassette top')
    box(vehicle,'PROPOSED cassette top - lift clearance',(2490,-910,325,3510,950,335),silver)
    remove(slide,'Extension telescopic rail')
    for x in [2512,3472]:box(slide,'Extension bearing shoe',(x,-870,232,x+16,-800,242),silver)
    remove(lift,'PROPOSED ramp angle encoder');remove(lift,'Ramp hinge shaft')
    for x in [2532,3451]:cyl(lift,'Coaxial ramp hinge shaft stub','x',x,-800,275,9,17,silver)
    cyl(lift,'PROPOSED ramp angle encoder - inboard','x',3470,-800,275,16,20,teal)
    remove(deck,'Ramp deck with tapered curb tip')
    b=rect(deck,'Ramp deck - driving width length thickness','x','2550 mm','-800 mm','floorHeight-rampLift-rampThickness','rampLength','rampThickness','rampWidth',silver)
    use(deck)
    h.polygon('x',2540,[(880,239),(1001,239),(1001,275.3),(880,240)],920,'Tapered underside tip',target=b)
    # Non-contact proximity heads placed above the swept lift block.
    remove(sensors,'PROPOSED ramp deployed switch')
    box(sensors,'PROPOSED ramp deployed switch - clear mount',(2482,990,380,2502,1015,405),teal)
    for prefix,label in [('03 Door front','front'),('03 Door rear','rear')]:
        leaf=occ(prefix);remove(leaf,label+' carriage roller housing')
        x=2600 if label=='front' else 3150
        box(leaf,label+' carriage roller housing - clearance',(x,1078,2392,x+70,1100,2398),silver)
    # Hollow actuator housings and distinct moving rods.
    use(vehicle)
    actuator=h.cylinder('y',-895,2600,220,15,1885,'PROPOSED extension actuator housing',silver)
    h.cylinder('y',-896,2600,220,8,1887,'Extension actuator internal bore',target=actuator)
    cyl(slide,'PROPOSED extension actuator piston','y',-870,2600,220,6,70,black)
    use(slide)
    actuator=h.cylinder('z',200,3462,-800,9,120,'PROPOSED lift actuator housing',silver)
    h.cylinder('z',199,3462,-800,6,122,'Lift actuator internal bore',target=actuator)
    cyl(lift,'PROPOSED lift actuator piston','z',205,3462,-800,5,70,black)
    for o in root.occurrences:o.component.sketches.isLightBulbOn=False;o.component.constructionPlanes.isLightBulbOn=False
    for j in root.asBuiltJoints:j.isLightBulbOn=False
    root.attributes.add('RobobusV2','Refined','1')
    log('REPAIRED packaging')
def finalize():
    global h
    spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.app=app;h.design=design
    transition('Travel')
    vehicle=next(o for o in root.occurrences if o.component.name.startswith('01'))
    floor=vehicle.component.bRepBodies.itemByName('Interior floor finish')
    if floor:
        vehicle.component.features.removeFeatures.add(floor)
        box(vehicle,'Flush interior floor finish',(1460,-860,346,4190,958,350),design.appearances.itemByName('Rubber and trim'))
    report={'invalid_bodies':[],'feature_warnings':[],'named_positions':{},'dimensions_mm':{},'parameter_checks':[]}
    deck=next(o for o in root.occurrences if o.component.name.startswith('06'))
    b=next(b for b in deck.component.bRepBodies if b.name.startswith('Ramp deck -'))
    bb=b.boundingBox
    report['dimensions_mm']['ramp_body_bbox']=[(getattr(bb.maxPoint,k)-getattr(bb.minPoint,k))*10 for k in ['x','y','z']]
    for n,test in [('rampWidth',901),('doorWidth',1101),('doorHeight',2001),('curbHeight',151)]:
        p=design.userParameters.itemByName(n);original=p.expression;p.expression=str(test)+' mm';design.computeAll()
        check={'name':n,'tested_mm':test,'value_mm':p.value*10}
        if n=='rampWidth':
            bb=b.boundingBox;check['measured_width_mm']=(bb.maxPoint.x-bb.minPoint.x)*10
        elif n=='curbHeight':
            curb=next(o for o in root.occurrences if o.component.name.startswith('90'))
            bb=curb.component.bRepBodies.item(0).boundingBox;check['measured_height_mm']=(bb.maxPoint.z-bb.minPoint.z)*10
        else:
            sk=vehicle.component.sketches.itemByName('Clear doorway 1100 x 2000 profile')
            check['measured_sketch_dimension_mm']=sk.sketchDimensions.item(2 if n=='doorWidth' else 3).parameter.value*10
        report['parameter_checks'].append(check)
        p.expression=original;design.computeAll()
    for s in STATES:
        transition(s)
        if design.snapshots.hasPendingSnapshot:design.snapshots.add().name=s
        report['named_positions'][s]=targets(s)
    for o in root.occurrences:
        o.component.sketches.isLightBulbOn=False;o.component.constructionPlanes.isLightBulbOn=False
        for b in o.component.bRepBodies:
            if not b.isSolid:report['invalid_bodies'].append(o.name+'/'+b.name)
    for j in root.asBuiltJoints:j.isLightBulbOn=False
    for i in range(design.timeline.count):
        ent=design.timeline.item(i).entity
        try:
            if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
        except AttributeError:pass
    report['solid_count']=sum(o.component.bRepBodies.count for o in root.occurrences)
    report['timeline_features']=design.timeline.count;report['joint_count']=root.asBuiltJoints.count
    export('Travel')
    cam=app.activeViewport.camera;cam.eye=pt(-7100,-10200,6100);cam.target=pt(2600,0,1250);cam.isFitView=True
    app.activeViewport.camera=cam;app.activeViewport.refresh();adsk.doEvents()
    app.activeViewport.saveAsImageFile(os.path.join(OUT,'Punggol_WeRide_Robobus_v2_opposite_logo.png'),1800,1200)
    export('Boarding Ready')
    transform=deck.transform2
    for name,p in [('ramp_root_top',pt(3000,-800,275)),('ramp_tip_top',pt(3000,1000,275))]:
        p.transformBy(transform);report['dimensions_mm'][name]=[p.x*10,p.y*10,p.z*10]
    report['dimensions_mm']['curb_leading_y']=1025+math.sqrt(1800**2-200**2)
    report['actual_hinge_degrees']=math.degrees(root.asBuiltJoints.itemByName('Ramp hinge').jointMotion.rotationValue)
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Boarding Ready - final'
    with open(os.path.join(OUT,'v2_final_report.json'),'w') as f:json.dump(report,f,indent=2)
    design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v2.f3d')))
    validate();view()
    log('FINAL EXPORTS COMPLETE')
def repair2():
    global h
    spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.app=app;h.design=design
    transition('Travel')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Travel - actuator revision'
    def occ(prefix):return next(o for o in root.occurrences if o.component.name.startswith(prefix))
    deck=occ('06');slide=occ('04');lift=occ('05');vehicle=occ('01')
    sk=deck.component.sketches.itemByName('Ramp deck - driving width length thickness profile')
    sk.sketchDimensions.item(2).parameter.expression='rampThickness'
    sk.sketchDimensions.item(3).parameter.expression='rampLength'
    for o,match in [(slide,'PROPOSED lift actuator housing'),(lift,'PROPOSED lift actuator piston')]:
        for b in list(o.component.bRepBodies):
            if match in b.name:o.component.features.removeFeatures.add(b)
    silver=design.appearances.itemByName('Satin silver lower body');black=design.appearances.itemByName('Rubber and trim')
    use(slide)
    actuator=h.cylinder('z',207,3460,-840,9,110,'PROPOSED lift actuator housing - clear',silver)
    h.cylinder('z',206,3460,-840,6,112,'Lift actuator bore - clear',target=actuator)
    cyl(lift,'PROPOSED lift actuator piston - clear','z',208,3460,-840,5,67,black)
    use(slide)
    cross=slide.component.bRepBodies.itemByName('Carriage cross member')
    h.cylinder('y',-875,2600,220,16,40,'Actuator clearance in cross member',target=cross)
    for o in root.occurrences:o.component.sketches.isLightBulbOn=False;o.component.constructionPlanes.isLightBulbOn=False
    root.attributes.add('RobobusV2','Refined2','1');log('REPAIRED actuator and deck dimensions')
def finish_details():
    global h
    spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.app=app;h.design=design
    transition('Travel')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Travel - final detail update'
    deck=next(o for o in root.occurrences if o.component.name.startswith('06'))
    sensors=next(o for o in root.occurrences if o.component.name.startswith('08'))
    vehicle=next(o for o in root.occurrences if o.component.name.startswith('01'))
    if not root.attributes.itemByName('RobobusV2','FinalDetails'):
        rect(vehicle,'Floor finish seating recess','z','346 mm','1460 mm','-860 mm','2730 mm','1818 mm','4 mm',target=vehicle.component.bRepBodies.itemByName('01 Purple body envelope'))
    sk=deck.component.sketches.itemByName('Tapered underside tip profile')
    target=sk.modelToSketchSpace(pt(2540,1001,275+35/120))
    for endpoint in [sk.sketchCurves.sketchLines.item(1).endSketchPoint,sk.sketchCurves.sketchLines.item(2).startSketchPoint]:
        if endpoint.geometry.distanceTo(target)>1e-9:endpoint.move(endpoint.geometry.vectorTo(target))
    feat=deck.component.features.extrudeFeatures.itemByName('Tapered underside tip')
    if sk.profiles.count!=1:raise RuntimeError('Tip profile is not one closed region.')
    feat.timelineObject.rollTo(True)
    feat.profile=sk.profiles.item(0)
    design.timeline.moveToEnd()
    design.computeAll()
    for b in list(sensors.component.bRepBodies):
        if 'deployed switch' in b.name:sensors.component.features.removeFeatures.add(b)
    box(sensors,'PROPOSED ramp deployed switch - outside clear doorway',(2418,1030,380,2438,1055,405),design.appearances.itemByName('Sensor teal'))
    for o in root.occurrences:
        o.component.sketches.isLightBulbOn=False;o.component.constructionPlanes.isLightBulbOn=False
        if o.component.name.startswith('03'):
            for b in o.component.bRepBodies:
                if 'vertical frame' in b.name:b.name+=' with perimeter seal'
    validate()
    report=json.load(open(os.path.join(OUT,'v2_final_report.json')))
    report['invalid_bodies']=[];report['feature_warnings']=[]
    for o in root.occurrences:
        for b in o.component.bRepBodies:
            if not b.isSolid:report['invalid_bodies'].append(o.name+'/'+b.name)
    for i in range(design.timeline.count):
        ent=design.timeline.item(i).entity
        try:
            if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
        except AttributeError:pass
    b=next(b for b in deck.component.bRepBodies if b.name.startswith('Ramp deck -'))
    bb=b.boundingBox;report['dimensions_mm']['ramp_body_bbox']=[(getattr(bb.maxPoint,k)-getattr(bb.minPoint,k))*10 for k in ['x','y','z']]
    tip=max((v.geometry for v in b.vertices),key=lambda p:p.y)
    tip.transformBy(deck.transform2);report['dimensions_mm']['actual_tip_vertex']=[tip.x*10,tip.y*10,tip.z*10]
    report['solid_count']=sum(o.component.bRepBodies.count for o in root.occurrences);report['timeline_features']=design.timeline.count
    for s in STATES:
        transition(s)
        if design.snapshots.hasPendingSnapshot:design.snapshots.add().name=s+' - verified'
    export('Travel');export('Boarding Ready')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Boarding Ready - delivery'
    design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v2.f3d')))
    for name in ['v2_final_report.json','v2_model_report.json']:
        with open(os.path.join(OUT,name),'w') as f:json.dump(report,f,indent=2)
    root.attributes.add('RobobusV2','FinalDetails','1');log('DELIVERY READY')
def fix_entrance_panel():
    global h
    spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);h.app=app;h.design=design
    transition('Travel')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Travel before entrance panel correction'
    vehicle=next(o for o in root.occurrences if o.component.name.startswith('01'))
    for feature in list(vehicle.component.features.extrudeFeatures)[::-1]:
        if 'Full clear doorway through lower skirt' in feature.name and feature.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:
            log('Remove failed duplicate cut: '+feature.name+' '+feature.errorOrWarningMessage)
            feature.deleteMe()
    changed=[]
    cut_exists=any('Full clear doorway through lower skirt' in f.name and f.healthState==adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState for f in vehicle.component.features.extrudeFeatures)
    for b in list(vehicle.component.bRepBodies):
        bb=b.boundingBox
        if not cut_exists and 'Right silver lower skirt' in b.name and bb.minPoint.x*10<3549.9 and bb.maxPoint.x*10>2450.1 and bb.maxPoint.z*10>350.1:
            changed.append(b.name)
            rect(vehicle,'Full clear doorway through lower skirt','y','990 mm','doorCentre-doorWidth/2','floorHeight','doorWidth','doorHeight','110 mm',target=b)
    # A retry can find no crossing body because the prior cut already split it.
    vehicle.component.sketches.isLightBulbOn=False;vehicle.component.constructionPlanes.isLightBulbOn=False
    transition('Boarding Ready')
    manager=adsk.fusion.TemporaryBRepManager.get()
    bounds=adsk.core.OrientedBoundingBox3D.create(pt(3000,1012,1375),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),109.98,2.4,194.98)
    upper_probe=manager.createBox(bounds)
    lower=adsk.core.OrientedBoundingBox3D.create(pt(3000,1012,375.1),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),86.98,2.4,5)
    lower_probe=manager.createBox(lower)
    hits=[]
    for o in root.occurrences:
        for b in o.component.bRepBodies:
            proxy=b.createForAssemblyContext(o);bb=proxy.boundingBox
            if bb.maxPoint.x<245 or bb.minPoint.x>355 or bb.maxPoint.y<100 or bb.minPoint.y>102.4 or bb.maxPoint.z<35.01 or bb.minPoint.z>234.99:continue
            for label,probe in [('upper full doorway',upper_probe),('lower ramp walking strip',lower_probe)]:
                temp=manager.copy(proxy)
                if manager.booleanOperation(temp,manager.copy(probe),adsk.fusion.BooleanTypes.IntersectionBooleanType) and temp.volume>0.00001:
                    hits.append({'region':label,'body':o.name+'/'+b.name,'volume_mm3':temp.volume*1000})
    report=json.load(open(os.path.join(OUT,'v2_final_report.json')))
    report['entrance_passage_check']={'state':'Boarding Ready','upper_probe_mm':{'x':[2450.1,3549.9],'y':[1000,1024],'z':[400.1,2349.9]},'lower_walking_strip_mm':{'x':[2565.1,3434.9],'y':[1000,1024],'z':[350.1,400.1]},'note':'Ramp hinge and lift-bearing hardware occupies the lower side margins, outside the 870 mm ramp walking strip.','intersections':hits,'corrected_bodies':changed or ['Previously cut crossing right silver lower skirt']}
    report['invalid_bodies']=[];report['feature_warnings']=[]
    for o in root.occurrences:
        for b in o.component.bRepBodies:
            if not b.isSolid:report['invalid_bodies'].append(o.name+'/'+b.name)
    for i in range(design.timeline.count):
        ent=design.timeline.item(i).entity
        try:
            if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
        except AttributeError:pass
    if hits or report['feature_warnings'] or report['invalid_bodies']:raise RuntimeError('Entrance validation failed: '+json.dumps(report))
    report['solid_count']=sum(o.component.bRepBodies.count for o in root.occurrences)
    for s in STATES:
        transition(s)
        if design.snapshots.hasPendingSnapshot:design.snapshots.add().name=s+' - clear entrance'
    export('Travel');export('Boarding Ready')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Boarding Ready - unobstructed entrance'
    root.attributes.add('RobobusV2','EntrancePanelCorrected','1')
    report['timeline_features']=design.timeline.count
    design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v2.f3d')))
    for name in ['v2_final_report.json','v2_model_report.json']:
        with open(os.path.join(OUT,name),'w') as f:json.dump(report,f,indent=2)
    log('ENTRANCE CORRECTED; clear passage; healthy solids and features')

def run(context):
    global app,design,root,h
    app=adsk.core.Application.get()
    try:
        design=adsk.fusion.Design.cast(app.activeProduct);root=design.rootComponent
        if root.attributes.itemByName('RobobusV2','Built'):
            if os.path.isfile(os.path.join(OUT,'entrance_fix.flag')):
                fix_entrance_panel();return
            if os.path.isfile(os.path.join(OUT,'details_v2.flag')):
                finish_details();return
            if os.path.isfile(os.path.join(OUT,'repair2_v2.flag')) and not root.attributes.itemByName('RobobusV2','Refined2'):
                repair2();validate();view();return
            if os.path.isfile(os.path.join(OUT,'finalize_v2.flag')):
                finalize();return
            if os.path.isfile(os.path.join(OUT,'repair_v2.flag')) and not root.attributes.itemByName('RobobusV2','Refined'):
                repair();validate();view();return
            if os.path.isfile(os.path.join(OUT,'validate_v2.flag')):
                validate();view();return
            text,cancel=app.userInterface.inputBox('Choose a named position:\nTravel / Doors Open / Ramp Extended / Boarding Ready','Robobus v2 sequence','Boarding Ready')
            if not cancel:
                if text not in STATES:raise ValueError('Enter one of the four exact named positions.')
                transition(text);view()
            return
        log('START')
        doc=app.importManager.importToNewDocument(app.importManager.createFusionArchiveImportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.f3d')))
        design=adsk.fusion.Design.cast(app.activeProduct);root=design.rootComponent
        design.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType
        doc.name='Punggol Ai.R - Robobus v2 Boarding Concept'
        spec=importlib.util.spec_from_file_location('robobus_v1_helpers',os.path.join(OUT,'Robobus','Robobus.py'))
        h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
        h.app=app;h.design=design;h.root=root
        params={'doorWidth':'1100 mm','doorHeight':'2000 mm','doorCentre':'3000 mm','floorHeight':'350 mm','doorPlug':'70 mm','doorSlide':'570 mm','rampWidth':'900 mm','rampLength':'1800 mm','rampThickness':'35 mm','rampTravel':'1825 mm','rampLift':'75 mm','curbHeight':'150 mm'}
        for n,e in params.items():design.userParameters.add(n,E(e),'mm','V2 boarding concept driving dimension / controller limit')
        vehicle=component('01 VEHICLE - grounded structure',True)
        bodies=list(root.bRepBodies)
        for b in bodies:b.moveToComponent(vehicle)
        c=use(vehicle)
        def ap(n):return design.appearances.itemByName(n)
        purple=ap('Ai.R violet body');glass=ap('Smoked blue glazing - opaque exterior study');silver=ap('Satin silver lower body');black=ap('Rubber and trim');white=ap('Lamp lenses and markings');teal=ap('Sensor teal');amber=ap('Amber indicators')
        # Remove superseded door details and misleading badge lettering in v2 only.
        for b in list(c.bRepBodies):
            if b.name in ['Boarding door front jamb','Boarding door rear jamb','Double door centre seam','Boarding threshold','Door handle'] or 'letter' in b.name.lower():c.features.removeFeatures.add(b)
        hull=c.bRepBodies.itemByName('01 Purple body envelope')
        rect(vehicle,'Interior usable entrance recess','z','floorHeight','1450 mm','-870 mm','2750 mm','1835 mm','2050 mm',target=hull)
        rect(vehicle,'Clear doorway 1100 x 2000','y','900 mm','doorCentre-doorWidth/2','floorHeight','doorWidth','doorHeight','200 mm',target=hull)
        # Cut every side panel crossing the clear opening; the body and underfloor opening separately.
        for b in list(c.bRepBodies):
            if b==hull:continue
            bb=b.boundingBox
            if bb.minPoint.y*10>=1020 and bb.maxPoint.x*10>2450 and bb.minPoint.x*10<3550 and bb.maxPoint.z*10>350 and bb.minPoint.z*10<2350:
                rect(vehicle,'Door clearance - '+b.name,'y','1010 mm','doorCentre-doorWidth/2','floorHeight','doorWidth','doorHeight','100 mm',target=b)
        rect(vehicle,'Underfloor cassette pocket','z','180 mm','2480 mm','-920 mm','1040 mm','2020 mm','155 mm',target=hull)
        for b in list(c.bRepBodies):
            if 'Right silver lower skirt' in b.name and b.boundingBox.minPoint.x*10<3500 and b.boundingBox.maxPoint.x*10>2500:
                rect(vehicle,'Cassette aperture in skirt','z','180 mm','2480 mm','1010 mm','1040 mm','90 mm','170 mm',target=b)
        box(vehicle,'Interior floor finish',(1460,-860,350,4190,958,354),black)
        for x in [2415,3550]:box(vehicle,'Entrance structural jamb',(x,980,350,x+35,1030,2390),silver)
        box(vehicle,'Doorway lintel',(2415,980,2350,3585,1030,2390),silver)
        box(vehicle,'Threshold inner sill',(2450,920,330,3550,965,350),silver)
        for z in [2400,2440]:box(vehicle,'Overhead guide rail',(1800,1050,z,4200,1070,z+15),silver)
        box(vehicle,'PROPOSED door motor housing',(2800,980,2470,3200,1070,2540),black)
        log('Entrance cut')
        doors=[]
        for label,x,sgn in [('front',2450,-1),('rear',3000,1)]:
            carriage=component('02 Door '+label+' plug carriage - PROPOSED')
            box(carriage,'Plug slide arm '+label,(x+150,1040,2360,x+220,1090,2390),silver)
            leaf=component('03 Door '+label+' glazed leaf - PROPOSED');doors.extend([carriage,leaf])
            rect(leaf,'Door '+label+' glazing','y','1048 mm',str(x+30)+' mm','380 mm','doorWidth/2-60 mm','doorHeight-60 mm','20 mm',glass)
            for xx in [x,x+525]:box(leaf,label+' vertical frame',(xx,1038,350,xx+25,1078,2350),black)
            for zz in [350,2325]:box(leaf,label+' horizontal frame',(x+25,1038,zz,x+525,1078,zz+25),purple)
            box(leaf,label+' lower kick panel',(x+25,1045,375,x+525,1072,760),purple)
            box(leaf,label+' carriage roller housing',(x+150,1078,2350,x+220,1100,2380),silver)
            joint('Door '+label+' plug',carriage,vehicle,'y',(x+185,1050,2400),0,70)
            joint('Door '+label+' slide',leaf,carriage,'x',(x+185,1050,2400),-570 if sgn<0 else 0,0 if sgn<0 else 570)
        cassette=vehicle
        box(cassette,'PROPOSED cassette bottom',(2490,-910,190,3510,1040,205),silver)
        box(cassette,'PROPOSED cassette top',(2490,-910,325,3510,1040,335),silver)
        for x in [2490,3495]:box(cassette,'PROPOSED cassette side',(x,-910,205,x+15,1040,325),silver)
        box(cassette,'PROPOSED cassette rear closure',(2505,-910,205,3495,-895,325),silver)
        for x in [2510,3470]:box(cassette,'PROPOSED fixed ramp guide rail',(x,-890,210,x+20,1020,230),black)
        slide=component('04 Ramp extension carriage - PROPOSED')
        lift=component('05 Ramp lift carriage - PROPOSED')
        deck=component('06 Ramp hinged deck - PROPOSED')
        for x in [2512,3472]:
            box(slide,'Extension telescopic rail',(x,-870,232,x+16,1010,242),silver)
            box(lift,'Lift bearing block',(x,-835,250,x+16,-765,290),black)
        box(slide,'Carriage cross member',(2530,-870,210,3470,-845,232),silver)
        cyl(lift,'Ramp hinge shaft','x',2532,-800,275,9,936,silver)
        # Shaft bearings are outside the 900mm deck; deck starts 10mm after shaft.
        use(deck)
        h.polygon('x',2550,[(-790,240),(880,240),(1000,275),(-790,275)],900,'Ramp deck with tapered curb tip',silver)
        # Main deck native extrusion width is driven; section dimensions controlled by notes and rebuild.
        deck.component.features.extrudeFeatures.item(0).extentOne.distance.expression='rampWidth'
        for x in [2550,3435]:box(deck,'Ramp side edging',(x,-785,275,x+15,850,310),amber)
        for y in range(-680,850,140):box(deck,'Ramp grip strip',(2570,y,275,3430,y+24,278),black)
        joint('Ramp slide',slide,vehicle,'y',(3000,-800,275),0,1825)
        joint('Ramp lift',lift,slide,'z',(3000,-800,275),0,75)
        joint('Ramp hinge',deck,lift,'x',(3000,-800,275),-math.asin(200/1800),0,True)
        bridge=component('07 Threshold bridge plate - PROPOSED')
        use(bridge);h.polygon('x',2555,[(965,346),(1015,346),(1025,350),(965,350)],890,'Threshold bridge tapered plate',silver)
        joint('Bridge hinge',bridge,vehicle,'x',(3000,965,350),0,math.radians(80),True)
        curb=component('90 CONTEXT - hideable 150 mm curb',True)
        tipY=1025+math.sqrt(1800**2-200**2)
        rect(curb,'Curb platform','z','0 mm','2100 mm',str(tipY)+' mm','1800 mm','1200 mm','curbHeight',silver)
        # Photo-referenced vehicle hardware retained with explicit provenance.
        for b in c.bRepBodies:
            if 'lidar' in b.name.lower() or 'GNSS' in b.name or 'sensor bracket' in b.name:b.name='PHOTO-BASED vehicle sensor - '+b.name
        for label,x,direction in [('front',-18,-1),('rear',5510,1)]:
            cyl(vehicle,'PROPOSED '+label+' camera mount','x',x,0,1450,42,direction*16,black)
            cyl(vehicle,'PROPOSED '+label+' camera optical lens','x',x+direction*16,0,1450,24,direction*5,teal)
            box(vehicle,'PROPOSED '+label+' lower radar mount',(min(x,x+direction*25),-120,530,max(x,x+direction*25),120,620),black)
        use(vehicle)
        for sign in [-1,1]:
            sk,normal=h.plane_sketch('y',sign*1048,'Upright Ai.R badge '+str(sign))
            a=h.map_point(sk,'y',sign*1048,1800,1590);b=h.map_point(sk,'y',sign*1048,2300,1930)
            inp=sk.sketchTexts.createInput2('ai.r',22);inp.fontName='Arial'
            inp.setAsMultiLine(P(min(a.x,b.x),min(a.y,b.y),0),P(max(a.x,b.x),max(a.y,b.y),0),adsk.core.HorizontalAlignments.CenterHorizontalAlignment,adsk.core.VerticalAlignments.MiddleVerticalAlignment,0)
            origin=sk.sketchToModelSpace(P(0,0,0));up=sk.sketchToModelSpace(P(0,1,0));right=sk.sketchToModelSpace(P(1,0,0))
            inp.isVerticalFlip=up.z<origin.z
            inp.isHorizontalFlip=(right.x-origin.x)*(-sign)<0
            txt=sk.sketchTexts.add(inp)
            f=vehicle.component.features.extrudeFeatures.addSimple(txt,V(sign*0.3/normal),h.NEW)
            for body in f.bodies:body.name='Upright Ai.R logo '+str(sign);body.appearance=purple
            sk.isVisible=False
        sensors=component('08 ACCESS sensors - proposed concept',True)
        for x in [2420,3555]:
            for z in [500,1150]:box(sensors,'PROPOSED doorway obstruction beam head',(x,1030,z,x+20,1045,z+35),teal)
        for x in [2420,3560]:box(sensors,'PROPOSED door position proximity switch',(x,1030,2320,x+20,1050,2345),teal)
        for y,name in [(-870,'stowed'),(985,'deployed')]:box(sensors,'PROPOSED ramp '+name+' switch',(2505,y,285,2525,y+25,310),teal)
        box(sensors,'PROPOSED overhead boarding detector',(2950,995,2360,3050,1040,2400),teal)
        cyl(lift,'PROPOSED ramp angle encoder','x',3490,-800,275,20,15,teal)
        root.attributes.add('RobobusV2','Built','2.0')
        root.attributes.add('RobobusV2','NamedPositions',json.dumps({s:targets(s) for s in STATES}))
        root.attributes.add('RobobusV2','Sequence','Bridge up > ramp level > lift down > ramp in > door slide closed > door plug closed; reverse to board.')
        for o in root.allOccurrences:
            o.component.sketches.isLightBulbOn=False;o.component.constructionPlanes.isLightBulbOn=False
        root.sketches.isLightBulbOn=False;root.constructionPlanes.isLightBulbOn=False
        log('Assembly built; validating')
        report={'parameters_mm':{n:param(n) for n in params},'states':{s:targets(s) for s in STATES},'invalid_bodies':[],'feature_warnings':[],'occurrences':[]}
        for o in root.allOccurrences:
            report['occurrences'].append({'name':o.name,'bodies':o.component.bRepBodies.count})
            for b in o.component.bRepBodies:
                if not b.isSolid:report['invalid_bodies'].append(o.name+'/'+b.name)
        for i in range(design.timeline.count):
            ent=design.timeline.item(i).entity
            try:
                if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
            except AttributeError:pass
        report['timeline_features']=design.timeline.count
        report['joint_count']=root.asBuiltJoints.count
        export('Travel');log('Travel exported')
        export('Boarding Ready');log('Boarding exported')
        report['deployed_transforms']={o.name:o.transform2.asArray() for o in [*doors,slide,lift,deck,bridge]}
        with open(os.path.join(OUT,'v2_model_report.json'),'w') as f:json.dump(report,f,indent=2)
        design.exportManager.execute(design.exportManager.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v2.f3d')))
        repair();repair2();finalize();finish_details();fix_entrance_panel()
        log('COMPLETE')
        app.userInterface.messageBox('Robobus v2 created. Run this script again to choose a named position.\nExports: '+OUT,'Robobus v2')
    except:
        log(traceback.format_exc());app.userInterface.messageBox(traceback.format_exc(),'Robobus v2 needs attention')
