from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import toColor as HexColor
from reportlab.pdfbase import pdfmetrics
import pypdfium2 as pdfium

OUT=Path(__file__).parent
W,H=1600,900
INK='#152B40'; MUTED='#53677A'; RED='#CB3548'; BLUE='#2467B2'; TEAL='#00847B'; GRAY='#56616D'; LIGHT='#F1F5F9'; EDGE='#CCD7E1'; AMBER='#9B5A13'
c=canvas.Canvas(str(OUT/'APAS_ESP32S3_RYS1230_Circuit.pdf'),pagesize=(W,H))
c.setTitle('APAS ESP32-S3 and RYS1230 laser circuit')
c.setAuthor('APAS prototype team')
def line(x1,y1,x2,y2,col=INK,width=3,dash=None):
    c.setStrokeColor(HexColor(col));c.setLineWidth(width);c.setDash(dash or [])
    c.line(x1,H-y1,x2,H-y2);c.setDash([])
def rect(x,y,w,h,fill='white',stroke=EDGE,r=12):
    c.setFillColor(HexColor(fill));c.setStrokeColor(HexColor(stroke));c.setLineWidth(1.5)
    c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=1)
def text(x,y,s,size=22,col=INK,bold=False):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size);c.setFillColor(HexColor(col));c.drawString(x,H-y,s)
def lines(x,y,ss,size=21,col=MUTED,leading=30):
    for i,s in enumerate(ss):text(x,y+i*leading,s,size,col)
def dot(x,y,col=INK):
    c.setFillColor(HexColor(col));c.circle(x,H-y,4,fill=1,stroke=0)
def resistor(x1,y,x2,label):
    mid=(x1+x2)/2;line(x1,y,mid-27,y,BLUE);rect(mid-27,y-10,54,20,'white',INK,0);line(mid+27,y,x2,y,BLUE);text(mid-43,y-23,label,19)
def ground(x,y):
    line(x,y,x,y+10,GRAY);line(x-15,y+10,x+15,y+10,GRAY);line(x-10,y+17,x+10,y+17,GRAY);line(x-5,y+24,x+5,y+24,GRAY)
def header(num,title,sub):
    text(60,55,'APAS  /  MODEL ELECTRONICS',18,TEAL,True)
    text(60,112,title,38,INK,True);text(60,151,sub,21,MUTED)
    text(1480,55,f'{num} / 3',17,MUTED)
def footer():
    text(60,872,'Presentation prototype | GPIO numbers are signal names, not header positions | 23 Sep 2026',15,MUTED)
def page():footer();c.showPage()

header(1,'ESP32-S3 + RYS1230 laser circuit','Two independent laser channels for the ramp warning zone in Proposed Solution section 3.')
# Separate supply for lasers; ESP32 USB supplies only the controller.
rect(65,190,285,63,LIGHT);text(84,217,'Regulated 5 V DC supply',21,INK,True);text(84,242,'500 mA or more; laser circuit only',16,MUTED)
line(350,218,408,218,RED);dot(408,218,RED);dot(467,218,RED);line(410,216,459,198,RED);line(467,218,1450,218,RED)
text(392,187,'S1  LASER POWER',17,RED,True);text(865,199,'+5 V LASER RAIL',18,RED,True)
line(92,253,92,690,GRAY);text(104,279,'Supply -',17,GRAY)
rect(125,308,290,325,'#EAF3FB',BLUE)
text(147,351,'ESP32-S3',31,INK,True);text(147,382,'Development board',21,MUTED)
text(155,299,'USB power / programming',18,BLUE);line(270,302,270,308,BLUE)
text(147,425,'GPIO4',23,BLUE,True);line(340,420,465,420,BLUE);text(358,405,'LASER_A',17,BLUE)
text(147,495,'GPIO5',23,BLUE,True);line(340,490,465,490,BLUE);text(358,475,'LASER_B',17,BLUE)
lines(147,549,['3.3 V control signals','HIGH = laser ON','LOW / reset = OFF'],19,MUTED,28)
text(260,621,'GND',19,GRAY,True);line(280,633,280,690,GRAY)
line(92,690,1450,690,GRAY,4);dot(280,690,GRAY);ground(1430,690);text(1010,726,'COMMON GROUND',18,GRAY,True)

for x,name,pin,ref in [(760,'A',4,1),(1270,'B',5,2)]:
    line(x,218,x,286,RED);dot(x,218,RED)
    rect(x-118,286,236,108,'#FFF1F2',RED)
    text(x-98,316,f'L{ref}  RYS1230',23,INK,True)
    text(x-98,346,'Two-wire laser module',18,MUTED)
    text(x-98,376,'+ red       - black',18,RED)
    text(x+13,273,'+',23,RED,True)
    line(x,394,x,455,INK);text(x+12,421,'-',24,INK,True)
    # Functionally explicit three-terminal MOSFET symbol box.
    rect(x-61,455,122,148,'white',INK,5)
    text(x-42,481,'D',18,INK,True);text(x-42,539,'G',18,INK,True);text(x-42,585,'S',18,INK,True)
    line(x,455,x,477,INK);line(x-61,530,x-22,530,BLUE)
    line(x-12,495,x-12,565,INK,3);line(x,495,x,565,INK,3)
    line(x,477,x,495,INK);line(x,565,x,603,INK)
    text(x+80,483,f'Q{ref}',21,INK,True);text(x+80,513,'AO3400A',19,INK,True);text(x+80,541,'N-MOSFET',17,MUTED)
    line(x,603,x,690,GRAY);dot(x,690,GRAY)
    start=x-250
    text(start,477,f'LASER_{name}',18,BLUE,True)
    resistor(start,530,x-130,f'R{ref} 100 ohm')
    line(x-130,530,x-61,530,BLUE);dot(x-120,530,BLUE)
    line(x-120,530,x-120,575,BLUE);rect(x-130,575,20,48,'white',INK,0)
    line(x-120,623,x-120,690,GRAY);dot(x-120,690,GRAY)
    text(x-242,613,f'R{ref+2} 100 kohm',17,INK);text(x-234,638,'Gate pull-down',16,MUTED)

rect(60,752,1480,80,LIGHT)
text(80,781,'WIRING RULE',18,TEAL,True)
text(255,781,'Connect matching LASER_A / LASER_B labels. Every ground joins the same ground rail.',21)
text(80,813,'Use complete 5 V-rated modules with internal current limiting. Do not connect a bare laser diode or power a laser from a GPIO.',19,MUTED)
page()

header(2,'Connections and demonstration setup','Build one channel for one module, or both channels for two modules. No motor or ramp actuator is connected here.')
rect(60,195,915,427,'white')
text(83,232,'Connection',21,INK,True);text(385,232,'Destination / detail',21,INK,True)
rows=[('ESP32-S3 GPIO4','R1 100 ohm -> Q1 gate (G)'),('ESP32-S3 GPIO5','R2 100 ohm -> Q2 gate (G)'),('Q1 / Q2 gate','100 kohm resistor to its source / GND'),('Q1 / Q2 drain (D)','Corresponding RYS1230 negative lead'),('Q1 / Q2 source (S)','Common GND rail'),('RYS1230 positive leads','S1 switched +5 V laser rail'),('External supply negative','ESP32 GND and both MOSFET sources'),('ESP32 USB','Controller power; leave its 5V / VIN pin unconnected')]
for i,(a,b) in enumerate(rows):
    y=254+i*43
    if i%2==0:rect(72,y-2,890,42,LIGHT,LIGHT,0)
    text(83,y+25,a,19,INK,i in (0,1));text(385,y+25,b,18,MUTED)

rect(1000,195,540,427,LIGHT)
text(1025,231,'Optional model request button',23,INK,True)
text(1025,266,'S2: momentary, normally open',20,MUTED)
text(1025,316,'GPIO13',22,BLUE,True);line(1130,310,1220,310,BLUE)
dot(1220,310);dot(1280,310);line(1221,307,1270,288,INK)
line(1280,310,1440,310,GRAY);ground(1440,310)
text(1240,360,'S2',18,INK,True)
lines(1025,407,['Configure GPIO13 as INPUT_PULLUP.','Press connects GPIO13 to GND.','Use a debounced press to toggle the','laser demonstration; boot with lasers OFF.'],21,MUTED,33)
text(1025,567,'Button shows the proposal\'s request flow.',19,TEAL)
text(1025,598,'It does not implement ramp interlocks.',19,MUTED)

rect(60,654,718,174,'#EAF6F4')
text(82,689,'Parts for the two-laser circuit',23,INK,True)
lines(82,725,['1x ESP32-S3 development board; 2x RYS1230 modules','2x AO3400A on SOT-23-to-breadboard adapters','2x 100 ohm; 2x 100 kohm; S1 switch; wires; 5 V supply'],20,MUTED,31)
rect(802,654,738,174,'#FFF6E9')
text(824,689,'Check before switching on',23,INK,True)
lines(824,725,['Verify module voltage/polarity and the adapter G / D / S labels.','The RYS1230 name covers different optics and seller variants.','Keep the entire 5 mW beam on an enclosed matte target.'],20,MUTED,31)
page()

header(3,'Presenting the APAS model','The laser circuit demonstrates a visible warning zone. It does not detect passengers or obstacles.')
rect(60,197,670,382,LIGHT)
text(85,235,'Physical arrangement',24,INK,True)
rect(165,270,450,67,'#D7E2ED',GRAY);text(290,310,'BUS MODEL',24,INK,True)
rect(305,330,175,160,'#FFFFFF',EDGE,0);text(345,410,'RAMP',23,MUTED,True)
for x in (275,510):
    rect(x-19,328,38,24,'#FFF1F2',RED,3)
    line(x,356,x,510,RED,4,dash=[6,5])
text(84,552,'Line optics shown schematically; crosshair / dot optics differ.',18,MUTED)
rect(760,197,780,382,'white')
text(785,235,'Suggested presentation sequence',24,INK,True)
lines(785,280,['1. Power ESP32 by USB. Keep S1 OFF while aligning.','2. Point all projected light down into the model enclosure.','3. Switch S1 ON; firmware keeps both GPIO outputs LOW.','4. Press S2: illuminate the ramp warning area.','5. Press again: switch both laser channels OFF.'],21,INK,48)
text(785,546,'For the full APAS controller, tie lights to the ramp states.',20,TEAL)

rect(60,606,710,210,'#FFF6E9')
text(83,642,'Scope and safety',23,INK,True)
lines(83,679,['RYS1230 is an emitter, not an obstacle detector.','Section 7 still needs independent sensing and motor interlocks.','Visible 5 mW lasers can be hazardous to direct viewing.','Contain direct and reflected beams; do not aim at people.','Use a line lens for boundaries; two spots do not outline a zone.'],18,MUTED,27)
rect(794,606,746,210,LIGHT)
text(817,642,'References and design basis',23,INK,True)
links=[('APAS Design Document: Proposed Solution sections 2, 3 and 7',None),('Espressif: ESP32-S3-DevKitC-1 GPIO and power reference','https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.0.html'),('AOS: AO3400A MOSFET datasheet (2.5 V gate specification)','https://www.aosmd.com/res/data_sheets/AO3400A.pdf'),('Motorobit: RYS1230 listing (3-5 V, <25 mA, 650 nm, 5 mW)','https://www.motorobit.com/3-5v-plus-laser-diode-5mw-650nm-rys1230'),('FDA: Frequently Asked Questions About Lasers','https://www.fda.gov/radiation-emitting-products/laser-products-and-instruments/frequently-asked-questions-about-lasers')]
for i,(label,url) in enumerate(links):
    y=676+i*27;text(817,y,label,17,BLUE if url else MUTED)
    if url:c.linkURL(url,(817,H-y-3,1510,H-y+19),relative=0)
page();c.save()

pdf=pdfium.PdfDocument(str(OUT/'APAS_ESP32S3_RYS1230_Circuit.pdf'))
for i,p in enumerate(pdf):
    p.render(scale=1.6).to_pil().save(OUT/('APAS_Circuit_Diagram.png' if i==0 else f'APAS_Setup_{i+1}.png'))
print('Created PDF and three 2560 x 1440 PNGs in',OUT)
