# ESP32-S3 ToF test

Standalone bring-up for the breakout marked VL53L0/1XV2. The sketch reads the
chip identity and selects VL53L0X or VL53L1X automatically. These sensors return
one distance, not the 8x8 data used by the repository's VL53L5CX firmware.

## Wiring

Disconnect USB while changing wires. Keep the external visible-laser supply off.

| ToF breakout | ESP32-S3 |
| --- | --- |
| VIN | 3V3 |
| GND | GND |
| SDA | GPIO8 |
| SCL | GPIO9 |

Leave GPIO/INT unconnected. Leave XSHUT at the breakout's normal pulled-up state;
do not ground it. GPIO4 and GPIO5 are held LOW by this sketch for the laser drivers.

## Arduino IDE

1. Install `esp32` by Espressif Systems in Boards Manager (tested: 3.3.12).
2. Install `Adafruit_VL53L0X` (1.2.5) and `VL53L1X` by Pololu (1.3.1) in Library Manager.
3. Open `esp32-s3-tof-test.ino` from this folder.
4. Select **ESP32S3 Dev Module**, port **COM6** (the connected USB UART bridge).
5. Keep **USB CDC On Boot: Disabled**, **Upload Mode: UART0 / Hardware CDC**,
   and **PSRAM: Disabled** for this minimal test. Other settings use board defaults.
6. Upload. Open Serial Monitor at **115200 baud**. Press RESET to see startup identification.

COM port numbers can change when reconnecting. Close Serial Monitor before uploading
or using `Read-Tof.ps1`.

## Reading the output

Startup should list I2C address `0x29`, then the detected sensor model.
CSV fields are `time_ms,sensor,distance_mm,status`, at up to five lines per second.
`VALID` means the sensor reported a valid measurement. `NA,INVALID_status_N`,
`NO_FRESH_DATA`, and `NOT_READY` must not be interpreted as a clear path.

Test with a flat matte target approximately 100, 200 and 500 mm from the sensor,
checking against a ruler. Remove any protective shipping film over the sensor window.
The test reports raw measurements; it does not control a ramp or enable the lasers.

To capture 15 seconds from PowerShell, run `./Read-Tof.ps1` from this folder.
Add `-Reset` to capture startup identification as well.

## Verification on 23 September 2026

- COM6 identified as ESP32-S3, revision 0.2, with 8 MB embedded PSRAM.
- Compilation passed: 345826 bytes program storage; 24752 bytes global RAM.
- Upload completed and all written flash hashes verified.
- Startup and serial output at 115200 baud confirmed the sketch is running.
- Initial scan found no device; after reconnecting, the retest detected address
  0x29 and identified VL53L0X (model ID 0xEE). Sensor initialization succeeded.
- The 15-second retest returned invalid range statuses 2 and 4 only; no valid
  distance has yet been verified. Next check: a matte white target 100–300 mm
  in front of the unobstructed optical window, with any shipping film removed.
- Raw retest capture: `../../artifacts/apas-tof-build/serial-retest.txt`.
- Subsequent target test: two MCU resets detected address 0x29 but failed chip
  identification. No distances were produced. A full sensor power cycle is the
  next diagnostic step; resetting the ESP32 alone does not disconnect sensor power.
  Captures: `serial-target-test.txt` and `serial-target-recheck.txt` in the same
  build artifact directory.
- After the full power cycle, VL53L0X identification succeeded and valid distances
  were observed. Initial readings included invalid status 2; from 7639 ms through
  15095 ms all 27 reported samples were VALID, ranging from 30 to 136 mm. The last
  five were 32, 33, 38, 35 and 36 mm. This verifies live
  ranging, not accuracy against a known reference. Capture:
  `../../artifacts/apas-tof-build/serial-powercycle-test.txt`.
