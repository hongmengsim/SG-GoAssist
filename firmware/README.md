# firmware

ESP32 sketches that are in use. Sketches are built and flashed with the Arduino IDE; there is no automated build or test for them here, so any statement about firmware behaviour must be checked on the real device.

| Folder | What it is |
|---|---|
| [`apas-tof-lasers/`](apas-tof-lasers/) | Current design. ESP32-S3 with a VL53L0X/L1X ToF sensor and three line lasers, talking to the Pi over USB serial. Includes wiring, flashing and the laser test script. The Pi side is [`pi/tof-link/`](../pi/tof-link/). |
| [`esp32-s3-tof-test/`](esp32-s3-tof-test/) | Sensor-only baseline for the same ESP32-S3 and ToF. No laser commands. |

Committed build outputs (`build/`, `.elf`, `.map`, `.bin`) live beside the sketches. They are large and machine-specific and could be dropped or moved to release assets; that is the firmware owner's call.

Superseded firmware (mock bus with servo ramp, accessible stop, physical button) is in [`../archive/legacy-hardware/`](../archive/legacy-hardware/).
