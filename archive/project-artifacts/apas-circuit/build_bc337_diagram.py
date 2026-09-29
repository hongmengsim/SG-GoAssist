from pathlib import Path
import math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import toColor
from reportlab.pdfbase import pdfmetrics
import pypdfium2 as pdfium

OUT=Path(__file__).parent
PDF=OUT/'APAS_ESP32S3_RYS1230_BC337_Circuit.pdf'
W,H=1600,900
INK='#152B40'; MUTED='#52667A'; RED='#C93549'; BLUE='#2467B2'; TEAL='#00847B'; GRAY='#56616D'; LIGHT='#F1F5F9'; EDGE='#CCD7E1'
c=canvas.Canvas(str(PDF),pagesize=(W,H))
c.setTitle('APAS ESP32-S3 and RYS1230 BC337 replacement circuit')
c.setAuthor('APAS prototype team')
def line(x1,y1,x2,y2,col=INK,w=3):
    c.setStrokeColor(toColor(col));c.setLineWidth(w);c.line(x1,H-y1,x2,H-y2)
def rect(x,y,w,h,fill='white',stroke=EDGE,r=12):
    c.setFillColor(toColor(fill));c.setStrokeColor(toColor(stroke));c.setLineWidth(1.3)
    c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=1)
def text(x,y,s,size=21,col=INK,bold=False):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size);c.setFillColor(toColor(col));c.drawString(x,H-y,s)
def lines(x,y,ss,size=20,col=MUTED,leading=29):
    for i,s in enumerate(ss): text(x,y+i*leading,s,size,col)
def dot(x,y,col=INK):
    c.setFillColor(toColor(col));c.circle(x,H-y,4,fill=1,stroke=0)
def ground(x,y,label=True):
    line(x,y,x,y+8,GRAY);line(x-15,y+8,x+15,y+8,GRAY);line(x-10,y+15,x+10,y+15,GRAY);line(x-5,y+22,x+5,y+22,GRAY)
    if label:text(x+22,y+17,'GND',17,GRAY,True)
def arrow(x1,y1,x2,y2):
    dx,dy=x2-x1,y2-y1;length=math.hypot(dx,dy);ux,uy=dx/length,dy/length
    p=c.beginPath();p.moveTo(x2,H-y2);p.lineTo(x2-17*ux-7*uy,H-(y2-17*uy+7*ux));p.lineTo(x2-17*ux+7*uy,H-(y2-17*uy-7*ux));p.close()
    c.setFillColor(toColor(INK));c.drawPath(p,fill=1,stroke=0)
def header(n,title,sub):
    text(60,51,'APAS  /  BC337 REPLACEMENT CIRCUIT',18,TEAL,True)
    text(60,108,title,37,INK,True);text(60,149,sub,21,MUTED);text(1465,51,f'{n} / 2',17,MUTED)
def footer():
    text(60,875,'Model warning lights only | GPIO numbers are not physical header positions | Design checked; hardware not bench-tested',15,MUTED)
def endpage():footer();c.showPage()

header(1,'ESP32-S3 driving two RYS1230 lasers','Q1 / Q2 are BC337 NPN transistors. R1 / R2 must be 470 ohm when replacing the earlier MOSFET circuit.')
rect(65,189,320,74,LIGHT)
text(85,218,'Regulated 5 V DC',23,INK,True);text(85,247,'Supply capacity: at least 500 mA',18,MUTED)
line(385,219,455,219,RED);dot(455,219,RED);dot(515,219,RED);line(457,217,508,195,RED);line(515,219,1455,219,RED)
text(440,181,'S1  SPST',18,RED,True);text(576,199,'Contacts rated >= 5 V DC, >= 0.5 A',18,RED)
text(1110,199,'SWITCHED +5 V',18,RED,True)
line(110,263,110,279,GRAY);ground(110,279);text(175,284,'Supply negative',17,MUTED)

rect(75,347,345,395,'#EAF3FB',BLUE)
text(101,385,'ESP32-S3',31,INK,True)
text(130,320,'USB power / programming',20,BLUE);line(244,327,244,347,BLUE)
text(103,432,'GPIO4',24,BLUE,True);line(280,425,640,425,BLUE)
lines(103,498,['3.3 V GPIO outputs','HIGH = laser ON','LOW = laser OFF','','Keep 5V / VIN pin','unconnected in this setup.'],21,MUTED,27)
text(103,702,'GPIO5',24,BLUE,True);line(280,695,640,695,BLUE)
text(236,730,'GND',20,GRAY,True);line(259,742,259,759,GRAY);ground(259,759)

for ref,dy in [(1,0),(2,270)]:
    top=275+dy; base=425+dy
    if ref==1:
        line(1080,219,1080,top,RED);dot(1080,219,RED)
    else:
        line(1455,219,1455,525,RED);line(1455,525,1080,525,RED);line(1080,525,1080,top,RED)
    rect(970,top,220,80,'#FFF1F2',RED)
    text(988,top+30,f'L{ref}  RYS1230',24,INK,True)
    text(988,top+61,'5 V-rated module',19,MUTED)
    if ref==1:text(1094,top-10,'+',23,RED,True)
    else:text(1230,top-32,'+5 V / laser positive',17,RED,True)
    text(1094,top+99,'-',24,INK,True)
    text(1230,top+29,'<= 40 mA each',21,INK,True)
    text(1230,top+58,'Design load limit',18,MUTED)
    line(1080,top+80,1080,375+dy)
    # NPN symbol: base at left; arrow points outward on the emitter.
    line(1030,397+dy,1030,453+dy,INK,4)
    line(1030,410+dy,1080,375+dy)
    line(1030,440+dy,1080,475+dy)
    arrow(1047,452+dy,1079,474+dy)
    line(1080,475+dy,1080,485+dy,GRAY);ground(1080,485+dy)
    text(1102,390+dy,'C',20,INK,True);text(1001,408+dy,'B',20,INK,True);text(1102,473+dy,'E',20,INK,True)
    text(1160,412+dy,f'Q{ref}  BC337',24,INK,True)
    text(1160,442+dy,'NPN / TO-92',20,MUTED)
    text(1160,470+dy,'C = collector   B = base   E = emitter',17,MUTED)
    # Base resistor and base-emitter pull-down.
    rect(640,base-11,76,22,'white',INK,0);line(716,base,1030,base,BLUE)
    text(618,base-38,f'R{ref}  470 ohm',23,INK,True)
    text(618,base-13,'0.25 W, +/-5%',17,MUTED)
    dot(865,base,BLUE);line(865,base,865,base+21,BLUE)
    rect(855,base+21,20,35,'white',INK,0);line(865,base+56,865,base+62,GRAY);ground(865,base+62)
    text(650,base+49,f'R{ref+2}  100 kohm',20,INK,True)
    text(650,base+75,'0.25 W, +/-5%',17,MUTED)

rect(60,811,1480,37,LIGHT)
text(80,836,'All GND symbols connect together: ESP32 GND, supply negative, both emitters and both pull-down resistors.',20,INK)
endpage()

header(2,'Component ratings and wiring notes','Use one transistor per laser. Populate only Q1 / R1 / R3 / L1 if you have a single laser module.')
rect(60,190,1480,328,'white')
for x,s in [(82,'Reference'),(325,'Qty'),(400,'Component / rating'),(975,'Use in this circuit')]:text(x,225,s,21,INK,True)
rows=[
('Q1, Q2','2','BC337 NPN; 45 V / 800 mA / 625 mW max*','Actual design load <= 40 mA per transistor'),
('R1, R2','2','470 ohm; 0.25 W (1/4 W); +/-5% or better','GPIO-to-base current limiting'),
('R3, R4','2','100 kohm; 0.25 W (1/4 W); +/-5% or better','Base-to-emitter pull-down'),
('L1, L2','2','RYS1230 complete module; 5 V input rating','Internal current limiting; verify your variant'),
('Supply','1','Regulated 5 V DC; >= 500 mA capacity','Two laser branches: <= 80 mA combined'),
('S1','1','SPST on/off; contacts >= 5 V DC and >= 0.5 A','Disconnects positive supply to both lasers')]
for i,row in enumerate(rows):
    y=243+i*43
    if i%2==0:rect(72,y,1456,42,LIGHT,LIGHT,0)
    for x,s in zip([82,325,400,975],row):text(x,y+27,s,18,INK)

rect(60,543,722,257,'#EAF6F4')
text(83,578,'Connections and checks',24,INK,True)
lines(83,613,[
    'Laser + -> switched 5 V. Laser - -> collector (C).',
    'Emitter (E) -> GND. GPIO -> 470 ohm -> base (B).',
    '100 kohm connects base to emitter / common GND.',
    'Referenced onsemi part: pin 1 = C, pin 2 = B, pin 3 = E.',
    'Confirm pin orientation against your exact manufacturer.',
    'Use USB for ESP32 power; leave its 5V / VIN pin open.'
],19,MUTED,29)

rect(805,543,735,257,'#FFF6E9')
text(828,578,'Design limits',24,INK,True)
lines(828,613,[
    'At 3.3 V GPIO and about 0.8 V base-emitter voltage:',
    'base current ~= (3.3 - 0.8) / 470 = 5.3 mA per channel.',
    'Base resistor dissipation ~= 0.013 W; 0.25 W is ample.',
    '*VCEO / IC / PD maxima at 25 C; PD derates with temperature.',
    'Check actual laser current <= 40 mA and proper turn-off.',
    'Keep the full laser beam contained on a matte model surface.'
],19,MUTED,29)

text(62,826,'Sources:',16,TEAL,True)
refs=[(138,'onsemi BC337 datasheet','https://www.onsemi.com/pdf/datasheet/bc337-fsc-d.pdf'),(393,'RYS1230 product specification','https://www.motorobit.com/3-5v-plus-laser-diode-5mw-650nm-rys1230'),(718,'ESP32-S3 board reference','https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.0.html')]
for x,label,url in refs:
    text(x,826,label,16,BLUE);c.linkURL(url,(x,H-830,x+pdfmetrics.stringWidth(label,'Helvetica',16),H-810),relative=0)
text(62,849,'RYS1230 variants differ. This circuit assumes a complete 5 V-compatible module; it is not a bare laser-diode driver.',16,MUTED)
endpage();c.save()

pdf=pdfium.PdfDocument(str(PDF))
for i,p in enumerate(pdf):
    p.render(scale=1.6).to_pil().save(OUT/('APAS_BC337_Circuit_Diagram.png' if i==0 else 'APAS_BC337_Ratings.png'))
print(PDF)
