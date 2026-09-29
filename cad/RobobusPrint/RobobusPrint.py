"""Printable APAS Robobus v4. Native Fusion BRep construction and STL export.
Run from Fusion Scripts and Add-Ins. Dimensions are millimetres.
Each component has an editable native base feature; rebuild dimensions below.
"""
import adsk.core, adsk.fusion, math, json, os, traceback, importlib.util
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'print_v4')
P=adsk.core.Point3D.create; Vec=adsk.core.Vector3D.create; Mat=adsk.core.Matrix3D.create
def log(s):
    os.makedirs(OUT,exist_ok=True)
    with open(os.path.join(OUT,'build.log'),'a',encoding='utf8') as f:f.write(str(s)+'\n')
def p(x,y,z):return P(x/10,y/10,z/10)
def trans(x=0,y=0,z=0):
    m=Mat();m.translation=Vec(x/10,y/10,z/10);return m
def rot(axis,angle,origin=(0,0,0)):
    m=Mat();m.setToRotation(math.radians(angle),Vec(*axis),p(*origin));return m
def compose(a,b):
    # Return a*b by transforming basis points; avoids API multiplication ambiguity.
    pts=[p(0,0,0),p(10,0,0),p(0,10,0),p(0,0,10)]
    for q in pts:q.transformBy(b);q.transformBy(a)
    m=Mat();m.setWithCoordinateSystem(pts[0],pts[0].vectorTo(pts[1]),pts[0].vectorTo(pts[2]),pts[0].vectorTo(pts[3]));return m
def B(x0,y0,z0,x1,y1,z1):
    assert x1>x0 and y1>y0 and z1>z0,(x0,y0,z0,x1,y1,z1)
    bb=adsk.core.OrientedBoundingBox3D.create(p((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),Vec(1,0,0),Vec(0,1,0),(x1-x0)/10,(y1-y0)/10,(z1-z0)/10)
    return tm.createBox(bb)
def C(axis,u,v,a,b,r,r2=None):
    coords=lambda t:{'x':(t,u,v),'y':(u,t,v),'z':(u,v,t)}[axis]
    return tm.createCylinderOrCone(p(*coords(a)),r/10,p(*coords(b)),(r if r2 is None else r2)/10)
def xf(b,m):
    q=tm.copy(b);assert tm.transform(q,m);return q
def U(*args):
    b=tm.copy(args[0])
    for other in args[1:]:
        if not tm.booleanOperation(b,tm.copy(other),adsk.fusion.BooleanTypes.UnionBooleanType):raise RuntimeError('Union failed')
    return b
def D(b,*cutters):
    b=tm.copy(b)
    for c in cutters:
        if not tm.booleanOperation(b,tm.copy(c),adsk.fusion.BooleanTypes.DifferenceBooleanType):raise RuntimeError('Cut failed')
    return b
def I(a,b):
    t=tm.copy(a)
    return t.volume*1000 if tm.booleanOperation(t,tm.copy(b),adsk.fusion.BooleanTypes.IntersectionBooleanType) else 0
def RR(x0,y0,x1,y1,z0,z1,r):
    return U(B(x0+r,y0,z0,x1-r,y1,z1),B(x0,y0+r,z0,x1,y1-r,z1),*[C('z',x,y,z0,z1,r) for x in (x0+r,x1-r) for y in (y0+r,y1-r)])
def window(x0,z0,x1,z1,y0,y1,r=4):
    # rounded rectangle in XZ
    return xf(RR(x0,z0,x1,z1,-y1,-y0,r),rot((1,0,0),90))
def bow(x,y,z,h,clear=0):
    return U(C('z',x-8,y,z,z+h,5+clear),C('z',x+8,y,z,z+h,5+clear),B(x-8,y-2.5-clear,z,x+8,y+2.5+clear,z+h))
def headed_pin(radius,length):
    b=U(C('z',0,0,0,2,radius+1.5),C('z',0,0,1.5,length+2,radius),C('z',0,0,length-2,length,radius+.35,radius),C('z',0,0,length,length+2,radius,radius-.4))
    return D(b,B(-.4,-radius-1,length-6,.4,radius+1,length+3))
def teeth(x0,x1,y,z,phase=0):
    # 72 axial face dogs; 5-degree pitch with 0.6 mm printable tooth width.
    return [xf(B(x0,y+17,z-.3,x1,y+23,z+.3),rot((1,0,0),phase+k*5,(0,y,z))) for k in range(72)]
def add(name,body,placement=None,printrot=None,quantity=1,notes='',group='hardware',color='purple'):
    log('PART '+name)
    if not body.isSolid or body.lumps.count!=1:raise RuntimeError(name+' is not one connected solid; lumps='+str(body.lumps.count))
    pr=printrot or Mat();native=xf(body,pr);bb=native.boundingBox
    normalize=trans(-bb.minPoint.x*10,-bb.minPoint.y*10,-bb.minPoint.z*10)
    printmap=compose(normalize,pr);native=xf(body,printmap)
    inverse=printmap.copy();inverse.invert()
    assembly=compose(placement or Mat(),inverse)
    o=root.occurrences.addNewComponent(assembly);c=o.component;c.name=name
    bf=c.features.baseFeatures.add();bf.name='Editable printable solid - '+name;bf.startEdit();b=c.bRepBodies.add(native,bf);b.name=name;bf.finishEdit();b=c.bRepBodies.item(0)
    if color in colors:b.appearance=colors[color]
    bb=b.boundingBox;size=[(getattr(bb.maxPoint,a)-getattr(bb.minPoint,a))*10 for a in ('x','y','z')]
    if any(size[i]>[240,210,260][i]+.01 for i in range(3)):raise RuntimeError(name+' exceeds print envelope '+str(size))
    options=design.exportManager.createSTLExportOptions(b,os.path.join(OUT,'stl',name+'.stl'))
    options.unitType=adsk.fusion.DistanceUnits.MillimeterDistanceUnits;options.meshRefinement=adsk.fusion.MeshRefinementSettings.MeshRefinementHigh;options.isBinaryFormat=True;options.sendToPrintUtility=False
    assert design.exportManager.execute(options)
    rec={'id':name,'quantity':quantity,'size_mm':size,'volume_mm3':b.volume*1000,'notes':notes,'group':group,'assembly_transform':assembly.asArray(),'print_transform':printmap.asArray()}
    parts.append(rec);occurrences[name]=o;shapes[name]=body
    return o
def instance(name,placement):
    o=occurrences[name];rec=next(x for x in parts if x['id']==name)
    inv=Mat();inv.setWithArray(rec['print_transform']);inv.invert()
    return root.occurrences.addExistingComponent(o.component,compose(placement,inv))
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

def run(context):
    global app,design,root,tm,colors,parts,occurrences,shapes
    app=adsk.core.Application.get();tm=adsk.fusion.TemporaryBRepManager.get();parts=[];occurrences={};shapes={}
    os.makedirs(os.path.join(OUT,'stl'),exist_ok=True)
    try:
        current=adsk.fusion.Design.cast(app.activeProduct)
        if os.path.isfile(os.path.join(OUT,'audit.flag')) and current and current.rootComponent.attributes.itemByName('PrintV4','Built'):
            design=current;root=design.rootComponent;audit();return
        doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType);doc.name='Robobus v4 - printable hollow demo'
        design=adsk.fusion.Design.cast(app.activeProduct);design.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType;root=design.rootComponent
        colors={n:appearance(n,rgb,['Plastic - Matte (Black)','Paint - Enamel Glossy (Yellow)']) for n,rgb in [('purple',(113,61,169)),('grey',(151,162,170)),('dark',(30,35,44)),('red',(209,54,72)),('blue',(47,123,186)),('green',(37,155,119)),('gold',(229,168,52))]}
        for n,x in [('busLength',600),('busWidth',180),('busHeight',220),('wall',3),('floorThickness',4),('matingClearance',.3),('doorWidth',160),('doorHeight',160),('threshold',40)]:design.userParameters.add(n,adsk.core.ValueInput.createByString(str(x)+' mm'),'mm','Design benchmark; base-feature geometry is rebuilt by RobobusPrint.py')
        # Eight rounded bow-tie joining keys, four at each body seam.
        joins=[(x,y,z) for x in (-100,100) for y,z in [(-125,44),(-45,44),(-168,95),(-168,170)]]
        latchsites=[x for mid in (-200,0,200) for x in (mid-60,mid+60)]
        for idx,(lo,hi) in enumerate([(-300,-100),(-100,100),(100,300)]):
            solid=U(B(lo,-180,36,hi,0,40),B(lo,-180,39,hi,-177,216),B(lo,-3,39,hi,0,216))
            if idx in (0,2):solid=U(solid,B(lo if idx==0 else hi-3,-180,39,lo+3 if idx==0 else hi,0,216))
            if idx==1:solid=D(solid,B(-80,-4,40,80,1,200))
            for x,y,z in joins:
                if lo-.1<=x<=hi+.1:
                    pad=B(max(lo,x-17),y-8,z-8,min(hi,x+17),y+8,z+7)
                    if y==-168:pad=U(pad,B(max(lo,x-17),-180,z-8,min(hi,x+17),y+8,z+7))
                    solid=U(solid,pad)
                    solid=D(solid,bow(x,y,z,8,.3),C('z',x-8,y,z-10,z+9,1.8),C('z',x+8,y,z-10,z+9,1.8))
            for x in latchsites:
                if lo<x<hi:
                    solid=U(solid,B(x-6,-180,198,x+6,-163,227))
                    solid=D(solid,B(x-7,-177,221,x+7,-171,224))
            for x in (-110,110):
                if lo<x<hi:
                    solid=U(solid,B(x-9.7,-34,206,x+9.7,0,216))
                    solid=D(solid,B(x-5.3,-26.3,207,x+5.3,-15.7,217),C('y',x,211,-35,1,1.8))
            if idx==1:
                # Roof-independent front header receiver for L3 and rear receiver for camera.
                solid=U(solid,B(-16,-36,204,16,0,216),B(24,-180,196,48,-146,216))
                solid=D(solid,B(-5.3,-26.3,205,5.3,-15.7,217),C('y',0,210,-37,1,1.8),B(29.7,-168.3,197,42.3,-155.7,217),C('y',36,205,-181,-145,1.8))
                # Manual ramp bus knuckles, axis at Y5 Z36.
                for a,b in [(-75,-60),(-25,-10),(25,40),(60,75)]:solid=U(solid,B(a,-4,31,b,5,40),C('x',5,36,a,b,6))
                solid=D(solid,C('x',5,36,-77,77,2.3))
                for a,b in [(-59.7,-25.3),(-9.7,24.7),(40.3,59.7)]:solid=D(solid,C('x',5,36,a-.3,b+.3,6.3))
                # ToF removable rail slots and ramp stow keeper.
                for x in (-78,78):solid=U(solid,B(x-2,-10,125,x+2,0,145))
                for x in (-78,78):solid=D(solid,B(x-2.4,-8.3,128,x+2.4,-3.7,143))
                solid=U(solid,B(71,-3,147,80,12,154));solid=D(solid,B(70,7,149,81,11,152))
            for x in (-210,210):
                if lo<x<hi:
                    solid=D(solid,C('y',x,32,-181,-168,34),C('y',x,32,-12,1,34))
                    for ya,yb in [(-168,-158),(-22,-12)]:
                        solid=U(solid,B(x-10,ya,25,x+10,yb,42))
                        solid=D(solid,C('y',x,32,ya-1,yb+1,3.3))
            # Reinforce behind cosmetic recesses to retain a 3 mm minimum wall.
            for a,b in [(lo+10,min(hi-10,-86)),(max(lo+10,86),hi-10)]:
                if b-a>10:solid=D(U(solid,window(a,104,b,194,-3.8,-2.9)),window(a,104,b,194,-.8,.5))
            solid=U(solid,window(lo+10,105,hi-10,192,-177.1,-176.2))
            solid=D(solid,window(lo+10,105,hi-10,192,-180.5,-179.2))
            if idx==0:
                for z in (65,88):solid=D(solid,xf(window(-10,z,10,z+12,-4,1,5.5),compose(trans(-300,-90,0),rot((0,0,1),90))))
                for x in range(-280,-120,20):solid=D(solid,window(x,65,x+10,85,-181,-176,3))
            if idx==2:
                endpose=compose(trans(300,-90,0),rot((0,0,1),90))
                solid=U(solid,xf(window(-70,110,70,195,2.8,4,8),endpose))
                solid=D(solid,xf(window(-70,110,70,195,-1,1,8),endpose))
            add(f'{idx+1:02d}_body_'+['rear','centre','front'][idx],solid,notes='Upright on floor underside. Organic supports for hinge/receiver ledges. Hollow bay; keys inserted from roof.',group='body')
            # Three roofs, individually removable with a 0.3 mm skirt clearance.
            lid=U(B(lo+.3,-180,216,hi-.3,0,220),B(lo+3.3,-176.7,209,hi-3.3,-174.7,216.1),B(lo+3.3,-5.3,209,hi-3.3,-3.3,216.1))
            if idx in (0,2):lid=U(lid,B(lo+3.3 if idx==0 else hi-5.3,-176.7,209,lo+5.3 if idx==0 else hi-3.3,-3.3,216.1))
            for x in latchsites:
                if lo<x<hi:
                    lid=D(lid,B(x-6.3,-181,208,x+6.3,-162.7,228))
                    guide=B(x+12,-179,219.5,x+32,-169,227)
                    guide=D(guide,B(x+11,-177,221,x+33,-171,224));lid=U(lid,guide)
            for x in (-110,110):
                if x+24.3>lo and x-24.3<hi:lid=D(lid,B(x-24.3,-40.3,208,x+24.3,1,400))
            if idx==1:lid=D(lid,B(-24.3,-40.3,208,24.3,1,400),B(23.7,-181,208,48.3,-145.7,228))
            add(f'{idx+4:02d}_roof_'+['rear','centre','front'][idx],lid,printrot=rot((1,0,0),180),notes='Outer roof face down; support latch guide recesses. Lift after retracting both printed bolts.',group='roof')
        key=D(bow(0,0,.3,6.4),C('z',-8,0,-1,8,1.8),C('z',8,0,-1,8,1.8))
        add('07_join_key',key,trans(*joins[0]),quantity=8,notes='Rounded bow-tie key. 0.3 mm pocket clearance.',color='gold')
        for q in joins[1:]:instance('07_join_key',trans(*q))
        pin=headed_pin(1.5,19)
        locations=[(x+dx,y,z+8.7) for x,y,z in joins for dx in (-8,8)]
        add('08_key_retaining_pin',pin,compose(trans(*locations[0]),rot((1,0,0),180)),quantity=16,notes='Split barb. Insert downward; coupon first.',color='gold')
        for q in locations[1:]:instance('08_key_retaining_pin',compose(trans(*q),rot((1,0,0),180)))
        bolt=U(B(-6,-176.7,221.3,38,-171.3,223.7),B(34,-176.7,223,38,-171.3,230))
        add('09_roof_sliding_latch',bolt,trans(latchsites[0],0,0),quantity=6,notes='Slide +15 mm in X to unlock. Removable sliding bolt, not a snap latch.',color='gold')
        for x in latchsites[1:]:instance('09_roof_sliding_latch',trans(x,0,0))
        wheel=D(U(C('z',0,0,0,9,32),C('z',0,0,8,11,18)),C('z',0,0,-1,12,3.3))
        wheelposes=[compose(trans(x,y,32),rot((1,0,0),90 if y< -90 else -90)) for x in (-210,210) for y in (-169,-11)]
        add('10_static_wheel',wheel,wheelposes[0],quantity=4,notes='Flat face down; static display wheel.',color='dark')
        for m in wheelposes[1:]:instance('10_static_wheel',m)
        axle=headed_pin(3,26)
        poses=[compose(trans(x,y,32),rot((1,0,0),-90 if y< -90 else 90)) for x in (-210,210) for y in (-182,2)]
        add('11_wheel_axle',axle,poses[0],quantity=4,notes='Printed split-tip axle; head faces outward.',color='grey')
        for m in poses[1:]:instance('11_wheel_axle',m)
        # Removable trays with 5 mm slot grid and printed slide-in retainers.
        for ident,L,W,at in [('12_breadboard_tray',190,85,(-295,-146,52)),('13_electronics_tray',110,90,(135,-150,52))]:
            tray=U(B(0,0,0,L,W,3),B(0,0,0,3,W,8),B(L-3,0,0,L,W,8),B(0,0,0,L,3,8),B(0,W-3,0,L,W,8))
            for x in range(10,int(L)-6,10):
                for y in (8,W-13):tray=D(tray,B(x,y,-1,x+4,y+5,4))
            # Four feet lift tray clear of joining pads and allow finger lift from above.
            for x in (5,L-11):
                for y in (5,W-11):tray=U(tray,B(x,y,-12,x+6,y+6,.2))
            for x in range(10,int(L)-6,10):
                for y in (8,W-13):tray=D(tray,B(x,y,-13,x+4,y+5,4))
            if ident.startswith('12'):tray=D(tray,C('z',187,21,-13,1,3.3))
            add(ident,tray,trans(*at),notes='Tray feet on floor Z40; support under elevated tray floor. Remove roof to extract tray.',group='tray',color='grey')
        clip=U(B(0,0,0,3.4,4.4,5),B(-3,-2,4.5,8,7,7),B(-3,4.7,6,8,6.7,18))
        add('14_tray_adjustable_retainer',clip,trans(-284.7,-137.7,50.5),quantity=8,notes='Move retainers between tray slots; opposing lips accommodate nominal 55 mm breadboard width. Fit coupon first.',color='gold')
        for q in [(-124.7,-137.7,50.5),(145.3,-141.7,50.5),(225.3,-141.7,50.5)]:instance('14_tray_adjustable_retainer',trans(*q))
        for q in [(-281.3,-69.3,50.5),(-121.3,-69.3,50.5),(148.7,-68.3,50.5),(228.7,-68.3,50.5)]:instance('14_tray_adjustable_retainer',compose(trans(*q),rot((0,0,1),180)))
        # Three height-specific detachable laser yokes; pivot is the optical aperture datum.
        for n,x,y,z in [('15_L1_yoke',-110,0,260),('16_L2_yoke',110,0,260),('17_L3_yoke',0,20,280)]:
            baseZ=207 if n!='17_L3_yoke' else 205
            stem=U(B(x-5,-26,baseZ,x+5,-16,z-10),B(x-21,-26,z-34,x+21,y+5,z-26),B(x-21,y-8,z-30,x-17,y+8,z+8),C('x',y,z,x-21,x-17,8),C('x',y,z,x+14.1,x+21,24),B(x+17,-26,z-30,x+21,y+5,z))
            stem=U(stem,*teeth(x+13.3,x+14.1,y,z,2.5));stem=D(stem,C('x',y,z,x-23,x+23,3.3),C('y',x,211 if n!='17_L3_yoke' else 210,-27,-15,1.8))
            add(n,stem,printrot=rot((0,1,0),90),notes='Remove split foot pin to lift from fixed body receiver. Supports required on side-face orientation.',group='laser',color='red')
        # Carrier local aperture at origin; barrel extends backward in local +Z.
        carrier=U(C('z',0,0,0,30,9.4),B(4,-4,0,14,4,10),C('x',0,0,10,13,24),*teeth(13,13.8,0,0))
        carrier=D(carrier,C('z',0,0,-1,31,6.3),C('x',0,0,7.5,15,3.3),C('x',0,0,10,12.1,3.6),B(-.6,6,9,.6,10,31))
        poses=[compose(trans(x,y,z),rot((1,0,0),90-angle)) for x,y,z,angle in [(-110,0,260,60),(110,0,260,60),(0,20,280,45)]]
        add('18_laser_split_carrier_12p6',carrier,poses[0],printrot=rot((0,1,0),-90),quantity=3,notes='12.6 bore for nominal 12 barrel. Split collet compressed by tapered collar. Teeth index at 5 degrees; supports required.',group='laser',color='red')
        for m in poses[1:]:instance('18_laser_split_carrier_12p6',m)
        collar=D(C('z',0,0,0,8,12),C('z',0,0,-.1,8.1,9.7,9.1),B(9.7,-13,-1,13,13,3.3))
        add('19_laser_taper_collar',collar,compose(poses[0],trans(0,0,21)),quantity=3,notes='Notch faces toothed disc. Taper compresses split end approximately 0.3 mm radially. Seat by hand after checking real barrel.',color='gold')
        for m in poses[1:]:instance('19_laser_taper_collar',compose(m,trans(0,0,21)))
        pivot=headed_pin(3,13)
        mounts=[(-87,0,260),(133,0,260),(23,20,280)]
        add('20_laser_pivot_pin',pivot,compose(trans(*mounts[0]),rot((0,1,0),-90)),quantity=3,notes='Short single-sided axle stays outside laser aperture. Withdraw pin to disengage face teeth; reseat at desired 5-degree index.',color='gold')
        for q in mounts[1:]:instance('20_laser_pivot_pin',compose(trans(*q),rot((0,1,0),-90)))
        footpin=headed_pin(1.5,40)
        add('21_mount_foot_pin',footpin,compose(trans(-110,-36,211),rot((1,0,0),-90)),quantity=4,notes='Three laser receiver pins and one camera receiver pin.',color='gold')
        for q in [(110,-36,211),(0,-38,210),(36,-182,205)]:instance('21_mount_foot_pin',compose(trans(*q),rot((1,0,0),-90)))
        # Camera: fixed body receiver, removable mast, lateral arm and adjustable forward rail.
        mast=U(B(30,-168,198,42,-156,390),B(-12,-168,380,42,-150,390))
        mast=D(mast,C('y',36,205,-170,-154,1.8),B(-6.3,-169,382,6.3,-149,388))
        add('22_camera_mast',mast,printrot=rot((1,0,0),90),notes='Lay mast flat; insert foot pin. Mast is roof-independent.',group='camera',color='blue')
        arm=U(B(-6,-175,382.3,6,40,387.7),B(-10,-177,380,10,-169,390))
        for yy in range(-80,31,10):arm=D(arm,C('z',0,yy,381,389,1.8))
        add('23_camera_forward_rail',arm,printrot=rot((0,0,1),90),notes='217 mm rail; index carriage along Y. Collar stop prevents rail falling through mast.',group='camera',color='blue')
        sled=U(B(-28,-20,388,28,20,392),B(-10,-12,379,10,12,389))
        sled=D(sled,B(-6.3,-13,382,6.3,13,388),C('z',0,0,378,394,1.8))
        for xx in (-20,16):sled=D(sled,B(xx,-16,387,xx+4,16,393))
        add('24_camera_platform',sled,trans(0,20,0),notes='Platform top Z392. Set actual optical centre Z400 using camera adjustment/shims. Y20 forward default, Y-60 reference option.',group='camera',color='blue')
        camclip=U(B(0,0,0,3.4,20,4),B(-3,0,3.5,8,20,6),B(5,0,5,8,20,25))
        add('25_camera_sliding_jaw',camclip,trans(-19.7,10,389),quantity=2,notes='Sliding printed clamp jaws; actual camera fit must be checked.',color='gold')
        instance('25_camera_sliding_jaw',compose(trans(19.7,30,389),rot((0,0,1),180)))
        shortpin=headed_pin(1.5,17)
        add('26_camera_index_pin',shortpin,compose(trans(0,20,394),rot((1,0,0),180)),notes='Locks forward rail through platform.',color='gold')
        # Removable ToF bar. Front optical window is a benchmark, not a supplied sensor model.
        tof=U(B(-78,-8,132,78,-4,136),B(-10,-8,134,10,-4,151))
        tof=D(tof,B(-5,-9,136,5,-3,147))
        add('27_ToF_removable_bar',tof,printrot=rot((1,0,0),90),notes='Place ToF optical centre at (0,0,140), use printed retaining cap. Remove bar for boarding/ramp access.',group='sensor',color='green')
        cap=U(B(-13.3,-3,133,13.3,0,153),B(-13.3,-8.3,136.3,-10.3,-2,153),B(10.3,-8.3,136.3,13.3,-2,153))
        cap=D(cap,B(-6,-4,135,6,1,148))
        add('28_ToF_retaining_cap',cap,printrot=rot((1,0,0),90),notes='Estimated sensor envelope. Optical opening stays unobstructed.',color='green')
        build_ramp()
        build_coupons()
        validate_export(doc)
        audit()
    except:
        s=traceback.format_exc();log(s);app.userInterface.messageBox(s,'Printable bus build needs attention')

def build_ramp():
    # Local root hinge X, Y0, Z0; walking face Z4, structural underside Z0.
    first=B(-70,0,0,70,115,4)
    for a,b in [(-59.7,-25.3),(-9.7,24.7),(40.3,59.7)]:first=U(first,C('x',0,0,a,b,6))
    for a,b in [(-70,-45),(-15,15),(45,70)]:first=U(first,C('x',115,6,a,b,5))
    first=D(first,C('x',0,0,-76,76,2.3),C('x',115,6,-72,72,2.3))
    for a,b in [(-75,-60),(-25,-10),(25,40),(60,75)]:first=D(first,C('x',0,0,a-.3,b+.3,6.3))
    for a,b in [(-44.7,-15.3),(15.3,44.7)]:first=D(first,C('x',115,6,a-.3,b+.3,5.3))
    # Grip grooves are cuts, not disconnected detail bodies.
    for y in range(15,103,12):first=D(first,B(-62,y,3.4,62,y+1.2,5))
    second=B(-70,115,0,70,220,4)
    for a,b in [(-44.7,-15.3),(15.3,44.7)]:second=U(second,C('x',115,6,a,b,5))
    second=D(second,C('x',115,6,-72,72,2.3))
    for a,b in [(-70,-45),(-15,15),(45,70)]:second=D(second,C('x',115,6,a-.3,b+.3,5.3))
    # Tip underside relief: shallow inclined plane represented by rotated cutter.
    cutter=xf(B(-72,-30,-20,72,2,0),compose(trans(0,220,4),rot((1,0,0),math.degrees(math.atan(.2)))))
    second=D(second,cutter)
    for y in range(123,212,12):second=D(second,B(-62,y,3.4,62,y+1.2,5))
    # Butt faces resist downward folding when deployed; hinge permits folding upward.
    for x in (-65,60):
        first=U(first,B(x,108,-2,x+5,115,1))
        second=U(second,B(x,115.3,-2,x+5,122,1))
    theta=math.degrees(math.asin(36/math.hypot(220,4))+math.atan2(4,220))
    pose=compose(trans(0,5,36),rot((1,0,0),-theta))
    add('29_ramp_inner',first,pose,notes='Print walking surface down; supports beneath knuckles. Fold outer half upward before lifting assembly.',group='ramp',color='grey',printrot=rot((1,0,0),180))
    add('30_ramp_outer',second,pose,notes='Print walking surface down. Deployed upper length of two halves: 220 mm. Tapered tip.',group='ramp',color='grey',printrot=rot((1,0,0),180))
    pin=headed_pin(2,154)
    add('31_ramp_root_pin',pin,compose(trans(-77,5,36),rot((0,1,0),90)),printrot=rot((1,0,0),90),notes='Long split-tip pin; print horizontal with supports. Do not load ramp with heavy objects.',color='gold')
    pin2=headed_pin(2,144);q=p(-72,115,6);q.transformBy(pose)
    add('32_ramp_fold_pin',pin2,compose(trans(q.x*10,q.y*10,q.z*10),rot((0,1,0),90)),printrot=rot((1,0,0),90),notes='Manual fold hinge pin.',color='gold')
    latch=U(B(0,0,0,30,3.4,2.4),B(25,0,0,30,3.4,8))
    add('33_ramp_stow_latch',latch,trans(55,7.3,149.3),notes='Slide across folded ramp edge to retain upright packet. Remove ToF bar first. Slide +20 mm X to retract.',color='gold')
    root.attributes.add('PrintV4','RampAngleDegrees',str(theta))

def build_coupons():
    for gap in (.2,.3,.4):
        cup=D(B(-18,-10,0,18,10,10),bow(0,0,3,8,gap))
        add('C01_joint_'+str(gap).replace('.','p'),cup,trans(600+gap*100,0,0),notes='Test with 07_join_key before large body prints.',group='coupon',color='gold')
    for dia in (12,12.2,12.4,12.6,12.8):
        cup=D(C('z',0,0,0,8,10),C('z',0,0,-1,9,dia/2))
        add('C02_laser_bore_'+str(dia).replace('.','p'),cup,trans(600+dia*10,50,0),notes='Measure real laser, select slip-fit bore before carrier printing.',group='coupon',color='gold')
    latch=D(B(0,0,0,25,12,8),B(-1,3,2,26,9,5))
    add('C03_roof_latch_channel',latch,trans(600,100,0),notes='Use 09 latch tongue: 5.4 wide x 2.4 high in 6 x 3 channel.',group='coupon',color='gold')
    hinge=D(C('z',0,0,0,12,6),C('z',0,0,-1,13,2.3))
    add('C04_hinge_bore_4p6',hinge,trans(640,100,0),notes='Use a short pin coupon to check nominal 4 mm hinge pin.',group='coupon',color='gold')
    add('C05_short_hinge_pin',headed_pin(2,15),trans(680,100,0),notes='Check bore and split-barb fit.',group='coupon',color='gold')

def validate_export(doc):
    report={'parts':parts,'invalid':[],'feature_warnings':[],'units':'mm','printer_envelope_mm':[240,210,260],'material':'PLA','nozzle_mm':.4,'layer_mm':.2,'perimeters':4,'nominal_breadboard_mm':[165,55],'nominal_laser_mm':[12,30],'scope':'Manually operated demonstrator; not a load-bearing passenger ramp.'}
    for o in root.occurrences:
        for b in o.component.bRepBodies:
            if not b.isSolid or b.lumps.count!=1:report['invalid'].append(o.name)
    for i in range(design.timeline.count):
        e=design.timeline.item(i).entity
        if hasattr(e,'healthState') and e.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:report['feature_warnings'].append(e.name)
    if report['invalid'] or report['feature_warnings']:raise RuntimeError(json.dumps(report))
    for name,o in occurrences.items():
        if name.startswith('C'):o.isLightBulbOn=False
    root.attributes.add('PrintV4','Manifest',json.dumps(report));root.attributes.add('PrintV4','Built','1')
    with open(os.path.join(OUT,'parts_manifest.json'),'w') as f:json.dump(report,f,indent=2)
    def view(path):
        c=app.activeViewport.camera;c.cameraType=adsk.core.CameraTypes.OrthographicCameraType;c.eye=p(1050,1000,700);c.target=p(0,-40,170);c.upVector=Vec(0,0,1);c.isFitView=True;app.activeViewport.camera=c;app.activeViewport.refresh();adsk.doEvents();app.activeViewport.saveAsImageFile(os.path.join(OUT,path),1800,1200)
    view('assembled.png')
    originals=[]
    for o in root.occurrences:
        if o.component.name.startswith(('04','05','06')):
            originals.append((o,o.transform2.copy()));o.transform2=compose(trans(0,80,100),o.transform2)
    view('roof_access.png')
    for o,m in originals:o.transform2=m
    originals=[]
    for o in root.occurrences:
        name=o.component.name
        if name.startswith(('01','04')):delta=(-100,0,50 if name.startswith('04') else 0)
        elif name.startswith(('03','06')):delta=(100,0,50 if name.startswith('06') else 0)
        elif name.startswith('05'):delta=(0,0,150)
        else:continue
        originals.append((o,o.transform2.copy()));o.transform2=compose(trans(*delta),o.transform2)
    view('exploded.png')
    for o,m in originals:o.transform2=m
    # Separate preview of the manual stow sequence; sensing bar is removed first.
    originals=[];hidden=[]
    theta=float(root.attributes.itemByName('PrintV4','RampAngleDegrees').value)
    pose=compose(trans(0,5,36),rot((1,0,0),-theta));inv=pose.copy();inv.invert()
    fold=compose(pose,compose(rot((1,0,0),180,(0,115,6)),inv))
    lift=rot((1,0,0),90+theta,(0,5,36))
    for o in root.occurrences:
        name=o.component.name
        if name.startswith(('27','28')):hidden.append(o);o.isLightBulbOn=False
        if name.startswith(('29','30','32')):
            originals.append((o,o.transform2.copy()));m=compose(lift,fold) if name.startswith('30') else lift;o.transform2=compose(m,o.transform2)
    view('ramp_stowed.png')
    for o,m in originals:o.transform2=m
    for o in hidden:o.isLightBulbOn=True
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Assembled printable demo'
    view('assembled.png')
    export=design.exportManager
    assert export.execute(export.createFusionArchiveExportOptions(os.path.join(OUT,'Robobus_v4_Printable.f3d')))
    assert export.execute(export.createSTEPExportOptions(os.path.join(OUT,'Robobus_v4_Assembled.step'),root))
    log('COMPLETE '+str(len(parts))+' unique printable parts; native exports saved')

def audit():
    bodies=[]
    for o in root.occurrences:
        if o.component.name.startswith('C'):continue
        for b in o.component.bRepBodies:bodies.append((o.name,tm.copy(b.createForAssemblyContext(o))))
    def overlaps(a,b):
        x=a.boundingBox;y=b.boundingBox
        return all(getattr(x.minPoint,k)<getattr(y.maxPoint,k)-.0001 and getattr(y.minPoint,k)<getattr(x.maxPoint,k)-.0001 for k in ('x','y','z'))
    hits=[]
    for i,(na,a) in enumerate(bodies):
        for nb,b in bodies[i+1:]:
            if overlaps(a,b):
                vol=I(a,b)
                if vol>.02:hits.append({'a':na,'b':nb,'mm3':round(vol,4)})
    report={'static_intersections':hits,'body_count':len(bodies),'tests':[]}
    # Check tray lift and roofs with bolts retracted; only fixed body/supports constrain extraction.
    fixed=[(n,b) for n,b in bodies if n.startswith(('01','02','03','15','16','17','22'))]
    for n,b in bodies:
        if n.startswith(('04','05','06','12','13')):
            for y,z in ([(0,z) for z in (5,10,20,30,60,100)]+[(y,100) for y in (20,40,60,80)] if n.startswith(('04','05','06')) else [(0,z) for z in (5,30,140,220)]):
                moved=xf(b,trans(0,y,z));coll=[]
                for fn,f in fixed:
                    if overlaps(moved,f):
                        vol=I(moved,f)
                        if vol>.02:coll.append({'body':fn,'mm3':round(vol,3)})
                report['tests'].append({'part':n,'lift_mm':z,'forward_mm':y,'intersections':coll})
    def test_moved(label,moving,obstacles):
        coll=[]
        for n,a in moving:
            for fn,b in obstacles:
                if overlaps(a,b):
                    v=I(a,b)
                    if v>.02:coll.append({'moving':n,'fixed':fn,'mm3':round(v,3)})
        report['tests'].append({'motion':label,'intersections':coll})
    # Tooth-index positions; collars rotate together with carriers.
    for i,(x,y,z,start) in enumerate([(-110,0,260,60),(110,0,260,60),(0,20,280,45)],1):
        moving=[(n,b) for n,b in bodies if n in ('18_laser_split_carrier_12p6:'+str(i),'19_laser_taper_collar:'+str(i))]
        obstacles=[(n,b) for n,b in bodies if n.startswith(('01','02','03','04','05','06','15','16','17','22'))]
        for angle in range(40,86,5):test_moved(f'L{i} tilt {angle}',[(n,xf(b,rot((1,0,0),start-angle,(x,y,z)))) for n,b in moving],obstacles)
    theta=float(root.attributes.itemByName('PrintV4','RampAngleDegrees').value)
    pose=compose(trans(0,5,36),rot((1,0,0),-theta));inv=pose.copy();inv.invert()
    inner=next(b for n,b in bodies if n.startswith('29_'));outer=next(b for n,b in bodies if n.startswith('30_'))
    fixed_ramp=[(n,b) for n,b in bodies if n.startswith(('01','02','03','04','05','06','10','12','13'))]
    for angle in range(0,181,10):
        folded=xf(outer,compose(pose,compose(rot((1,0,0),angle,(0,115,6)),inv)))
        test_moved('ramp outer fold '+str(angle),[('outer',folded)],fixed_ramp+[('inner',inner)])
    folded=xf(outer,compose(pose,compose(rot((1,0,0),180,(0,115,6)),inv)))
    for angle in list(range(0,101,10))+[90+theta]:
        m=rot((1,0,0),min(angle,90+theta),(0,5,36))
        test_moved('ramp packet lift '+str(angle),[('inner',xf(inner,m)),('outer',xf(folded,m))],fixed_ramp)
    m=rot((1,0,0),90+theta,(0,5,36))
    test_moved('ramp stowed with latch locked',[('inner',xf(inner,m)),('outer',xf(folded,m))],[(n,b) for n,b in bodies if n.startswith('33')])
    # Camera bracket travel, including intermediate positions.
    camera=[(n,b) for n,b in bodies if n.startswith(('24','25','26'))]
    for y in range(-60,21,10):test_moved('camera Y '+str(y),[(n,xf(b,trans(0,y-20,0))) for n,b in camera],[(n,b) for n,b in bodies if n.startswith(('01','02','03','04','05','06','15','16','17','18','22','23'))])
    with open(os.path.join(OUT,'assembly_audit.json'),'w') as f:json.dump(report,f,indent=2)
    log('AUDIT '+str(len(hits))+' static intersections; inspect assembly_audit.json')

