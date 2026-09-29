# APAS three-laser tabletop demo

Prepared for the ESP32-S3, confirmed VL53L0X breakout, three RYS1230 line lasers,
and a Raspberry Pi, with either a desktop display or browser access over the LAN.
The Pi camera is connected; camera operation still needs verification.
The new firmware has been uploaded to COM6 and acknowledged ON, automatic timeout
OFF, and explicit OFF commands. The user confirmed all three lasers illuminated
and then turned off during this test. The previously tested ToF sketch remains available as the
sensor-only baseline. This package is separate from the older
`esp32-mock-bus` firmware, which expects a different sensor and pin mapping.

## What this demo does

- Real ToF distance and measurement status over USB serial at 115200 baud.
- Three real laser outputs controlled together, each through its own BC337.
- A desktop request button and an animated ramp clearly labelled SIMULATED.
- Immediate blockage on a closer reading; invalid/stale readings become UNKNOWN.
- A matte reference board creates a repeatable empty-path distance.
- Three consecutive reference-like readings are required for BEAM CLEAR.
- No physical motor outputs, limit-switch inputs, camera inference, or GoAssist
  backend integration are implemented by this package. The browser version accepts
  local-network control requests using its startup control code.
- A second Pi can later become a network request terminal; start with one Pi first.

BEAM CLEAR only describes this sensor's monitored direction. It never proves the
entire marked area is clear. The simulation can resume when three clear readings
arrive; that is presentation behavior, not physical actuator control logic.

## Third-laser wiring (power OFF while wiring)

| Connection | Destination |
| --- | --- |
| GPIO7 | 470 ohm, 0.25 W resistor, then Q3 base |
| Q3 base | 100 kohm, 0.25 W resistor to common GND |
| Q3 emitter | Common GND |
| Q3 collector | Third laser negative |
| Third laser positive | Switched regulated +5 V laser rail |
| Supply negative | ESP32 GND and all three BC337 emitters |

Q3 is another BC337; identify B/C/E from the actual manufacturer's datasheet.
Use +/-5% or better resistors. GPIO4 and GPIO5 retain the first two identical
driver circuits. GPIO7 is a GPIO label, not the seventh physical header pin.
Do not combine the laser negative leads or put three lasers on a single existing
transistor/resistor channel. The software turns three independent channels on together.

This design assumes 5 V-rated modules drawing no more than 40 mA each: at most
120 mA total laser load. A regulated 5 V supply rated at least 500 mA serves the
laser branch only. Its rating is capacity, not a current forced through the lasers.
Confirm module voltage/current from the seller/label; a reliable RYS1230 primary
datasheet was not available. Do not use this circuit for a bare laser diode.

Keep external laser +5 V separate from ESP32 5V/VIN while ESP32 is USB-powered.
Use a laser master power switch rated at least 5 V DC / 0.5 A. The Pi uses its own
model-appropriate power supply. USB supplies the ESP32. The grounds are common.

For the user's Digilent Analog Discovery 3 (AD3), use **V+ set to +5.0 V** for
the laser positive rail and **AD3 GND** for the common ground rail/ESP32 GND.
**Do not connect AD3 V- to GND:** V- is a separate negative-voltage output;
leave it disconnected and disabled. In WaveForms Supplies, enable V+ and Master
Enable. This replaces the generic term 'supply negative' for this instrument.

ToF remains VIN -> 3V3, GND -> GND, SDA -> GPIO8, SCL -> GPIO9.
GPIO6 (request), GPIO10/11 (limits) are reserved proposals for later hardware.

## Physical arrangement

See the included PDF and PNG diagrams.

1. Fix the bus to a matte base, with the centre door facing the boarding area.
2. Put the Pi and ESP32 inside a removable roof or beside the bus on the base.
3. Mount the camera above the centre door on a raised bracket, tilted outward.
   Include both the waiting area and ramp model in its view. Adjust by preview.
4. Fix the three lasers above/alongside the door. Aim L1 and L2 down to form the
   two sides of the zone; rotate/aim L3 to form the far edge. Slightly overlapping
   line ends form a U. No precise mount height is specified without model dimensions.
5. Mount ToF beside the door with its view above the ramp, facing outward. Keep
   the ramp, bus body, brackets, and laser housings out of its optical field.
6. Place a broad matte white reference board just beyond the far edge at a known
   distance, initially about 300-500 mm if your model allows. It should fill the
   sensor's field. Use a block tall enough to intersect that field for the test.
7. Keep projected laser light on the matte base, away from eyes/camera lenses and
   reflective surfaces. The rendered red dotted paths indicate aim, not visible air beams.

## Install and upload ESP32 firmware

### Repeat the laser test from Windows

The standalone file **`Test-Lasers.ps1`** in this folder repeats the successful
hardware test. Close all serial monitors, connect ESP32 USB to the computer,
aim all lasers at the matte base, and enable AD3 V+ at +5 V. Retain AD3 GND to
ESP32 GND; leave AD3 V- disabled/disconnected. In PowerShell, run:

```powershell
& 'C:\Users\simho\Downloads\BusTech\GoAssist\hardware\apas-tabletop-demo\Test-Lasers.ps1' -Port COM6
```

Change the port if Windows assigns a different one. The test confirms the correct
firmware, enables all three outputs, maintains a heartbeat for three seconds,
checks the two-second automatic OFF timeout, and requests/verifies final OFF.
Observe approximately five seconds of illumination. Logs are saved in the
`logs` subfolder with timestamps. No firmware upload or Pi is required.
The `test_demo_state.py` / `test_web_demo.py` files are software unit tests,
not hardware laser tests. The serial output cannot verify light; inspect all three lines.

### Firmware installation (already completed on the tested ESP32)

Keep the laser master switch OFF throughout upload and initial connection.

1. Open `esp32-s3-demo/esp32-s3-demo.ino` in Arduino IDE on the Windows computer.
2. Board: **ESP32S3 Dev Module**, `esp32` core by Espressif Systems **3.3.12**.
3. Libraries: **Adafruit_VL53L0X 1.2.5**, **VL53L1X by Pololu 1.3.1**.
4. USB CDC On Boot: Disabled. Upload Mode: UART0 / Hardware CDC. PSRAM: Disabled.
5. Select the ESP32 USB-UART port (previously COM6) and upload.
6. Close Serial Monitor. Unplug USB to fully power-cycle the ESP32 and ToF.
7. Plug ESP32 USB into the Pi. All three outputs boot LOW, with base pull-downs
   keeping the transistor drivers off during reset.

The diagnostic firmware supports `LASERS ON`, `LASERS OFF`, `KEEPALIVE`, and
`STATUS`, each followed by newline. It acknowledges output state as `LASERS,0/1`.
After an ON command it requires keepalives; outputs turn off after about two
seconds without one (plus bounded sensor-processing time). This is a software
watchdog, not a replacement for the physical switch. It does not measure emitted light.

## Prepare Raspberry Pi 1

### Headless / SSH / Raspberry Pi OS Lite (browser control screen)

If `pi_demo.py` reports "no display name and no $DISPLAY environment variable",
use `pi_web_demo.py`. It does not need a desktop, Tk, VNC, or a DISPLAY setting.
Keep `pi_web_demo.py`, `demo_state.py`, and `web_demo.html` together in this folder.

```bash
sudo apt update
sudo apt install -y python3-serial
cd ~/apas-tabletop-demo
python3 -m serial.tools.list_ports -v
python3 pi_web_demo.py --port /dev/ttyUSB0
```

Use your actual ESP32 serial device. Close the old screen and any serial monitor.
The server opens the ESP32 automatically. From your computer on the same local
network, open the **complete URL printed in the Pi terminal**, including `#` and
the generated control code. If `.local` does not resolve, get the Pi IP with
`hostname -I` in another terminal and replace only the hostname in the URL.
Port is 8765. Keep the Pi terminal running; Ctrl+C shuts down and requests OFF.

Controls and calibration match the desktop version below. Browser heartbeat loss
requests OFF after about two seconds, on top of the ESP32's serial-heartbeat timeout.
Returning to the browser never automatically re-enables lasers. Background-tab
timer throttling may also cause an OFF; keep the control tab foreground for the demo.
The UI reports firmware output acknowledgement, not measured emitted light.

If your network blocks device-to-device connections, use an SSH tunnel from your
computer (replace the username/address) while the Pi server is running:

```bash
ssh -L 8765:127.0.0.1:8765 YOUR_PI_USER@YOUR_PI_IP
```

Then open the printed **localhost** URL in your computer browser. The web server
can optionally be started with `--listen 127.0.0.1` for tunnel-only access. Do not
forward the demo port onto the public internet. Camera preview is separate; this
browser version does not stream camera video or perform object classification.

### Desktop window version

Use Raspberry Pi OS with Desktop and a local monitor/keyboard (or an existing
remote desktop session). Install using Raspberry Pi Imager for your exact model.
Connect a compatible CSI camera ribbon **with Pi power disconnected**, or use a
USB webcam. Pi camera cable/connector types vary by Pi/camera model.

Transfer this whole folder to `~/apas-tabletop-demo`, then open a Pi terminal:

```bash
sudo apt update
sudo apt install -y python3-serial python3-tk
cd ~/apas-tabletop-demo
python3 -m serial.tools.list_ports -v
python3 pi_demo.py --port /dev/ttyUSB0
```

Replace `/dev/ttyUSB0` with the listed ESP32 serial port; a `/dev/serial/by-id/...`
path is useful if other USB devices are attached. If access is denied, add your
login user to the serial group and log out/in:

```bash
sudo usermod -aG dialout "$USER"
```

Do not run another Serial Monitor while the demo holds the port.

For a CSI camera with the current Raspberry Pi camera stack:

```bash
rpicam-hello --list-cameras
rpicam-hello -t 0
```

This gives a separate camera preview window. Stop it before another application
opens the camera. USB webcams use their own supported viewer/capture software;
`rpicam-hello` is not a universal USB webcam viewer. This package does not install
or claim a wheelchair detection model.

## Run the presentation

1. Click **Connect**. Confirm real distances arrive and firmware is recognised.
2. Keep the monitored path empty except for the fixed backstop. Wait about three
   seconds for 10 valid readings. Click **Set empty-path reference** and confirm.
   The reference must be 150-1000 mm away and samples must span <=30 mm.
3. With lasers aimed, turn on the physical laser supply switch. Use **Manual: all
   lasers ON** / **All lasers OFF** to verify all three channels. If any module
   stays on with output OFF, switch off supply and check collector/base/emitter wiring.
4. Click **Request ramp (simulation)**. Lasers mark the zone; the ramp graphic
   extends only while the measured path matches the backstop reference.
5. Insert a block into the ToF path. The screen shows BLOCKED and pauses the graphic.
   Remove it; three clear readings permit the simulated extension to resume.
6. Invalid readings, lost sensor data, or removal of the backstop produce UNKNOWN.
   The +/-30 mm comparison is a configurable demonstration tolerance, not a safety margin.
7. **Cancel / lasers OFF** resets the graphic immediately; it does not retract hardware.
8. Close the program or disconnect USB; verify lasers turn off. Switch off laser
   power before changing the setup. Recalibrate after moving sensor/backstop.

The fixed backstop avoids treating an out-of-range/error reading as a clear path.
It also means an obstacle outside the sensor view will be missed; demonstrate that
limitation explicitly rather than describing the whole ramp zone as protected.

## Validation and remaining work

- Five unit tests cover beam blockage, delayed clear, stale/invalid data, lost
  backstop, calibration rejection, and nonmeasurement messages.
- Five additional browser-controller/API tests cover firmware handshake, browser
  heartbeat loss, explicit OFF/shutdown, unknown-data movement prevention, and API
  control-code checks. Tests use fake serial; browser hardware use on Pi is pending.
- Python modules pass syntax compilation.
- ESP32-S3 compilation passed with core 3.3.12: 346418 bytes program (26%),
  24808 bytes global RAM (7%). Upload to COM6 completed with flash hashes verified.
- Live serial test: firmware reported LASERS,1; after heartbeats stopped it reported
  LASERS,0 and LASER_TIMEOUT. Final STATUS confirmed LASERS,0. ToF readings stayed
  valid during the test (35-42 mm); this is not a ruler-based accuracy check.
- Serial transcript: `../../artifacts/apas-three-laser-build/laser-test.txt`.
- The user visually confirmed all three lasers turned on and then off. All outputs
  were left OFF after the test. Pi hardware/camera setup still needs verification.
- For physical ramp movement, procure the actuator/driver, limit switches, request
  button and suitable supply, then implement/verify local motion interlocks.

References:
- BC337 manufacturer datasheet: https://www.onsemi.com/pdf/datasheet/bc337-fsc-d.pdf
- Pi camera tools: https://www.raspberrypi.com/documentation/computers/camera_software.html
- VL53L0X: https://www.st.com/resource/en/datasheet/vl53l0x.pdf
