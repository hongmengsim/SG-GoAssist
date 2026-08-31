#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <SparkFun_VL53L5CX_Library.h>
#include <time.h>
#include <mbedtls/md.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_BASE_URL = "http://192.168.1.23:3000";
const char* DEVICE_ID = "MOCK-BUS-01";
const char* DEVICE_SHARED_SECRET = "YOUR_DEVICE_SHARED_SECRET";
const char* BUS_ID = "DEMO-BUS-01";
const char* BUS_SERVICE = "95";
const char* STOP_CODE = "18331";

const int RAMP_SERVO_PIN = 18;
const int VEHICLE_STOPPED_PIN = 32;
const int BRAKE_PIN = 33;
const int DOOR_OPEN_PIN = 25;
const int OBSTRUCTION_PIN = 26;
const int RAMP_STOWED_SWITCH_PIN = 27;
const int RAMP_DEPLOYED_SWITCH_PIN = 14;
const int SPEAKER_PIN = 12;
const int STATUS_LED_PIN = 2;
const int LASER_SDA_PIN = 21;
const int LASER_SCL_PIN = 22;

const uint8_t LASER_ZONE_COUNT = 64;
const uint8_t LASER_CALIBRATION_FRAMES = 20;
const uint16_t LASER_OBJECT_DELTA_MM = 120;
const uint16_t LASER_MIN_OBJECT_DISTANCE_MM = 80;
const uint16_t LASER_MAX_OBJECT_DISTANCE_MM = 1500;

Servo rampServo;
SparkFun_VL53L5CX rampLaser;
VL53L5CX_ResultsData rampLaserData;
unsigned long lastTelemetryAt = 0;
unsigned long lastPollAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastObstacleFusionAt = 0;
unsigned long lastLaserSampleAt = 0;
unsigned long actuatorCycles = 0;
uint32_t laserBaselineSums[LASER_ZONE_COUNT] = {0};
uint8_t laserBaselineSampleCounts[LASER_ZONE_COUNT] = {0};
uint16_t laserBaselineMm[LASER_ZONE_COUNT] = {0};
uint8_t laserCalibrationFrames = 0;
uint8_t laserOccupiedZoneCount = 0;
uint16_t laserNearestDistanceMm = 0;
bool laserCriticalZoneOccupied = false;
bool laserStarted = false;
bool laserCalibrated = false;
bool lightDebrisClearance = false;

void setup() {
  Serial.begin(115200);
  pinMode(VEHICLE_STOPPED_PIN, INPUT_PULLUP);
  pinMode(BRAKE_PIN, INPUT_PULLUP);
  pinMode(DOOR_OPEN_PIN, INPUT_PULLUP);
  pinMode(OBSTRUCTION_PIN, INPUT_PULLUP);
  pinMode(RAMP_STOWED_SWITCH_PIN, INPUT_PULLUP);
  pinMode(RAMP_DEPLOYED_SWITCH_PIN, INPUT_PULLUP);
  pinMode(SPEAKER_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  rampServo.attach(RAMP_SERVO_PIN);
  rampServo.write(0);
  initializeRampLaser();
  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  publishCapabilities();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  updateRampLaser();
  if (millis() - lastTelemetryAt > 900) { lastTelemetryAt = millis(); publishTelemetry(); }
  if (millis() - lastPollAt > 700) { lastPollAt = millis(); pollCommands(); }
  if (millis() - lastObstacleFusionAt > 250) { lastObstacleFusionAt = millis(); pollRampObstacleAssessment(); }
  if (millis() - lastHeartbeatAt > 10000) { lastHeartbeatAt = millis(); sendHeartbeat(); }
  delay(25);
}

void pollCommands() {
  HTTPClient http;
  http.begin(String(BACKEND_BASE_URL) + "/api/operations/actuators/pending?busId=" + BUS_ID);
  addSignedHeaders(http, "{}");
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  DynamicJsonDocument document(8192);
  if (deserializeJson(document, http.getString())) { http.end(); return; }
  http.end();
  for (JsonObject command : document["commands"].as<JsonArray>()) {
    executeCommand(command);
  }
}

void executeCommand(JsonObject command) {
  String commandId = command["commandId"].as<String>();
  String caseId = command["caseId"].as<String>();
  String kind = command["command"].as<String>();
  if (kind == "DEPLOY_RAMP") {
    if (digitalRead(RAMP_DEPLOYED_SWITCH_PIN) == LOW) {
      publishTelemetry();
      postStatus(commandId, caseId, "COMPLETED", "Ramp already deployed and limit switch verified");
      return;
    }
    if (!rampInterlocksClear()) {
      postStatus(commandId, caseId, "BLOCKED", "Local safety interlock prevented ramp movement");
      return;
    }
    postStatus(commandId, caseId, "IN_PROGRESS", "Deploying ramp");
    if (!rampServo.attached()) rampServo.attach(RAMP_SERVO_PIN);
    rampServo.write(90);
    unsigned long started = millis();
    unsigned long lastCancellationCheck = 0;
    while (millis() - started < 6000) {
      if (millis() - lastCancellationCheck > 250) {
        lastCancellationCheck = millis();
        if (caseCancellationRequested(caseId)) {
          rampServo.detach();
          publishTelemetry();
          postStatus(commandId, caseId, "CANCELLED", "Passenger cancellation stopped ramp movement");
          return;
        }
      }
      if (!rampInterlocksClear()) {
        rampServo.detach();
        postStatus(commandId, caseId, "BLOCKED", "Obstruction or safety signal changed during movement");
        return;
      }
      if (digitalRead(RAMP_DEPLOYED_SWITCH_PIN) == LOW) {
        actuatorCycles++;
        publishTelemetry();
        postStatus(commandId, caseId, "COMPLETED", "Ramp deployed limit switch verified");
        return;
      }
      delay(30);
    }
    rampServo.write(0);
    postStatus(commandId, caseId, "FAILED", "Ramp deployment timed out");
    return;
  }
  if (kind == "RETRACT_RAMP") {
    if (digitalRead(RAMP_STOWED_SWITCH_PIN) == LOW) {
      publishTelemetry();
      postStatus(commandId, caseId, "COMPLETED", "Ramp already stowed and limit switch verified");
      return;
    }
    if (!rampInterlocksClear()) {
      postStatus(commandId, caseId, "BLOCKED", "Local safety interlock prevented ramp retraction");
      return;
    }
    postStatus(commandId, caseId, "IN_PROGRESS", "Retracting ramp");
    if (!rampServo.attached()) rampServo.attach(RAMP_SERVO_PIN);
    rampServo.write(0);
    unsigned long started = millis();
    while (millis() - started < 6000) {
      if (!rampInterlocksClear()) {
        rampServo.detach();
        publishTelemetry();
        postStatus(commandId, caseId, "BLOCKED", "Passenger or obstruction entered the ramp path during retraction");
        return;
      }
      if (digitalRead(RAMP_STOWED_SWITCH_PIN) == LOW) {
        actuatorCycles++;
        publishTelemetry();
        postStatus(commandId, caseId, "COMPLETED", "Ramp stowed limit switch verified");
        return;
      }
      delay(30);
    }
    rampServo.detach();
    publishTelemetry();
    postStatus(commandId, caseId, "FAILED", "Ramp retraction timed out before stowed verification");
    return;
  }
  if (kind == "PLAY_EXTERNAL_AUDIO") tone(SPEAKER_PIN, 880, 400);
  // SHOW_VISUAL_MESSAGE and VIBRATE_STOP_CONTROL are forwarded to their attached demo outputs.
  if (kind == "SHOW_VISUAL_MESSAGE" || kind == "EXTEND_DWELL") digitalWrite(STATUS_LED_PIN, HIGH);
  postStatus(commandId, caseId, "COMPLETED", "Command completed by mock bus");
}

bool rampInterlocksClear() {
  return digitalRead(VEHICLE_STOPPED_PIN) == LOW &&
         digitalRead(BRAKE_PIN) == LOW &&
         digitalRead(DOOR_OPEN_PIN) == LOW &&
         digitalRead(OBSTRUCTION_PIN) == HIGH &&
         laserDeploymentPathClear();
}

void publishCapabilities() {
  String body = "{\"busService\":\"" + String(BUS_SERVICE) + "\",\"autonomous\":true,\"autonomyLevel\":\"MOCK_ROUTE_AUTOMATION\",\"ramp\":true,\"externalAudio\":true,\"visualDisplay\":true,\"dwellControl\":true,\"wheelchairSpaceCapacity\":1,\"supportedTelemetry\":[\"vehicleStopped\",\"parkingBrakeActive\",\"doorOpen\",\"deploymentPathClear\",\"rampPosition\",\"rampObstacle\"],\"updatedAt\":\"" + isoTimestamp() + "\"}";
  putJson(String("/api/operations/vehicles/") + BUS_ID + "/capabilities", body);
}

void publishTelemetry() {
  String rampPosition = digitalRead(RAMP_DEPLOYED_SWITCH_PIN) == LOW ? "DEPLOYED" : digitalRead(RAMP_STOWED_SWITCH_PIN) == LOW ? "STOWED" : "UNKNOWN";
  String observedAt = isoTimestamp();
  bool laserHealthy = laserSensorHealthy();
  bool objectDetected = laserOccupiedZoneCount > 0;
  bool pathClear = digitalRead(OBSTRUCTION_PIN) == HIGH && laserDeploymentPathClear();
  String body = "{\"stopCode\":\"" + String(STOP_CODE) + "\",\"vehicleStopped\":" + jsonBool(digitalRead(VEHICLE_STOPPED_PIN)==LOW) + ",\"parkingBrakeActive\":" + jsonBool(digitalRead(BRAKE_PIN)==LOW) + ",\"doorOpen\":" + jsonBool(digitalRead(DOOR_OPEN_PIN)==LOW) + ",\"deploymentPathClear\":" + jsonBool(digitalRead(OBSTRUCTION_PIN)==HIGH) + ",\"rampPosition\":\"" + rampPosition + "\",\"rampObstacle\":{\"laserHealthy\":" + jsonBool(laserHealthy) + ",\"objectDetected\":" + jsonBool(objectDetected) + ",\"nearestDistanceMm\":" + String(laserNearestDistanceMm) + ",\"occupiedZoneCount\":" + String(laserOccupiedZoneCount) + ",\"criticalZoneOccupied\":" + jsonBool(laserCriticalZoneOccupied) + ",\"classification\":\"UNKNOWN\",\"classificationConfidence\":0,\"blocksDeployment\":" + jsonBool(!pathClear) + ",\"reason\":\"Local laser measurement\",\"observedAt\":\"" + observedAt + "\"},\"wheelchairSpaceOccupied\":false,\"networkOnline\":true,\"observedAt\":\"" + observedAt + "\"}";
  postJson(String("/api/operations/vehicles/") + BUS_ID + "/telemetry", body);
}

void postStatus(String commandId, String caseId, const char* state, const char* detail) {
  String body = "{\"caseId\":\"" + caseId + "\",\"busId\":\"" + String(BUS_ID) + "\",\"state\":\"" + String(state) + "\",\"detail\":\"" + String(detail) + "\",\"updatedAt\":\"" + isoTimestamp() + "\"}";
  postJson(String("/api/operations/actuators/") + commandId + "/status", body);
}

bool caseCancellationRequested(const String& caseId) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(300);
  http.begin(String(BACKEND_BASE_URL) + "/api/operations/cases/" + caseId);
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  DynamicJsonDocument document(2048);
  bool invalid = deserializeJson(document, http.getString());
  http.end();
  if (invalid) return false;
  return !document["cancellationRequestedAt"].isNull() ||
         document["state"].as<String>() == "CANCELLED";
}

void sendHeartbeat() {
  String body = "{\"deviceId\":\"" + String(DEVICE_ID) + "\",\"deviceType\":\"MOCK_BUS\",\"busId\":\"" + String(BUS_ID) + "\",\"networkOnline\":true,\"sensorHealth\":{\"interlocks\":\"OK\",\"obstruction\":\"OK\",\"rampLaser\":\"" + String(laserSensorHealthy() ? "OK" : "FAILED") + "\",\"limitSwitches\":\"OK\"},\"actuatorCycleCount\":" + String(actuatorCycles) + ",\"firmwareVersion\":\"mock-bus-1.2.0\",\"observedAt\":\"" + isoTimestamp() + "\"}";
  postJson("/api/operations/devices/heartbeat", body);
}

void initializeRampLaser() {
  Wire.begin(LASER_SDA_PIN, LASER_SCL_PIN);
  laserStarted = rampLaser.begin();
  if (!laserStarted) return;
  rampLaser.setResolution(8 * 8);
  rampLaser.setRangingFrequency(10);
  rampLaser.startRanging();
}

void updateRampLaser() {
  if (!laserStarted || !rampLaser.isDataReady()) return;
  if (!rampLaser.getRangingData(&rampLaserData)) return;
  lastLaserSampleAt = millis();
  if (!laserCalibrated) {
    for (uint8_t zone = 0; zone < LASER_ZONE_COUNT; zone++) {
      uint16_t distance = rampLaserData.distance_mm[zone];
      if (validLaserTarget(zone, distance)) {
        laserBaselineSums[zone] += distance;
        laserBaselineSampleCounts[zone]++;
      }
    }
    laserCalibrationFrames++;
    if (laserCalibrationFrames >= LASER_CALIBRATION_FRAMES) {
      uint8_t calibratedZones = 0;
      for (uint8_t zone = 0; zone < LASER_ZONE_COUNT; zone++) {
        if (laserBaselineSampleCounts[zone] >= 16) {
          laserBaselineMm[zone] = laserBaselineSums[zone] / laserBaselineSampleCounts[zone];
          calibratedZones++;
        }
      }
      laserCalibrated = calibratedZones >= 48;
    }
    return;
  }

  laserOccupiedZoneCount = 0;
  laserNearestDistanceMm = 0;
  laserCriticalZoneOccupied = false;
  for (uint8_t zone = 0; zone < LASER_ZONE_COUNT; zone++) {
    uint16_t distance = rampLaserData.distance_mm[zone];
    if (!validLaserTarget(zone, distance) || laserBaselineMm[zone] == 0) continue;
    bool closerThanBaseline = distance + LASER_OBJECT_DELTA_MM < laserBaselineMm[zone];
    if (!closerThanBaseline || distance > LASER_MAX_OBJECT_DISTANCE_MM) continue;
    laserOccupiedZoneCount++;
    if (laserNearestDistanceMm == 0 || distance < laserNearestDistanceMm) laserNearestDistanceMm = distance;
    if (criticalRampZone(zone) || distance < 300) laserCriticalZoneOccupied = true;
  }
  if (laserOccupiedZoneCount == 0) lightDebrisClearance = false;
}

bool validLaserTarget(uint8_t zone, uint16_t distance) {
  uint8_t status = rampLaserData.target_status[zone];
  return (status == 5 || status == 9) && distance >= LASER_MIN_OBJECT_DISTANCE_MM;
}

bool criticalRampZone(uint8_t zone) {
  uint8_t row = zone / 8;
  uint8_t column = zone % 8;
  return row >= 5 && column >= 2 && column <= 5;
}

bool laserSensorHealthy() {
  return laserStarted && laserCalibrated && millis() - lastLaserSampleAt < 1500;
}

bool laserDeploymentPathClear() {
  if (!laserSensorHealthy()) return false;
  if (laserOccupiedZoneCount == 0) return true;
  bool fusionFresh = millis() - lastObstacleFusionAt < 2000;
  return fusionFresh && lightDebrisClearance && !laserCriticalZoneOccupied &&
         laserOccupiedZoneCount <= 2 && laserNearestDistanceMm >= 350;
}

void pollRampObstacleAssessment() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(1200);
  http.begin(String(BACKEND_BASE_URL) + "/api/operations/vehicles/" + BUS_ID + "/ramp-obstacle");
  addSignedHeaders(http, "{}");
  int code = http.GET();
  if (code != 200) { lightDebrisClearance = false; http.end(); return; }
  DynamicJsonDocument document(2048);
  if (deserializeJson(document, http.getString())) { lightDebrisClearance = false; http.end(); return; }
  http.end();
  lightDebrisClearance =
    document["blocksDeployment"].as<bool>() == false &&
    document["classification"].as<String>() == "LIGHT_DEBRIS" &&
    document["classificationConfidence"].as<float>() >= 0.92;
}

bool postJson(String path, String body) { return sendJson(path, body, false); }
bool putJson(String path, String body) { return sendJson(path, body, true); }
bool sendJson(String path, String body, bool usePut) { if(WiFi.status()!=WL_CONNECTED)return false; HTTPClient http; http.setTimeout(2500); http.begin(String(BACKEND_BASE_URL)+path); http.addHeader("Content-Type","application/json"); addSignedHeaders(http, body); int code=usePut?http.PUT(body):http.POST(body); http.end(); return code>=200&&code<300; }
String jsonBool(bool value) { return value ? "true" : "false"; }
String isoTimestamp() { time_t now=time(nullptr); struct tm utc; gmtime_r(&now,&utc); char buffer[30]; strftime(buffer,sizeof(buffer),"%Y-%m-%dT%H:%M:%S.000Z",&utc); return String(buffer); }
void addSignedHeaders(HTTPClient& http, const String& body) { unsigned long long epochMs=(unsigned long long)time(nullptr)*1000ULL; char timestamp[24]; snprintf(timestamp,sizeof(timestamp),"%llu",epochMs); String message=String(DEVICE_ID)+"."+timestamp+"."+body; byte digest[32]; mbedtls_md_context_t context; mbedtls_md_init(&context); mbedtls_md_setup(&context,mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),1); mbedtls_md_hmac_starts(&context,(const unsigned char*)DEVICE_SHARED_SECRET,strlen(DEVICE_SHARED_SECRET)); mbedtls_md_hmac_update(&context,(const unsigned char*)message.c_str(),message.length()); mbedtls_md_hmac_finish(&context,digest); mbedtls_md_free(&context); char signature[65]; for(int i=0;i<32;i++)sprintf(signature+(i*2),"%02x",digest[i]); signature[64]=0; http.addHeader("X-Device-Id",DEVICE_ID); http.addHeader("X-Timestamp",timestamp); http.addHeader("X-Signature",signature); }
void connectWifi() { WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID,WIFI_PASSWORD); unsigned long start=millis(); while(WiFi.status()!=WL_CONNECTED&&millis()-start<8000)delay(250); }
