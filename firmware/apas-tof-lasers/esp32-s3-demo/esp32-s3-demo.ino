// APAS tabletop demo: ToF + three warning lasers. No actuator outputs.
// VIN -> 3V3, GND -> GND, SDA -> GPIO8, SCL -> GPIO9.
// Install Adafruit_VL53L0X and VL53L1X (Pololu) using Library Manager.
#include <Wire.h>
#include <Adafruit_VL53L0X.h>
#include <VL53L1X.h>

constexpr uint8_t TOF_ADDRESS = 0x29;
constexpr int SDA_PIN = 8;
constexpr int SCL_PIN = 9;
Adafruit_VL53L0X sensorL0;
VL53L1X sensorL1;
enum SensorKind { NONE, L0X, L1X };
SensorKind sensorKind = NONE;
uint32_t lastFrameAt = 0;
uint32_t lastReportAt = 0;
uint32_t lastErrorAt = 0;

bool readIdentification(uint16_t reg, bool wideAddress, uint8_t *data, uint8_t length) {
  Wire.beginTransmission(TOF_ADDRESS);
  if (wideAddress) Wire.write(uint8_t(reg >> 8));
  Wire.write(uint8_t(reg));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(TOF_ADDRESS, length) != length) return false;
  for (uint8_t i = 0; i < length; ++i) data[i] = Wire.read();
  return true;
}

constexpr int LASER_PINS[] = {4, 5, 7};
bool lasersOn = false;
uint32_t lastHeartbeat = 0;
char command[40];
uint8_t commandLength = 0;
bool commandOverflow = false;

void setLasers(bool enabled) {
  lasersOn = enabled;
  for (int pin : LASER_PINS) digitalWrite(pin, enabled ? HIGH : LOW);
  Serial.printf("LASERS,%u\n", enabled ? 1 : 0);
}

void handleCommands() {
  // Bounded parsing: input cannot delay ToF sampling or watchdog checks.
  for (uint8_t count = 0; count < 64 && Serial.available(); ++count) {
    char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      command[commandLength] = '\0';
      if (!commandOverflow) {
        if (!strcmp(command, "LASERS ON")) {
          lastHeartbeat = millis();
          setLasers(true);
        } else if (!strcmp(command, "LASERS OFF")) {
          setLasers(false);
        } else if (!strcmp(command, "KEEPALIVE")) {
          lastHeartbeat = millis(); // Never enables a laser by itself.
        } else if (!strcmp(command, "STATUS")) {
          Serial.println("DEMO,APAS_3_LASER_V1");
          Serial.printf("LASERS,%u\n", lasersOn ? 1 : 0);
        }
      }
      commandLength = 0;
      commandOverflow = false;
    } else if (commandLength < sizeof(command) - 1) {
      command[commandLength++] = ch;
    } else {
      commandOverflow = true;
    }
  }
  if (lasersOn && uint32_t(millis() - lastHeartbeat) > 2000) {
    setLasers(false);
    Serial.println("LASER_TIMEOUT: heartbeat lost; outputs OFF");
  }
}

void setup() {
  for (int pin : LASER_PINS) { digitalWrite(pin, LOW); pinMode(pin, OUTPUT); }
  Serial.begin(115200);
  delay(1500);
  Serial.println("\nAPAS demo | SDA=8 SCL=9 | lasers GPIO4/5/7 boot OFF");
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000); // Conservative bus speed for breadboard wiring.
  Wire.setTimeOut(100);
  bool found = false;
  for (uint8_t address = 8; address < 120; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.printf("I2C device: 0x%02X\n", address);
      if (address == TOF_ADDRESS) found = true;
    }
  }
  if (!found) {
    Serial.println("ERROR: no device at 0x29. Check 3V3/GND/SDA/SCL and XSHUT pull-up; then reset.");
    return;
  }
  uint8_t id[2] = {0, 0};
  // Probe L0X first with its one-byte register pointer. L1X needs two bytes.
  if (readIdentification(0xC0, false, id, 1) && id[0] == 0xEE) {
    Serial.println("IDENTIFIED: VL53L0X (model 0xEE)");
    if (!sensorL0.begin(TOF_ADDRESS, false, &Wire) || !sensorL0.startRangeContinuous(100)) {
      Serial.println("ERROR: VL53L0X initialization failed; power-cycle the sensor.");
      return;
    }
    sensorKind = L0X;
  } else if (readIdentification(0x010F, true, id, 2) && id[0] == 0xEA && id[1] == 0xCC) {
    Serial.println("IDENTIFIED: VL53L1X (model/module 0xEACC)");
    sensorL1.setTimeout(500);
    if (!sensorL1.init() || !sensorL1.setDistanceMode(VL53L1X::Short) ||
        !sensorL1.setMeasurementTimingBudget(50000)) {
      Serial.println("ERROR: VL53L1X initialization failed; power-cycle the sensor.");
      return;
    }
    sensorL1.startContinuous(100);
    sensorKind = L1X;
  } else {
    Serial.println("ERROR: 0x29 present but sensor identity is unrecognized. Do not assume a valid reading.");
    return;
  }
  Serial.println("Ready. Move a matte target through 100, 200 and 500 mm. Output: time_ms,sensor,distance_mm,status");
  lastFrameAt = millis();
}

void loop() {
  handleCommands();
  if (sensorKind == NONE) {
    if (millis() - lastErrorAt >= 3000) {
      lastErrorAt = millis();
      Serial.println("NOT_READY: correct wiring / power-cycle and press RESET. Laser controls independent; no actuator connected.");
    }
    delay(10);
    return;
  }
  bool ready = sensorKind == L0X ? sensorL0.isRangeComplete() : sensorL1.dataReady();
  if (!ready) {
    if (millis() - lastFrameAt > 1000 && millis() - lastErrorAt >= 1000) {
      lastErrorAt = millis();
      Serial.println("NO_FRESH_DATA: check sensor connection; no distance is valid.");
    }
    delay(5);
    return;
  }
  uint16_t mm;
  uint8_t status;
  bool valid;
  if (sensorKind == L0X) {
    mm = sensorL0.readRangeResult();
    status = sensorL0.readRangeStatus();
    valid = sensorL0.Status == VL53L0X_ERROR_NONE && status == 0;
  } else {
    mm = sensorL1.read(false);
    status = uint8_t(sensorL1.ranging_data.range_status);
    valid = sensorL1.last_status == 0 && !sensorL1.timeoutOccurred() &&
            sensorL1.ranging_data.range_status == VL53L1X::RangeValid;
  }
  lastFrameAt = millis();
  if (millis() - lastReportAt < 200) return;
  lastReportAt = millis();
  Serial.printf("%lu,%s,", (unsigned long)millis(), sensorKind == L0X ? "VL53L0X" : "VL53L1X");
  if (valid) Serial.printf("%u,VALID\n", mm);
  else Serial.printf("NA,INVALID_status_%u\n", status);
}

