from pathlib import Path
import math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
PDF = OUT / 'APAS_Three_Laser_Physical_Setup.pdf'
W, H = 1600, 1000
c = canvas.Canvas(str(PDF), pagesize=(W, H))
c.setTitle('APAS three-laser tabletop prototype: placement and wiring')
INK='#172D42'; MUTED='#53677B'; BLUE='#2566AA'; TEAL='#007D78'; RED='#CA3749'; EDGE='#CAD6E0'

def text(x,y,s,size=20,color=INK,bold=False):
    c.setFillColor(HexColor(color)); c.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
    c.drawString(x,H-y,s)
def lines(x,y,ss,size=20,color=MUTED,step=28):
    for i,s in enumerate(ss): text(x,y+i*step,s,size,color)
def rect(x,y,w,h,fill='#FFFFFF',stroke=EDGE,r=10):
    c.setFillColor(HexColor(fill)); c.setStrokeColor(HexColor(stroke)); c.setLineWidth(1.5)
    c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=1)
def line(x,y,x2,y2,color=INK,width=2,dash=None):
    c.saveState(); c.setStrokeColor(HexColor(color)); c.setLineWidth(width)
    if dash: c.setDash(*dash)
    c.line(x,H-y,x2,H-y2); c.restoreState()
def poly(points,fill,stroke=None):
    p=c.beginPath();p.moveTo(points[0][0],H-points[0][1])
    for x,y in points[1:]:p.lineTo(x,H-y)
    p.close();c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill));c.drawPath(p,fill=1,stroke=1)
def circle(x,y,r,fill,stroke=None):
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke or fill));c.circle(x,H-y,r,fill=1,stroke=1)
def arrow(x,y,x2,y2,color=INK,width=2,dash=None):
    line(x,y,x2,y2,color,width,dash)
    a=math.atan2(y2-y,x2-x);n=11
    poly([(x2,y2),(x2-n*math.cos(a)+5*math.sin(a),y2-n*math.sin(a)-5*math.cos(a)),(x2-n*math.cos(a)-5*math.sin(a),y2-n*math.sin(a)+5*math.cos(a))],color)
def ground(x,y):
    line(x,y,x,y+10,MUTED);line(x-15,y+10,x+15,y+10,MUTED)
    line(x-10,y+17,x+10,y+17,MUTED);line(x-5,y+24,x+5,y+24,MUTED)
def header(page,title,sub):
    text(55,43,'APAS / TABLETOP DEMONSTRATOR',18,TEAL,True)
    text(55,98,title,36,INK,True);text(55,136,sub,20,MUTED)
    text(1470,43,f'{page} / 5',17,MUTED)
def footer():
    line(55,948,1545,948,EDGE,1)
    text(55,974,'Proposed mounting layout; not to scale. Physical ramp actuation and whole-zone protection are not yet implemented.',16,MUTED)
    c.showPage()

header(1,'Where everything goes','Top view: bus centre door faces the pavement. A removable roof exposes the Pi and ESP32 for demonstration.')
rect(55,175,990,745,'#F6F8FB')
rect(70,190,490,710,'#E5EBF1',r=4);text(88,220,'ROAD / BUS SIDE',17,MUTED,True)
rect(575,190,455,710,'#F4EEE3',r=4);text(590,220,'PAVEMENT / BOARDING SIDE',17,MUTED,True)
# Broad camera view is schematic, not a measured coverage claim.
poly([(505,490),(1012,255),(1012,821)],'#E4EEF9')
# Bus and wheels.
for yy in (335,705):
    rect(188,yy,24,82,INK,INK,5);rect(506,yy,24,82,INK,INK,5)
rect(205,270,310,560,'#FFFFFF',BLUE,24)
rect(230,290,260,58,'#C8DFEE',BLUE,6);text(304,325,'FRONT',21,BLUE,True)
text(234,385,'BUS MODEL',27,INK,True)
rect(250,412,210,90,'#E0F2E8',TEAL);text(270,445,'Raspberry Pi 1',22,TEAL,True);text(270,477,'Camera + demo UI',18,MUTED)
rect(250,674,210,91,'#E4EFFB',BLUE);text(275,707,'ESP32-S3',23,BLUE,True);text(270,740,'ToF + laser outputs',18,MUTED)
line(300,502,300,674,BLUE,3);text(318,618,'USB',19,BLUE,True)
rect(485,477,30,143,INK,INK,0);text(231,552,'CENTRE DOOR',21,INK,True)
text(236,581,'Ramp hinge here',18,MUTED)
# Ramp projection and marker zone.
rect(535,464,330,176,'#DDD4C6','#B4A68F',0)
text(610,620,'Cardboard ramp / actuator later',17,MUTED)
line(585,399,960,399,RED,5);line(585,705,960,705,RED,5);line(960,399,960,705,RED,5)
text(697,374,'L1: near-side boundary',18,RED,True)
text(697,741,'L2: opposite boundary',18,RED,True)
text(769,795,'L3: far edge',19,RED,True);line(881,778,960,668,RED,1.5)
# Sensor cone centred in monitored corridor; background target outside zone.
poly([(530,546),(985,488),(985,604)],'#D6F0E9')
line(543,546,990,546,TEAL,3,(7,5))
rect(982,479,15,132,'#FFFFFF',TEAL,0)
text(777,448,'Matte reference board',18,TEAL,True);line(939,454,982,479,TEAL,1.5)
text(681,576,'ToF monitored direction',17,TEAL,True)
rect(503,534,38,24,TEAL,TEAL,3);text(377,650,'VL53L0X',20,TEAL,True);line(472,632,518,560,TEAL,1.5)
# Physical mounting locations; beams not drawn as visible airborne light.
for lab,x,y,ty in [('L1',522,399,399),('L2',522,705,705),('L3',550,427,468)]:
    circle(x,y,13,RED);text(x-10,y+5,lab,12,'#FFFFFF',True)
line(535,399,585,399,RED,1.5,(3,4));line(535,705,585,705,RED,1.5,(3,4))
line(563,427,960,468,RED,1.5,(3,4))
rect(465,466,51,40,BLUE,BLUE,5);circle(502,486,10,'#172D42')
text(555,309,'Camera on raised bracket',19,BLUE,True)
line(562,319,578,342,BLUE,1.5);line(578,342,507,466,BLUE,1.5)
line(460,456,478,456,BLUE,2);line(478,456,478,466,BLUE,2)
text(355,521,'CSI / USB',15,BLUE)
text(84,874,'Red = projected markers   Green = ToF direction   Blue shading = illustrative camera view',16,MUTED)
# Explanation column.
rect(1070,175,475,215,'#EAF3FC',BLUE)
text(1090,211,'1  Camera and Raspberry Pi',24,BLUE,True)
lines(1090,250,['Mount the camera above the centre door,','tilted outward to include the waiting area','and the whole ramp model. Keep the Pi','inside the bus or on the base beside it.'],20,step=29)
rect(1070,410,475,205,'#FFF0F1',RED)
text(1090,448,'2  Three independent lasers',24,RED,True)
lines(1090,488,['Mount above the door, aimed down.','Your confirmed line modules form a U:','L1 + L2 = sides; L3 = the far edge.','Rotate each module to align its line.'],20,step=29)
rect(1070,635,475,285,'#E7F4F0',TEAL)
text(1090,672,'3  ToF detects a test obstacle',24,TEAL,True)
lines(1090,712,['Mount beside the door, above the ramp','surface, facing a matte reference board.','Move a test block into the measured path.','The background gives a valid clear reading.','','One VL53L0X cannot monitor the full area.','A clear beam does not prove a clear zone.'],19,step=27)
footer()

header(2,'Third laser: repeat the BC337 driver','GPIO4 = L1    |    GPIO5 = L2    |    GPIO7 = L3    |    One transistor and two resistors per module')
rect(65,180,665,74,'#FFF0F1',RED)
text(85,209,'AD3 V+ set to +5.0 V / return via AD3 GND',24,RED,True)
text(85,236,'Enable V+ and Master in WaveForms; leave V- disabled and disconnected.',17,MUTED)
line(730,213,805,213,RED,3);circle(805,213,3,RED);circle(870,213,3,RED)
line(805,213,860,191,RED,3);line(870,213,1475,213,RED,3)
text(796,179,'Master OFF switch',19,RED,True);text(1010,192,'Contacts >= 5 V DC, >= 0.5 A',18,MUTED)
line(1475,213,1475,758,RED,3)
rect(65,305,300,510,'#E7F1FC',BLUE)
text(88,347,'ESP32-S3',30,BLUE,True)
lines(88,385,['USB from PC / Pi','3.3 V GPIO outputs','Use GPIO labels'],19,step=26)
for i,base in enumerate((480,630,780)):
    gpio=(4,5,7)[i]
    text(105,base+6,f'GPIO{gpio}',24,BLUE,True)
    line(225,base,500,base,BLUE,2.5)
    rect(500,base-10,85,20,'#FFFFFF',INK,0)
    text(470,base-26,'470 ohm / 0.25 W',18,INK,True)
    line(585,base,1000,base,BLUE,2.5)
    circle(730,base,4,BLUE);line(730,base,730,base+20,BLUE)
    rect(720,base+20,20,28,'#FFFFFF',INK,0);ground(730,base+48)
    text(540,base+47,'100 kohm',18,INK,True);text(540,base+69,'0.25 W',15,MUTED)
    # NPN symbol and emitter arrow.
    line(1000,base-24,1000,base+24,INK,4)
    line(1000,base-14,1050,base-44,INK,2.5)
    arrow(1000,base+14,1050,base+44,INK,2.5);ground(1050,base+44)
    line(1050,base-44,1140,base-44,INK,2.5)
    rect(1140,base-77,240,66,'#FFF0F1',RED)
    text(1160,base-49,f'L{i+1}  RYS1230',23,RED,True)
    text(1160,base-26,'5 V-rated module only',16,MUTED)
    text(1118,base-50,'-',24,INK,True);text(1387,base-50,'+',24,RED,True)
    line(1380,base-44,1475,base-44,RED,3);circle(1475,base-44,4,RED)
    text(1071,base+28,f'Q{i+1}: BC337',21,INK,True)
    text(976,base-31,'B',15);text(1080,base-49,'C',15);text(1070,base+52,'E',15)
rect(65,865,1480,70,'#F1F5F9')
text(85,893,'COMMON GND: AD3 GND + ESP32 GND + all BC337 emitters + all 100 kohm lower ends. Do not use AD3 V-.',20,INK,True)
text(85,922,'Keep the external +5 V laser rail separate from ESP32 5V/VIN when USB-powered. Do not connect laser negative directly to GND.',19,MUTED)
lines(805,283,['Design load: <= 40 mA per 5 V module; <= 120 mA total.','AD3 GND is the return; V- is a separate negative-voltage output.','B/C/E identify function, not physical leg order: check your transistor.','470 ohm gives about 5 mA base drive; use +/-5% or better resistors.'],18,step=29)
footer()

header(3,'Assemble and demonstrate in stages','Use the same physical layout now; add the request button, limit switches and actuator when purchased.')
rect(55,178,710,350,'#F6F8FB')
text(78,213,'SIDE VIEW / AIMING',21,BLUE,True)
line(90,468,733,468,INK,3)
rect(110,286,213,182,'#FFFFFF',BLUE)
text(134,352,'Bus model',23,INK,True)
rect(306,333,17,72,INK,INK,0)
rect(315,277,35,24,BLUE,BLUE,4);arrow(350,301,614,431,BLUE,2,(6,5))
text(378,267,'Camera elevated and tilted down',17,BLUE,True)
circle(339,322,8,RED);arrow(347,330,626,466,RED,2)
text(429,335,'Lasers aimed at the matte base',17,RED,True)
rect(320,385,27,18,TEAL,TEAL,2);arrow(347,394,686,394,TEAL,2,(6,5))
rect(684,361,12,107,'#FFFFFF',TEAL,0)
poly([(323,421),(556,457),(556,467),(323,431)],'#C9BDA9')
text(390,491,'Ramp stays below the ToF path',18,MUTED)
text(91,515,'Terminate beams on the base; avoid eye level and shiny surfaces.',17,MUTED)
rect(790,178,755,350,'#FFFFFF')
text(815,215,'CONNECTION MAP',22,INK,True)
rows=[('ToF VIN / GND','ESP32 3V3 / GND'),('ToF SDA / SCL','GPIO8 / GPIO9'),('Laser controls L1 / L2 / L3','GPIO4 / GPIO5 / GPIO7'),('ESP32 USB','Raspberry Pi 1 USB (data + ESP32 power)'),('Camera','Pi 1 CSI ribbon OR USB, matching camera type'),('Raspberry Pi power','Its own model-appropriate power supply'),('Optional Raspberry Pi 2','Request screen; same LAN as Pi 1')]
for i,(a,b) in enumerate(rows):
    yy=257+i*37;text(815,yy,a,18,INK,True);text(1120,yy,b,17,MUTED)
rect(55,550,710,365,'#E7F4F0',TEAL)
text(79,591,'BUILD NOW',25,TEAL,True)
lines(79,631,['1. Power off before wiring; AD3 GND goes to ESP32 GND.','2. Secure the bus, camera, ToF and all laser brackets.','3. Check ToF at known distances in the final mounting.','4. Three-laser firmware is now uploaded to the ESP32.','5. Connect Pi 1 to ESP32 USB; launch pi_demo.py.','6. Aim the lasers, then test ON / OFF from the control screen.','7. Set the reference with only the matte backstop in view.','','Verified: all three lasers lit, then timed out to OFF.','Pi/camera deployment and final mounting checks remain.'],19,step=27)
rect(790,550,755,365,'#FFF7E8','#D8B168')
text(815,591,'ADD LATER / KEEP LABELLED AS SIMULATED',24,'#805C13',True)
lines(815,632,['Physical request button: proposed GPIO6 to GND.','Retracted / deployed switches: proposed GPIO10 / GPIO11.','Actuator: select mechanism, driver and supply before wiring.','','Demo flow: request -> mark zone -> check ToF -> on-screen result.','Use a matte backstop beyond the obstacle test area.','A nearby valid return = blocked; stale/invalid return = unknown.','Only a valid expected backstop return can mean beam clear.','','Camera preview is not object detection; ML needs a tested model.'],19,step=27)
footer()

header(4,'Build dimensions and baseboard layout','All dimensions are in millimetres. These are proposed starting dimensions, not mandatory or scale-certified specifications.')
rect(55,175,710,745,'#F6F8FB')
text(80,213,'TOP VIEW / DIMENSIONED REFERENCE',22,BLUE,True)
# Board coordinates: X=0..1000, Y=0..900. Door origin is (500,300).
bx,by,s=150,270,.5
def pt(x,y):return bx+s*x,by+s*y
def planrect(x,y,w,h,fill,stroke):
    xx,yy=pt(x,y);rect(xx,yy,s*w,s*h,fill,stroke,0)
planrect(0,0,1000,900,'#F4EEE3',EDGE)
planrect(200,120,600,180,'#E7F1FC',BLUE)
text(290,350,'BUS: 600 x 180',21,BLUE,True)
text(275,377,'Rear                     Front +X',16,MUTED)
planrect(430,300,140,216.3,'#D8CEBF','#B4A68F')
ox,oy=pt(500,300)
for a,b in [((390,320),(390,600)),((610,320),(610,600)),((390,600),(610,600))]:
    aa=pt(*a);bb=pt(*b);line(*aa,*bb,RED,4)
planrect(350,746,300,8,'#FFFFFF',TEAL)
line(ox,oy,ox,by+750*s,TEAL,2,(5,4))
circle(ox,oy,5,TEAL)
text(82,436,'Door origin',18,TEAL,True);line(198,430,ox-7,oy+2,TEAL,1)
text(493,446,'Ramp: 140 wide',18,MUTED);line(483,443,ox+35,oy+32,MUTED,1)
text(482,474,'220 deck length',18,MUTED)
text(481,537,'Zone: 220 x 300',18,RED,True);line(470,531,455,531,RED,1)
text(268,675,'Reference board: 300 wide',18,TEAL,True)
text(280,702,'450 from the door plane',18,TEAL)
# Overall dimension arrows outside the board.
line(150,258,150,242,MUTED,1);line(650,258,650,242,MUTED,1)
arrow(400,245,150,245,MUTED,1);arrow(400,245,650,245,MUTED,1)
rect(354,230,92,26,'#F6F8FB','#F6F8FB',0);text(371,250,'1000',19,INK,True)
arrow(682,495,682,270,MUTED,1);arrow(682,495,682,720,MUTED,1)
rect(659,479,65,30,'#F6F8FB','#F6F8FB',0);text(670,501,'900',19,INK,True)
arrow(180,690,245,690,INK,1.5);text(252,696,'+X',17,INK,True)
arrow(180,690,180,739,INK,1.5);text(161,762,'+Y',17,INK,True)
lines(80,804,['Origin on baseboard: 500 from its left edge,','300 from its rear edge; directly below the door centre.','Bus footprint: X=200..800, Y=120..300 on the board.','Z=0 is the top surface of the baseboard.'],18,step=27)

rect(790,175,755,745,'#FFFFFF')
text(815,214,'CUT / BUILD REFERENCE',23,INK,True)
dimrows=[('Baseboard','1000 x 900; thickness 9-12'),('Bus envelope','600 L x 180 W x 220 H'),('Centre-door opening','160 W x 160 H'),('Floor / ramp hinge','40 above the baseboard'),('Lightweight ramp','220 L x 140 W; thickness 3-5'),('Laser-marked zone','220 W x 300 outward from bus'),('White reference board','300 W x 280 H; vertical'),('Test obstacle','About 150 W x 180 H; stable base')]
for i,(a,b) in enumerate(dimrows):
    yy=265+i*58
    text(815,yy,a,20,INK,True);text(1095,yy,b,19,MUTED)
    line(815,yy+18,1520,yy+18,EDGE,1)
lines(815,762,['Ramp side clearance: 40 on each side inside the zone.','A 220 deck falling 40 has about 216 horizontal reach.','Bus height 220 includes its elevation above the baseboard.','Choose a lightweight ramp before selecting servo torque.','Dimensions are nominal; allow for actual material thickness.'],19,step=29)
footer()

header(5,'Mounting coordinates and aiming','Coordinates are relative to the door centre at baseboard level. Z measures the optical centre/aperture, not the bracket.')
rect(55,177,1490,385,'#FFFFFF')
text(80,214,'X: along bus, positive toward front    |    Y: outward toward boarding area    |    Z: upward from baseboard',21,BLUE,True)
for xx,ss in [(80,'Component'),(420,'X'),(525,'Y'),(630,'Z'),(780,'Placement / orientation')]:text(xx,258,ss,20,INK,True)
mountrows=[('Camera lens','0','-60','400','Above the roof; aim outward and down'),('L1 aperture','-110','0','260','Side boundary at X=-110'),('L2 aperture','+110','0','260','Side boundary at X=+110'),('L3 aperture','0','+20','280','Far boundary at Y=300'),('ToF optical window','0','0','140','Level; face straight outward (+Y)'),('Reference-board centre','0','450','140','Face ToF; board bottom at Z=0'),('Pi / ESP32','-','-','-','Inside bus; removable roof, USB access, ventilation')]
for i,row in enumerate(mountrows):
    yy=299+i*35
    for j,(xx,ss) in enumerate(zip((80,420,525,630,780),row)):text(xx,yy,ss,19,INK if j==0 else MUTED,j==0)
rect(55,584,710,331,'#FFF0F1',RED)
text(80,623,'AIM THE THREE LINES',24,RED,True)
lines(80,662,['L1 / L2: start about 60 degrees below horizontal.','Rotate optics so lines run parallel to the ramp.','Target X=-110 and +110; extend Y about 20..300.','','L3: start about 45 degrees below horizontal.','Rotate its line across the ramp at Y=300,','spanning X=-110..+110 to join the two side lines.','','Fan angle sets line length. Use adjustable brackets.'],19,step=27)
rect(790,584,755,331,'#E7F4F0',TEAL)
text(815,623,'CAMERA VIEW AND ToF CHECK',24,TEAL,True)
lines(815,662,['Camera: start about 60 degrees below horizontal,','looking roughly 200 beyond the door. Adjust by preview.','ToF: level at height 140; reference board 450 away.','Nominal 25-degree FoV gives about 200 viewing width','at 450 distance (geometric estimate, not guaranteed coverage).','Use the tall test block; low objects may be missed.','Recheck distances and recalibrate after final mounting.'],19,step=29)
text(815,891,'FoV reference: ST VL53L0X datasheet, performance conditions.',16,MUTED)
c.linkURL('https://www.st.com/resource/en/datasheet/vl53l0x.pdf',(815,H-899,1495,H-872),relative=0)
footer()
c.save()
print(PDF)
