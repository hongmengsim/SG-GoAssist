"""Native Fusion exterior study. All inputs below are millimetres.
Nominal dimensions: WeRide brochure; detailed geometry: photographic estimates.
Run from Fusion Scripts and Add-Ins in an EMPTY design. No external dependencies.
"""
import adsk.core, adsk.fusion, traceback, os, json, math

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = adsk.core.Point3D.create
V = adsk.core.ValueInput.createByReal
NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation
warnings = []

def point(x, y, z):
    return P(x / 10, y / 10, z / 10)

def log(message):
    with open(os.path.join(OUT, 'build.log'), 'a', encoding='utf-8') as f:
        f.write(message + '\n')

def plane_sketch(axis, position, name):
    base = {'x': root.yZConstructionPlane, 'y': root.xZConstructionPlane,
            'z': root.xYConstructionPlane}[axis]
    normal = base.geometry.normal
    direction = {'x': normal.x, 'y': normal.y, 'z': normal.z}[axis]
    inp = root.constructionPlanes.createInput()
    inp.setByOffset(base, V(position / 10 / direction))
    plane = root.constructionPlanes.add(inp)
    plane.name = name + ' plane'
    plane.isLightBulbOn = False
    sk = root.sketches.add(plane)
    sk.name = name + ' profile'
    return sk, direction

def map_point(sk, axis, offset, u, v):
    xyz = {'x': (offset, u, v), 'y': (u, offset, v), 'z': (u, v, offset)}[axis]
    return sk.modelToSketchSpace(point(*xyz))

def finish(sk, direction, distance, name, appearance=None, target=None):
    profiles = adsk.core.ObjectCollection.create()
    for prof in sk.profiles:
        profiles.add(prof)
    if profiles.count == 0:
        raise RuntimeError('No closed profile: ' + name)
    inp = root.features.extrudeFeatures.createInput(profiles, CUT if target else NEW)
    inp.setDistanceExtent(False, V(distance / 10 / direction))
    if target:
        inp.participantBodies = [target]
    feat = root.features.extrudeFeatures.add(inp)
    feat.name = name
    sk.isVisible = False
    if target:
        return target
    body = feat.bodies.item(0)
    body.name = name
    if appearance:
        body.appearance = appearance
    return body

def polygon(axis, offset, vertices, distance, name, appearance=None, target=None):
    sk, direction = plane_sketch(axis, offset, name)
    pts = [map_point(sk, axis, offset, *p) for p in vertices]
    for i in range(len(pts)):
        sk.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i + 1) % len(pts)])
    return finish(sk, direction, distance, name, appearance, target)

def curved_profile(axis, offset, start, segments, distance, name, appearance=None):
    sk, direction = plane_sketch(axis, offset, name)
    last = start
    for segment in segments:
        if len(segment) == 2:
            end = segment
            sk.sketchCurves.sketchLines.addByTwoPoints(
                map_point(sk, axis, offset, *last), map_point(sk, axis, offset, *end))
        else:
            mid, end = segment[0:2], segment[2:4]
            sk.sketchCurves.sketchArcs.addByThreePoints(
                map_point(sk, axis, offset, *last), map_point(sk, axis, offset, *mid),
                map_point(sk, axis, offset, *end))
        last = end
    return finish(sk, direction, distance, name, appearance)

def box(x0, y0, z0, x1, y1, z1, name, appearance):
    return polygon('z', z0, [(x0,y0),(x1,y0),(x1,y1),(x0,y1)], z1-z0, name, appearance)

def cylinder(axis, offset, u, v, radius, distance, name, appearance=None, target=None):
    sk, direction = plane_sketch(axis, offset, name)
    sk.sketchCurves.sketchCircles.addByCenterRadius(map_point(sk,axis,offset,u,v),radius/10)
    return finish(sk,direction,distance,name,appearance,target)

def fillet(body, radius, name, predicate=None):
    edges = adsk.core.ObjectCollection.create()
    for edge in body.edges:
        if predicate is None or predicate(edge):
            edges.add(edge)
    if not edges.count:
        return
    try:
        inp = root.features.filletFeatures.createInput()
        inp.edgeSetInputs.addConstantRadiusEdgeSet(edges,V(radius/10),True)
        feat = root.features.filletFeatures.add(inp)
        feat.name = name
    except Exception as e:
        warnings.append(name + ': ' + str(e))

def appearance(name, rgb, preferences):
    source = None
    for lib in app.materialLibraries:
        for wanted in preferences:
            try:
                candidate = lib.appearances.itemByName(wanted)
            except RuntimeError:
                candidate = None
            if candidate:
                source = candidate
                break
        if source:
            break
    if not source:
        source = root.bRepBodies.item(0).appearance if root.bRepBodies.count else None
    if not source:
        for lib in app.materialLibraries:
            if lib.appearances.count:
                source = lib.appearances.item(0)
                break
    result = design.appearances.addByCopy(source,name)
    for propname in ['metallic_base_color','opaque_albedo','generic_diffuse','paint_color']:
        try:
            prop = adsk.core.ColorProperty.cast(result.appearanceProperties.itemById(propname))
        except RuntimeError:
            prop = None
        if prop:
            prop.value = adsk.core.Color.create(*rgb,255)
            break
    else:
        for prop in result.appearanceProperties:
            cp = adsk.core.ColorProperty.cast(prop)
            if cp:
                cp.value = adsk.core.Color.create(*rgb,255)
                break
    return result

def refine_existing():
    """Repair the first generated study without touching other user designs."""
    log('REFINEMENT START')
    bad=[]
    for feat in root.features.extrudeFeatures:
        if feat.name.startswith('Rear skirt wheel arch') and feat.healthState != adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:
            bad.append(feat)
    for feat in reversed(bad):
        feat.deleteMe()
    rear_segments=[b for b in root.bRepBodies if
        abs(b.boundingBox.minPoint.z-28)<0.1 and
        abs(b.boundingBox.maxPoint.z-66)<0.1 and
        b.boundingBox.maxPoint.y-b.boundingBox.minPoint.y<2 and
        b.boundingBox.minPoint.x<424.5 and b.boundingBox.maxPoint.x>505.5]
    for i,body in enumerate(rear_segments):
        cylinder('y',-1100,4650,360,405,2200,'Rear skirt arch repaired '+str(i+1),target=body)
    silver=design.appearances.itemByName('Satin silver lower body')
    purple=design.appearances.itemByName('Ai.R violet body')
    box(-2,-935,355,0,935,835,'Front silver fascia outer skin',silver)
    # Native extruded text on the visible side badge (a typographic approximation).
    try:
        sk,direction=plane_sketch('y',-1048,'Ai.R badge lettering')
        inp=sk.sketchTexts.createInput2('ai.r',22)
        inp.fontName='Arial'
        inp.setAsMultiLine(map_point(sk,'y',-1048,1800,1590),
                           map_point(sk,'y',-1048,2300,1930),
                           adsk.core.HorizontalAlignments.CenterHorizontalAlignment,
                           adsk.core.VerticalAlignments.MiddleVerticalAlignment,0)
        txt=sk.sketchTexts.add(inp)
        feat=root.features.extrudeFeatures.addSimple(txt,V(0.3),NEW)
        feat.name='Ai.R badge raised lettering'
        for b in feat.bodies:
            b.name='Ai.R badge letter'
            b.appearance=purple
        sk.isVisible=False
    except Exception as e:
        warnings.append('Badge lettering: '+str(e))
    root.attributes.add('Robobus','refined','1')
    root.sketches.isLightBulbOn=False
    root.constructionPlanes.isLightBulbOn=False
    cam=app.activeViewport.camera
    cam.eye=point(-7700,-12000,4700)
    cam.target=point(2700,0,1330)
    cam.upVector=adsk.core.Vector3D.create(0,0,1)
    cam.isFitView=True
    cam.isSmoothTransition=False
    app.activeViewport.camera=cam
    app.activeViewport.refresh()
    adsk.doEvents()
    info={'nominal_dimensions_mm':{'length':5500,'width':2050,'height':2650,'wheelbase':3800},
          'body_count':root.bRepBodies.count,'timeline_features':design.timeline.count,
          'detail_basis':'Photographic exterior approximation. Opaque glazing; no engineered interior. Sensors and trim may exceed nominal envelope.',
          'warnings':warnings,'invalid_bodies':[],'feature_warnings':[],
          'rear_skirt_segments_repaired':len(rear_segments)}
    for b in root.bRepBodies:
        if not b.isSolid:
            info['invalid_bodies'].append(b.name)
    for i in range(design.timeline.count):
        ent=design.timeline.item(i).entity
        try:
            if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:
                info['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
        except AttributeError:
            pass
    exp=design.exportManager
    exp.execute(exp.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.f3d')))
    exp.execute(exp.createSTEPExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.step'),root))
    app.activeViewport.saveAsImageFile(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.png'),1800,1200)
    with open(os.path.join(OUT,'model_report.json'),'w',encoding='utf-8') as f:
        json.dump(info,f,indent=2)
    log('REFINEMENT COMPLETE: '+json.dumps(info))
    app.userInterface.messageBox('Exterior model refined and exported.\nFeature warnings: '+str(len(info['feature_warnings'])),
                                 'Robobus model ready')

def run(context):
    global app, design, root
    app = adsk.core.Application.get()
    try:
        os.makedirs(OUT,exist_ok=True)
        log('START')
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            raise RuntimeError('Open an empty Fusion design first.')
        root = design.rootComponent
        if root.bRepBodies.count or root.occurrences.count:
            marker=root.attributes.itemByName('Robobus','refined')
            if app.activeDocument.name.startswith('Punggol Ai.R') and marker and marker.value=='1':
                sk=root.sketches.itemByName('Ai.R badge lettering profile')
                origin=sk.sketchToModelSpace(P(0,0,0))
                right=sk.sketchToModelSpace(P(1,0,0))
                up=sk.sketchToModelSpace(P(0,1,0))
                txt=sk.sketchTexts.item(0)
                txt.isVerticalFlip=up.z<origin.z
                txt.isHorizontalFlip=right.x<origin.x
                marker.value='2'
                design.computeAll()
                app.activeViewport.refresh()
                adsk.doEvents()
                exp=design.exportManager
                exp.execute(exp.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.f3d')))
                exp.execute(exp.createSTEPExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.step'),root))
                app.activeViewport.saveAsImageFile(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.png'),1800,1200)
                log('Badge orientation corrected: '+str((txt.isHorizontalFlip,txt.isVerticalFlip)))
                return
            if (app.activeDocument.name.startswith('Punggol Ai.R') and
                    root.bRepBodies.itemByName('01 Purple body envelope') and
                    not root.attributes.itemByName('Robobus','refined')):
                refine_existing()
                return
            raise RuntimeError('This script requires an empty design and will not overwrite existing work.')
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        app.activeDocument.name = 'Punggol Ai.R - WeRide Robobus - Exterior Study'
        params = [('BusLength',5500,'Published nominal overall length'),
                  ('BusWidth',2050,'Published nominal body width'),
                  ('BusHeight',2650,'Provisional published height; sensor inclusion unverified'),
                  ('Wheelbase',3800,'Published brochure axle spacing'),
                  ('WheelRadiusEstimate',360,'Estimated from reference photograph'),
                  ('FrontOverhangEstimate',850,'Estimated; rear overhang also 850 mm')]
        for name,value,note in params:
            if not design.userParameters.itemByName(name):
                design.userParameters.add(name,adsk.core.ValueInput.createByString(str(value)+' mm'),'mm',note)
        purple = appearance('Ai.R violet body',(111,44,188),['Paint - Enamel Glossy (Yellow)','Paint - Enamel Glossy (White)','Plastic - Glossy (Blue)'])
        glass = appearance('Smoked blue glazing - opaque exterior study',(13,27,44),['Plastic - Glossy (Black)','Paint - Enamel Glossy (Black)'])
        silver = appearance('Satin silver lower body',(164,174,187),['Aluminum - Satin','Aluminum - Anodized Glossy (Grey)','Steel - Satin'])
        black = appearance('Rubber and trim',(20,22,27),['Rubber - Matte','Plastic - Matte (Black)'])
        white = appearance('Lamp lenses and markings',(231,241,255),['Plastic - Glossy (White)','Paint - Enamel Glossy (White)'])
        red = appearance('Rear lamp red',(195,15,32),['Plastic - Glossy (Red)','Paint - Enamel Glossy (Red)'])
        amber = appearance('Amber indicators',(255,144,15),['Plastic - Glossy (Yellow)','Paint - Enamel Glossy (Yellow)'])
        teal = appearance('Sensor teal',(19,178,175),['Plastic - Glossy (Blue)','Paint - Enamel Glossy (White)'])

        # Side silhouette with tangent rounded shoulders; X=front to rear, Z=up.
        hull = curved_profile('y',-1025,(0,260),[
            (5500,260),(5500,2100),(5339,2489,4950,2650),
            (800,2650),(375,2530,175,2180),(0,1100),(0,260)
        ],2050,'01 Purple body envelope',purple)
        # Roll side perimeter edges to soften the cabin corners.
        fillet(hull,85,'02 Rounded cabin side edges',lambda e:
               abs(e.boundingBox.maxPoint.y-e.boundingBox.minPoint.y)<0.001)
        # Native hull faces form the curved front windshield and rear screen.
        for face in hull.faces:
            bb=face.boundingBox
            if bb.maxPoint.y-bb.minPoint.y > 150 and bb.maxPoint.x < 90 and bb.minPoint.z > 105:
                face.appearance=glass
            if bb.minPoint.x > 540 and bb.maxPoint.z > 180:
                face.appearance=glass
        log('Body built')

        skirts=[]
        for sign,label in [(-1,'Left'),(1,'Right')]:
            skirt=box(65,sign*1020-6,280,5435,sign*1020+6,660,label+' silver lower skirt',silver)
            skirts.append(skirt)
        for x,label in [(850,'Front'),(4650,'Rear')]:
            cylinder('y',-1100,x,360,405,2200,label+' wheel arch cut',target=hull)
            # The front cut splits each skirt; choose the surviving rear segment by geometry.
            remaining_skirts=[b for b in root.bRepBodies if
                abs(b.boundingBox.minPoint.z-28)<0.1 and
                abs(b.boundingBox.maxPoint.z-66)<0.1 and
                b.boundingBox.maxPoint.y-b.boundingBox.minPoint.y<2 and
                b.boundingBox.minPoint.x < (x+405)/10 and
                b.boundingBox.maxPoint.x > (x-405)/10]
            for skirt in remaining_skirts:
                cylinder('y',-1100,x,360,405,2200,label+' skirt wheel arch',target=skirt)
        # Large distinctive continuous side windows.
        for sign,label in [(-1,'Left'),(1,'Right')]:
            curved_profile('y',sign*1025,(650,1180),[
                (880,1020,1270,1000),(4590,1000),
                (4980,1110,5220,1490),(5120,2020),
                (4910,2380,4450,2480),(1110,2480),
                (810,2400,640,2180),(590,1570,650,1180)
            ],sign*6,label+' panoramic smoked window',glass)
            # Slim upright glazing mullions.
            for x in [1710,3190,4410]:
                box(x,sign*1033-3,1060,x+28,sign*1033+3,2450,label+' glazing mullion '+str(x),black)
            # Lower side chrome accent between wheels.
            box(1300,sign*1030-3,700,4200,sign*1030+3,717,label+' silver beltline',silver)
            # Door drawn as paired plug-door panels on the boarding side.
            if sign==1:
                box(2500,1029,320,2530,1038,2350,'Boarding door front jamb',black)
                box(3500,1029,320,3530,1038,2350,'Boarding door rear jamb',black)
                box(3000,1032,350,3018,1040,2310,'Double door centre seam',black)
                box(2520,1032,320,3505,1040,350,'Boarding threshold',silver)
                box(3240,1037,980,3380,1051,1020,'Door handle',silver)
            cylinder('y',sign*1041,2050,1750,310,sign*4,label+' pale circular Ai.R badge',white)
            box(520,sign*1032-4,1050,595,sign*1032+4,1080,label+' side indicator',amber)
        log('Glazing and body details built')

        for x,axle in [(850,'Front'),(4650,'Rear')]:
            cylinder('y',-825,x,360,58,1650,axle+' axle',black)
            for sign,side in [(-1,'Left'),(1,'Right')]:
                outer=sign*1015
                tire=cylinder('y',outer,x,360,360,-sign*240,axle+' '+side+' tire',black)
                fillet(tire,28,axle+' '+side+' tire shoulder radius')
                cylinder('y',outer+sign*3,x,360,242,-sign*33,axle+' '+side+' alloy wheel',silver)
                cylinder('y',outer+sign*6,x,360,178,-sign*10,axle+' '+side+' dark wheel centre',black)
                cylinder('y',outer+sign*12,x,360,91,-sign*18,axle+' '+side+' hub',purple)
                for i in range(6):
                    angle=2*math.pi*i/6
                    cylinder('y',outer+sign*14,x+126*math.cos(angle),360+126*math.sin(angle),21,
                             -sign*6,axle+' '+side+' hub bolt '+str(i+1),silver)
        log('Wheels built; wheelbase 3800 mm')

        bumper=box(0,-935,355,150,935,835,'Front silver fascia',silver)
        fillet(bumper,60,'Rounded front fascia')
        box(-2,-935,355,0,935,835,'Front silver fascia outer skin',silver)
        box(-4,-635,625,6,635,745,'Front dark grille band',black)
        for z in [646,678,710]:
            box(-7,-610,z,-3,610,z+7,'Front grille silver strip '+str(z),silver)
        box(-10,-210,385,0,210,490,'Front registration plate backing',black)
        for sign,label in [(-1,'Left'),(1,'Right')]:
            y=sign*775
            lamp=box(-8,y-133,830,80,y+133,940,label+' headlamp housing',black)
            fillet(lamp,24,label+' lamp corner')
            box(-12,y-113,847,-6,y+113,870,label+' LED running light',white)
            for delta in [-58,38]:
                cylinder('x',-13,y+delta,904,25,12,label+' headlamp optic '+str(delta),white)
        # Windshield destination panel placed just ahead of lower glazing.
        box(-7,-660,1110,15,660,1260,'Front destination display',glass)
        box(-10,-265,1167,-7,265,1195,'Destination display light bar',white)
        cylinder('x',-12,0,940,58,18,'Front centre sensor',black)

        rear=box(5360,-940,350,5500,940,790,'Rear silver bumper',silver)
        fillet(rear,45,'Rear bumper rounding')
        for sign,label in [(-1,'Left'),(1,'Right')]:
            box(5495,sign*820-45,860,5506,sign*820+45,1170,label+' rear lamp',red)

        roof=box(1540,-650,2615,3730,650,2690,'Roof equipment fairing - estimated',silver)
        fillet(roof,30,'Roof equipment soft edges')
        for x,label in [(430,'Front'),(5110,'Rear')]:
            for sign,side in [(-1,'Left'),(1,'Right')]:
                y=sign*1020
                box(x-60,min(sign*910,sign*1110),2220,x+60,max(sign*910,sign*1110),2290,label+' '+side+' sensor bracket',purple)
                cylinder('z',2275,x,sign*1110,77,105,label+' '+side+' lidar base',silver)
                cylinder('z',2380,x,sign*1110,70,95,label+' '+side+' lidar dark band',black)
                cylinder('z',2475,x,sign*1110,66,30,label+' '+side+' lidar cap',teal)
        cylinder('z',2650,1050,0,62,95,'Roof GNSS receiver',white)
        log('Sensors built')

        root.sketches.isLightBulbOn=False
        root.constructionPlanes.isLightBulbOn=False
        cam=app.activeViewport.camera
        cam.isSmoothTransition=False
        cam.cameraType=adsk.core.CameraTypes.OrthographicCameraType
        cam.eye=point(-7100,-10200,6100)
        cam.target=point(2600,0,1250)
        cam.upVector=adsk.core.Vector3D.create(0,0,1)
        cam.isFitView=True
        app.activeViewport.camera=cam
        app.activeViewport.refresh()
        adsk.doEvents()

        info={'nominal_dimensions_mm':{'length':5500,'width':2050,'height':2650,'wheelbase':3800},
              'body_count':root.bRepBodies.count,'timeline_features':design.timeline.count,
              'detail_basis':'Photographic exterior approximation. Opaque glazing; no engineered interior. Sensors and trim may exceed nominal envelope.',
              'warnings':warnings,'invalid_bodies':[],'feature_warnings':[]}
        for body in root.bRepBodies:
            if not body.isSolid:
                info['invalid_bodies'].append(body.name)
        for i in range(design.timeline.count):
            ent=design.timeline.item(i).entity
            try:
                if ent.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:
                    info['feature_warnings'].append({'name':ent.name,'message':ent.errorOrWarningMessage})
            except AttributeError:
                pass
        exp=design.exportManager
        exp.execute(exp.createFusionArchiveExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.f3d')))
        exp.execute(exp.createSTEPExportOptions(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.step'),root))
        app.activeViewport.saveAsImageFile(os.path.join(OUT,'Punggol_WeRide_Robobus_v1.png'),1800,1200)
        with open(os.path.join(OUT,'model_report.json'),'w',encoding='utf-8') as f:
            json.dump(info,f,indent=2)
        log('COMPLETE: '+json.dumps(info))
        app.userInterface.messageBox('Robobus exterior study created. Native Fusion archive and STEP saved in:\n'+OUT,
                                     'Punggol WeRide Robobus')
    except:
        log(traceback.format_exc())
        app.userInterface.messageBox(traceback.format_exc(),'Robobus build requires attention')
