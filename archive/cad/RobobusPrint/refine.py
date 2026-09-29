from pathlib import Path
p=Path(__file__).with_name('RobobusPrint.py')
s=p.read_text()
replacements={
'pin=headed_pin(1.5,16)':'pin=headed_pin(1.5,19)',
'z+6.7) for x,y,z':'z+8.7) for x,y,z',
'axle=headed_pin(3,25)':'axle=headed_pin(3,26)',
'for y in (-181,1)':'for y in (-182,2)',
'(0,-37,210),(36,-181,205)':'(0,-38,210),(36,-182,205)',
'B(x-21,-26,z-18,x+21,y+5,z-10)':'B(x-21,-26,z-34,x+21,y+5,z-26)',
'B(x-21,y-8,z-14,x-17,y+8,z+8)':'B(x-21,y-8,z-30,x-17,y+8,z+8)',
'B(x+17,-26,z-18,x+21,y+5,z)':'B(x+17,-26,z-30,x+21,y+5,z)',
"C('x',0,0,9,15,3.3)":"C('x',0,0,7.5,15,3.3),C('x',0,0,10,12.1,3.6)",
'trans(0,0,21)':'trans(0,0,24)',
'B(-6,-166,382.3,6,40,387.7),B(-10,-165,380,10,-158,390)':'B(-6,-175,382.3,6,40,387.7),B(-10,-177,380,10,-169,390)',
'206 mm rail':'217 mm rail',
'shortpin=headed_pin(1.5,15)':'shortpin=headed_pin(1.5,17)',
'B(-13.3,-8.3,133,-10.3,-2,153),B(10.3,-8.3,133,13.3,-2,153)':'B(-13.3,-8.3,136.3,-10.3,-2,153),B(10.3,-8.3,136.3,13.3,-2,153)',
'pin=headed_pin(2,153)':'pin=headed_pin(2,154)',
'pin2=headed_pin(2,143)':'pin2=headed_pin(2,144)',
'if lo<x<hi:lid=D(lid,B(x-10,-34.3,208,x+10,1,228))':'if x+24.3>lo and x-24.3<hi:lid=D(lid,B(x-24.3,-40.3,208,x+24.3,1,400))',
'B(-16.3,-36.3,208,16.3,1,228)':'B(-24.3,-40.3,208,24.3,1,400)',
'compose(trans(0,0,140),o.transform2)':'compose(trans(0,80,100),o.transform2)',
'        validate_export(doc)':'        validate_export(doc)\n        audit()',
}
for a,b in replacements.items():
    assert a in s,a
    s=s.replace(a,b)
s=s.replace("solid=D(solid,C('x',5,36,-77,77,2.3))", "solid=D(solid,C('x',5,36,-77,77,2.3))\n                for a,b in [(-59.7,-25.3),(-9.7,24.7),(40.3,59.7)]:solid=D(solid,C('x',5,36,a-.3,b+.3,6.3))")
s=s.replace("    # Grip grooves", "    for a,b in [(-75,-60),(-25,-10),(25,40),(60,75)]:first=D(first,C('x',0,0,a-.3,b+.3,6.3))\n    for a,b in [(-44.7,-15.3),(15.3,44.7)]:first=D(first,C('x',110,6,a-.3,b+.3,5.3))\n    # Grip grooves")
s=s.replace("    # Tip underside", "    for a,b in [(-70,-45),(-15,15),(45,70)]:second=D(second,C('x',110,6,a-.3,b+.3,5.3))\n    # Tip underside")
# Tray feet partly overlap the first/last retainer slots. Clear the slot through the foot too.
s=s.replace("            add(ident,tray", "            for x in range(10,int(L)-6,10):\n                for y in (8,W-13):tray=D(tray,B(x,y,-13,x+4,y+5,4))\n            add(ident,tray")
s=s.replace("for z in (5,30,140,220):\n                moved=xf(b,trans(0,0,z));coll=[]", "for y,z in ([(0,z) for z in (5,10,20,30,60,100)]+[(y,100) for y in (20,40,60,80)] if n.startswith(('04','05','06')) else [(0,z) for z in (5,30,140,220)]):\n                moved=xf(b,trans(0,y,z));coll=[]")
s=s.replace("'lift_mm':z,'intersections'", "'lift_mm':z,'forward_mm':y,'intersections'")
p.write_text(s)
Path(__file__).parents[1].joinpath('print_v4/audit.flag').unlink(missing_ok=True)
