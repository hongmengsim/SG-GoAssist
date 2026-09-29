"""Printable APAS Robobus v5. Native Fusion BRep construction and STL export.
Run from Fusion Scripts and Add-Ins. Dimensions are millimetres.
Each component has an editable native base feature; rebuild dimensions below.
"""
import adsk.core, adsk.fusion, math, json, os, traceback, importlib.util
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'print_v5')
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

def tinykey(x,y,z,h,gap=0):
    return U(C('z',x-5,y,z,z+h,2.7+gap),C('z',x+5,y,z,z+h,2.7+gap),B(x-5,y-1.7-gap,z,x+5,y+1.7+gap,z+h))

def gusset(x0,x1,ywall,yend,z0,top):
    # Continuous 45-degree underside, no staircase overhangs.
    direction=1 if yend>ywall else -1
    a,b=sorted((ywall,yend))
    cutter=xf(B(x0-1,-100,-100,x1+1,100,0),compose(trans(0,ywall,z0),rot((1,0,0),45*direction)))
    return D(B(x0,a,z0,x1,b,top),cutter)

def mount_socket(x,base=116):
    s=gusset(x-4,x+4,0,-8,base-10,base+7.8)
    return D(s,B(x-1.8,-6.3,base,x+1.8,-1.7,base+9),C('y',x,base+3,-9,1,1.5))

def make_body(coarse=False):
    for idx,(lo,hi) in enumerate([(-150,0),(0,150)]):
        b=U(B(lo,-110,18.2,hi,0,20),B(lo,-110,19.8,hi,-108.6,123.8),B(lo,-1.4,19.8,hi,0,123.8))
        b=U(b,B(lo if idx==0 else hi-1.4,-110,19.8,lo+1.4 if idx==0 else hi,0,123.8))
        b=D(b,B(-40,-9,20,40,1,125))
        if not coarse:
            for y in (-97,-60,-20):
                b=U(b,B(max(lo,-10),y-4.5,18.2,min(hi,10),y+4.5,24))
                b=D(b,tinykey(0,y,20,5,.3))
            x=(-70 if idx==0 else 70)+14.8
            b=D(U(b,mount_socket(x)),C('y',x,119,-9,1,1.5))
            # Two sockets receive the fixed, removable entrance header.
            px=-45 if idx==0 else 45
            s=gusset(px-5,px+5,0,-8,99,120)
            s=D(s,B(px-3.3,-5.3,109.7,px+3.3,.3,121))
            b=D(U(b,s),B(px-3.3,-5.3,109.7,px+3.3,.3,121),B(-48.3,-5.3,119.7,48.3,.3,125))
            # Camera socket straddles seam; support grows from rear wall.
            s=gusset(max(lo,-6),min(hi,6),-110,-98.3,98,123.8)
            s=D(s,B(-4.3,-108.3,112,4.3,-99.7,125),C('y',0,117,-111,-97,1.5))
            b=D(U(b,s),B(-4.3,-108.3,112,4.3,-99.7,125),C('y',0,117,-111,-97,1.5))
            for cx in ((-120,-30) if idx==0 else (30,120)):
                b=U(b,gusset(cx-3,cx+3,-110,-111,118.5,121))
            # Tray supports grow directly from the floor, away from slots and keys.
            for tx,ty,L,W in [(-145,-102,175,65),(35,-102,110,90)]:
                for xx in (tx+5,tx+L-9):
                    for yy in (ty+10,ty+W-14):
                        if lo+.1<xx<hi-4:b=U(b,B(xx,yy,20,xx+4,yy+4,24))
            wx=-105 if idx==0 else 105
            for ya,yb in [(-110,-107.2),(-2.8,0)]:
                b=U(b,B(wx-4,ya,18.2,wx+4,yb,27))
                b=D(b,C('y',wx,22,ya-1,yb+1,1.8))
            if idx==0:
                endpose=compose(trans(-150,-55,0),rot((0,0,1),90))
                for z in (35,55):b=D(b,xf(window(-10,z,10,z+12,-2,2,5.5),endpose))
                for xx in range(-135,-45,15):b=D(b,window(xx,44,xx+5,58,-111,-108,2))
            # Fine raised window outlines inside the wall silhouette, print as short bridges.
            # Exterior decoration is intentionally omitted rather than thinning the enclosure.
        add(f'{idx+1:02d}_body_'+['rear','front'][idx],b,group='body',notes='Floor directly on bed; no supports. Nominal 1.4 mm walls, 1.8 mm floor.')
        lid=B(lo+.3,-110,123.8,hi-.3,0,125)
        if not coarse:
            lid=U(lid,B(lo+2,-108.3,120.3,hi-2,-106.9,123.9),B(lo+2,-3.1,120.3,hi-2,-1.7,123.9))
            edge=lo+1.7 if idx==0 else hi-3.1
            lid=U(lid,B(edge,-108.3,120.3,edge+1.4,-1.7,123.9))
            # Clearance for fixed doorway header, laser supports and rear camera mast.
            lid=D(lid,B(-50,-35,119,50,1,127),B(-6.3,-111,119,6.3,-98,127))
            for lx in (-70,70):
                if lx+24>lo and lx-11<hi:lid=D(lid,B(lx-11,-35,119,lx+24,1,127))
            for cx in ((-120,-30) if idx==0 else (30,120)):lid=D(lid,B(cx-2.8,-106.9,119,cx+2.8,-105.1,127))
        add(f'{idx+3:02d}_roof_'+['rear','front'][idx],lid,printrot=rot((1,0,0),180),group='roof',notes='Exterior face flat on bed; skirts grow upward; no supports.')

def slope_sides(body,x,y):
    return D(body,xf(B(-100,0,-1,100,100,35),compose(trans(x,y,0),rot((0,0,1),45))),xf(B(-100,-100,-1,100,0,35),compose(trans(x,-y,0),rot((0,0,1),-45))))

def laser_carrier():
    head=slope_sides(B(9,-3,5.5,10.7,3,19.5),9,2.1)
    rail=U(B(7,-1.8,5.5,9,1.8,19.5),head)
    rail=D(rail,xf(B(-100,-5,-100,100,5,0),compose(trans(7,0,4.5),rot((0,1,0),-45))))
    b=U(C('z',0,0,0,30,8.2),rail)
    return D(b,C('z',0,0,-1,31,6.3),C('x',0,0,6.2,14,2.3),B(-.6,6,10,.6,9,31))

def laser_adapter():
    b=U(C('x',0,0,11.3,13,10),B(8.2,-4.5,4,13,4.5,20))
    slot=slope_sides(B(7.9,-3.3,5.5,11,3.3,21),8.7,2.1)
    return D(b,slot,B(7.9,-2.1,5.5,8.7,2.1,21),C('x',0,0,6.3,18,2.3))

def yoke(x,y,z,base):
    b=U(B(x+13.3,-6,base,x+16.3,-2,z-7),B(x+13.3,-6,z-12,x+16.3,y+3,z),C('x',y,z,x+13.3,x+16.3,10))
    return D(b,C('x',y,z,x+12,x+18,2.3),C('y',x+14.8,base+3,-7,-1,1.4))

def coarse_mounts():
    add('15_L1_yoke',yoke(-70,0,155,116),printrot=rot((0,1,0),90),quantity=3,group='laser',color='red')
    add('18_laser_carrier',laser_carrier(),compose(trans(-70,0,155),rot((1,0,0),30)),printrot=rot((0,1,0),-90),quantity=3,group='laser',color='red')

def fixtures():
    key=tinykey(0,0,.3,3.4)
    add('05_join_key',key,trans(0,-97,20),quantity=3,color='gold',notes='Three removable floor keys, 0.3 mm clearance per mating face.')
    for y in (-60,-20):instance('05_join_key',trans(0,y,20))
    # Printed U clip: hook below outside keeper and inner leg through roof slot.
    clip=U(B(-2.5,-112.5,117.8,2.5,-111.3,126.5),B(-2.5,-112.5,125.3,2.5,-105.4,126.5),B(-2.5,-106.6,120,2.5,-105.4,126.5),B(-2.5,-111.4,117.8,2.5,-110.7,118.3))
    add('06_roof_clip',clip,trans(-120,0,0),quantity=4,printrot=rot((0,1,0),90),color='gold',notes='Flex outside leg outward to release hook, then lift. Print on side, without supports.')
    for x in (-30,30,120):instance('06_roof_clip',trans(x,0,0))
    header=U(B(-48,-5,120,48,0,124),B(-48,-5,110,-42,0,121),B(42,-5,110,48,0,121),B(10.8,-8,122,18.8,0,132.8))
    header=D(header,B(13,-6.3,125,16.6,-1.7,134),C('y',14.8,128,-9,1,1.5))
    add('07_fixed_sensor_header',header,printrot=rot((1,0,0),-90),group='sensor',color='purple',notes='Fixed header defines doorway top Z120; two feet seat in body jamb sockets.')
    wheel=D(C('z',0,0,0,2.4,22),C('z',0,0,-1,4,1.8))
    poses=[compose(trans(x,y,22),rot((1,0,0),90 if y< -50 else -90)) for x in (-105,105) for y in (-110.3,.3)]
    add('08_static_wheel',wheel,poses[0],quantity=4,color='dark')
    for m in poses[1:]:instance('08_static_wheel',m)
    pin=U(C('z',0,0,0,1.2,3),C('z',0,0,1,8.5,1.5),C('z',0,0,7,8.5,1.8,1.5));pin=D(pin,B(-.4,-2,4,.4,2,9))
    poses=[compose(trans(x,y,22),rot((1,0,0),-90 if y< -50 else 90)) for x in (-105,105) for y in (-113.9,3.9)]
    add('09_wheel_pin',pin,poses[0],quantity=4,color='gold')
    for m in poses[1:]:instance('09_wheel_pin',m)
    # Open lattice trays: no raised print floor or support waste.
    traydata=[('10_breadboard_tray',175,65,-145,-102),('11_controller_tray',110,90,35,-102)]
    for name,L,W,x,y in traydata:
        tray=U(B(0,0,0,L,W,1.2),B(0,0,0,1.2,W,3),B(L-1.2,0,0,L,W,3))
        mid=L/2
        for a,b in [(15,mid-4),(mid+4,L-15)]:tray=D(tray,B(a,16,-1,b,W-16,2))
        for xx in range(10,int(L)-9,10):
            for ya,yb in [(0,5),(W-5,W)]:tray=D(tray,B(xx,ya,-1,xx+4,yb,2))
        add(name,tray,trans(x,y,24),group='tray',color='grey',notes='Flat lattice tray. Floor top Z25.2, at least 60 mm clear above it.')
    ret=U(B(0,0,0,3.4,4.4,3),B(-2,-1,2.7,6,4.4,4.2),B(-2,2.7,4,6,4.4,10))
    poses=[]
    for _,L,W,x,y in traydata:
        for xx in (10,int((L-15)//10)*10):
            poses += [trans(x+xx+.3,y+.3,22.5),compose(trans(x+xx+3.7,y+W-.3,22.5),rot((0,0,1),180))]
    add('12_tray_retainer',ret,poses[0],quantity=8,printrot=rot((1,0,0),-90),color='gold')
    for m in poses[1:]:instance('12_tray_retainer',m)

def sensors():
    for name,x,y,z,base in [('15_L1_yoke',-70,0,155,116),('16_L2_yoke',70,0,155,116),('17_L3_yoke',0,10,170,125)]:
        add(name,yoke(x,y,z,base),printrot=rot((0,1,0),90),group='laser',color='red',notes='Flat-printing side plate; support attaches to fixed structure.')
    poses=[compose(trans(x,y,z),rot((1,0,0),90-angle)) for x,y,z,angle in [(-70,0,155,60),(70,0,155,60),(0,10,170,45)]]
    add('13_laser_pivot_adapter',laser_adapter(),poses[0],quantity=3,printrot=rot((0,1,0),90),group='laser',color='red',notes='Flat disc face on bed. Sleeve T-rail slides into channel; pivot pin fixes axial seating.')
    for m in poses[1:]:instance('13_laser_pivot_adapter',m)
    add('18_laser_carrier',laser_carrier(),poses[0],quantity=3,group='laser',color='red',notes='Print aperture down. 12.6 mm split bore for nominal 12 x 30 barrel. Front aperture is pivot datum.')
    for m in poses[1:]:instance('18_laser_carrier',m)
    collar=D(C('z',0,0,0,8,10),C('z',0,0,-.1,8.1,8.5,7.9))
    add('19_laser_collar',collar,compose(poses[0],trans(0,0,21)),quantity=3,color='gold',notes='Tapered compression collar; intentional elastic overlap with split sleeve.')
    for m in poses[1:]:instance('19_laser_collar',compose(m,trans(0,0,21)))
    # Wedge-tensioned pivot pins. Axle ends outside the optical bore.
    pin=U(C('z',0,0,0,1.5,3.6),C('z',0,0,1.3,11.5,2))
    pin=D(pin,B(-2.5,-.7,6,2.5,.7,7.7))
    pinposes=[compose(trans(x+17.8,y,z),compose(rot((1,0,0),a),compose(rot((0,1,0),-90),rot((0,0,1),90)))) for x,y,z,a in [(-70,0,155,30),(70,0,155,30),(0,10,170,45)]]
    add('20_pivot_pin',pin,pinposes[0],quantity=3,color='gold',notes='Insert from outer yoke face, then fit radial locking wedge behind carrier disc.')
    for m in pinposes[1:]:instance('20_pivot_pin',m)
    wedge=B(-8,-.6,6.5,8,.6,8.6)
    # Top is a shallow 1:12 taper, cut from 1.8 to 0.8 mm thickness.
    cutter=xf(B(-20,-2,0,20,2,5),compose(trans(0,0,7.8),rot((0,1,0),math.degrees(math.atan(1/12)))))
    wedge=D(wedge,cutter)
    add('21_pivot_wedge',wedge,compose(pinposes[0],trans(-4,0,0)),quantity=3,printrot=rot((1,0,0),90),color='gold',notes='Shown loose. Seat gently to take up axial clearance and clamp pivot friction; remove before adjusting angle.')
    for m in pinposes[1:]:instance('21_pivot_wedge',compose(m,trans(-4,0,0)))
    foot=headed_pin(1.2,16)
    fps=[compose(trans(x,y,z),rot((1,0,0),-90)) for x,y,z in [(-55.2,-10,119),(84.8,-10,119),(14.8,-10,128),(0,-112,117)]]
    add('22_mount_pin',foot,fps[0],quantity=4,color='gold')
    for m in fps[1:]:instance('22_mount_pin',m)
    mast=U(B(-4,-108,112,4,-100,212),B(-4,-108,204,4,25,212))
    mast=D(mast,C('y',0,117,-109,-99,1.5))
    for yy in (-30,-20,-10,0,10):mast=D(mast,C('z',0,yy,203,213,1.5))
    add('23_camera_mast_rail',mast,printrot=rot((0,1,0),90),group='camera',color='blue',notes='Flat L section. Socket crosses body seam; camera benchmark Z220.')
    platform=U(B(-22,-14,212.3,22,14,214.3),B(-6.3,-14,201.7,-4.3,14,214.3),B(4.3,-14,201.7,6.3,14,214.3),B(-6.3,-14,201.7,6.3,14,203.7))
    platform=D(platform,C('z',0,0,200,216,1.5))
    for xx in (-16,12):platform=D(platform,B(xx,-10,211,xx+4,10,216))
    add('24_camera_platform',platform,trans(0,10,0),printrot=rot((1,0,0),90),group='camera',color='blue',notes='Platform top Z214.3; adjust real lens 5.7 mm above it for Z220. Prints on rail-channel end.')
    jaw=U(B(0,0,0,3.4,8,3),B(-2,0,2.7,5.4,8,4),B(4,0,3.7,5.4,8,12))
    add('25_camera_jaw',jaw,trans(-15.7,6,211.6),quantity=2,printrot=rot((1,0,0),90),color='gold');instance('25_camera_jaw',compose(trans(15.7,14,211.6),rot((0,0,1),180)))
    cp=headed_pin(1.2,17)
    add('26_camera_index_pin',cp,compose(trans(0,10,216.3),rot((1,0,0),180)),color='gold')
    bar=U(B(-39.7,-3,69,39.7,0,72),B(-9,-3,70,9,0,84))
    bar=D(bar,B(-5,-4,72,5,1,80))
    add('27_ToF_bar',bar,printrot=rot((1,0,0),-90),group='sensor',color='green',notes='Removable sensing-only doorway bar, optical centre (0,0,75).')
    cap=U(B(-11.3,.3,70,11.3,1.5,85),B(-11.3,-3.3,72.3,-9.3,1,85),B(9.3,-3.3,72.3,11.3,1,85))
    cap=D(cap,B(-5.5,-1,71.5,5.5,2,80.5))
    add('28_ToF_cap',cap,printrot=rot((1,0,0),-90),group='sensor',color='green')
    # Two slide-on end clips couple the removable ToF bar to doorway jambs.
    hanger=U(B(-39.7,-4.5,65,-38.5,1.5,73.5),B(-46,-4.5,65,-38.5,-3.3,73.5),B(-46,.3,65,-38.5,1.5,73.5))
    hanger=D(hanger,B(-40,-3.3,68.7,-38.2,.3,72.3))
    add('29_ToF_jamb_clip',hanger,quantity=2,printrot=rot((0,1,0),90),color='green')
    instance('29_ToF_jamb_clip',rot((0,0,1),180,(0,-1.5,0)))

def coupons():
    for i,g in enumerate((.2,.3,.4)):
        b=D(B(-10,-4.5,0,10,4.5,5),tinykey(0,0,1,5,g))
        add('C01_key_'+str(g).replace('.','p'),b,trans(300+i*30,0,0),group='coupon',color='gold')
    for i,d in enumerate((12,12.2,12.4,12.6,12.8)):
        b=D(C('z',0,0,0,3,d/2+1.4),C('z',0,0,-1,4,d/2))
        add('C02_bore_'+str(d).replace('.','p'),b,trans(300+i*22,30,0),group='coupon',color='gold')
    b=D(C('z',0,0,0,3,5),C('z',0,0,-1,4,2.3))
    add('C03_pivot_fit',b,trans(300,60,0),group='coupon',color='gold',notes='Test with one assembly pivot pin; add two coupons to represent two plates.',quantity=2)
    # Flat protractor with 5-degree radial grooves; 45 and 60 have longer marks.
    gauge=D(C('z',0,0,0,1.2,23),C('z',0,0,-1,2,18),B(-25,-25,-1,25,0,2),B(-25,-1,-1,0,25,2))
    gauge=U(gauge,B(0,0,0,23,2,1.2),B(0,0,0,2,23,1.2))
    for a in range(40,86,5):gauge=D(gauge,xf(B(17.8 if a in (45,60) else 20,-.25,.7,24,.25,2),rot((0,0,1),a)))
    add('C04_angle_gauge',gauge,trans(340,60,0),group='coupon',color='gold',notes='Quadrant gauge: marks 40 to 85 degrees every 5; longer marks 45 and 60. Use horizontal reference edge.')

def export_all(doc,coarse):
    invalid=[]
    for o in root.occurrences:
        for b in o.component.bRepBodies:
            if not b.isSolid or b.lumps.count!=1:invalid.append(o.name)
    warnings=[]
    for i in range(design.timeline.count):
        e=design.timeline.item(i).entity
        if hasattr(e,'healthState') and e.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState:warnings.append(e.name)
    assert not invalid and not warnings,(invalid,warnings)
    report={'parts':parts,'units':'mm','invalid':invalid,'feature_warnings':warnings,'coarse':coarse,'printer_envelope_mm':[240,210,260],'layer_mm':.24,'perimeters':3,'infill_percent':10,'material':'PLA','support_material':False}
    with open(os.path.join(OUT,'parts_manifest.json'),'w') as f:json.dump(report,f,indent=2)
    for o in root.occurrences:
        if o.component.name.startswith('C'):o.isLightBulbOn=False
    root.attributes.add('PrintV5','Built','1')
    def view(name):
        c=app.activeViewport.camera;c.cameraType=adsk.core.CameraTypes.OrthographicCameraType;c.eye=p(550,600,400);c.target=p(0,-20,100);c.upVector=Vec(0,0,1);c.isFitView=True;app.activeViewport.camera=c;app.activeViewport.refresh();adsk.doEvents();app.activeViewport.saveAsImageFile(os.path.join(OUT,name),1800,1200)
    view('assembled.png')
    if not coarse:
        orig=[]
        for o in root.occurrences:
            if o.component.name.startswith(('03','04','06')):
                orig.append((o,o.transform2.copy()));o.transform2=compose(trans(-50 if o.component.name.startswith('03') or o.name in ('06_roof_clip:1','06_roof_clip:2') else 50,0,70),o.transform2)
        view('roof_access.png')
        for o,m in orig:o.transform2=m
        orig=[]
        for o in root.occurrences:
            name=o.component.name
            delta=(-35,0,0) if name.startswith('01') else (35,0,0) if name.startswith('02') else (0,0,60) if name.startswith(('03','04')) else (0,0,35) if name.startswith(('10','11')) else None
            if delta:orig.append((o,o.transform2.copy()));o.transform2=compose(trans(*delta),o.transform2)
        view('exploded.png')
        for o,m in orig:o.transform2=m
        view('assembled.png')
    if design.snapshots.hasPendingSnapshot:design.snapshots.add().name='Assembled v5'
    ex=design.exportManager
    assert ex.execute(ex.createFusionArchiveExportOptions(os.path.join(OUT,'Robobus_v5_Printable.f3d')))
    assert ex.execute(ex.createSTEPExportOptions(os.path.join(OUT,'Robobus_v5_Assembled.step'),root))
    log('EXPORT COMPLETE '+str(len(parts))+' unique parts')

def run(context):
    global app,design,root,tm,colors,parts,occurrences,shapes,OUT
    app=adsk.core.Application.get();tm=adsk.fusion.TemporaryBRepManager.get();parts=[];occurrences={};shapes={}
    coarse=os.path.isfile(os.path.join(OUT,'coarse.flag'))
    if coarse:OUT=os.path.join(OUT,'coarse')
    os.makedirs(os.path.join(OUT,'stl'),exist_ok=True)
    try:
        doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType);doc.name='Robobus v5 - '+('coarse budget study' if coarse else 'compact printable demo')
        design=adsk.fusion.Design.cast(app.activeProduct);design.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType;root=design.rootComponent
        colors={n:appearance(n,rgb,['Plastic - Matte (Black)','Paint - Enamel Glossy (Yellow)']) for n,rgb in [('purple',(113,61,169)),('grey',(151,162,170)),('dark',(30,35,44)),('red',(209,54,72)),('blue',(47,123,186)),('green',(37,155,119)),('gold',(229,168,52))]}
        for n,v in [('bodyLength',300),('bodyWidth',110),('bodyHeight',125),('wall',1.4),('floorThickness',1.8),('roofThickness',1.2),('clearance',.3),('doorWidth',80),('doorHeight',100)]:design.userParameters.add(n,adsk.core.ValueInput.createByReal(v/10),'mm','Benchmark for native editable base-feature assembly; rebuild via RobobusLite.py')
        make_body(coarse)
        if coarse:coarse_mounts()
        else:fixtures();sensors();coupons()
        export_all(doc,coarse)
        if not coarse:audit()
    except:
        s=traceback.format_exc();log(s);app.userInterface.messageBox(s,'Robobus v5 needs attention')

def audit():
    bodies=[(o.name,tm.copy(b.createForAssemblyContext(o))) for o in root.occurrences if not o.component.name.startswith('C') for b in o.component.bRepBodies]
    def overlaps(a,b):
        x=a.boundingBox;y=b.boundingBox
        return all(getattr(x.minPoint,k)<getattr(y.maxPoint,k)-.0001 and getattr(y.minPoint,k)<getattr(x.maxPoint,k)-.0001 for k in ('x','y','z'))
    def check(moving,fixed):
        hits=[]
        for n,a in moving:
            for m,b in fixed:
                if overlaps(a,b):
                    v=I(a,b)
                    if v>.02:hits.append({'a':n,'b':m,'mm3':round(v,3)})
        return hits
    static=[]
    for i,a in enumerate(bodies):static+=check([a],bodies[i+1:])
    tests=[]
    fixed=[(n,b) for n,b in bodies if n.startswith(('01','02','07','15','16','17','23'))]
    for n,b in bodies:
        if n.startswith(('03','04','10','11')):
            for dz in (3,6,12,25,45,60,70):tests.append({'test':n+' lift '+str(dz),'hits':check([(n,xf(b,trans(0,0,dz)))],fixed+[(m,c) for m,c in bodies if m.startswith(('13','18','19','20','21','24','25','26'))])})
    for i,(x,y,z,start) in enumerate([(-70,0,155,60),(70,0,155,60),(0,10,170,45)],1):
        moving=[(n,b) for n,b in bodies if n in ('13_laser_pivot_adapter:'+str(i),'18_laser_carrier:'+str(i),'19_laser_collar:'+str(i))]
        for angle in range(40,86,5):tests.append({'test':f'L{i} tilt {angle}','hits':check([(n,xf(b,rot((1,0,0),start-angle,(x,y,z)))) for n,b in moving],fixed+[(n,b) for n,b in bodies if n.startswith(('03','04'))])})
    for n,b in bodies:
        if n.startswith(('03','04')):
            for dx in (5,15,35,50,100,160):tests.append({'test':n+' outward removal '+str(dx),'hits':check([(n,xf(b,trans(-dx if n.startswith('03') else dx,0,70)))],fixed+[(m,c) for m,c in bodies if m.startswith(('13','18','19','20','21','24','25','26'))])})
    camera=[(n,b) for n,b in bodies if n.startswith(('24','25','26'))]
    for yy in range(-30,11,10):tests.append({'test':'camera Y '+str(yy),'hits':check([(n,xf(b,trans(0,yy-10,0))) for n,b in camera],fixed)})
    # Actual-size nominal board and required clear component/wire envelope.
    for label,box in [('breadboard_clearance',B(-140,-97,25.2,25,-42,85.2)),('controller_clearance',B(39,-97,25.2,141,-17,85.2))]:
        tests.append({'test':label,'hits':check([(label,box)],[(n,b) for n,b in bodies if n.startswith(('01','02','03','04','07','15','16','17','23'))])})
    report={'static_intersections':static,'tests':tests,'body_instances':len(bodies)}
    with open(os.path.join(OUT,'assembly_audit.json'),'w') as f:json.dump(report,f,indent=2)
    log('AUDIT '+str(len(static))+' static; '+str(sum(bool(t['hits']) for t in tests))+' motion/envelope failures')


