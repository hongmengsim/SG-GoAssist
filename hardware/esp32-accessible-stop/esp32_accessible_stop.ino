#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <time.h>
#include <mbedtls/md.h>
#include <Preferences.h>

// Prototype credentials only. Use a secrets file or provisioning flow for field units.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_BASE_URL = "http://192.168.1.23:3000";
const char* DEVICE_ID = "STOP-18331-01";
const char* DEVICE_SHARED_SECRET = "YOUR_DEVICE_SHARED_SECRET";
const char* STOP_CODE = "18331";
const char* BUS_ID = "DEMO-BUS-01";
const char* BUS_SERVICE = "95";

const int RAMP_BUTTON_PIN = 13;
const int IDENTIFY_BUTTON_PIN = 14;
const int DWELL_BUTTON_PIN = 27;
const int STATUS_LED_PIN = 2;
const int BUZZER_PIN = 12;
const int VIBRATION_PIN = 32;
const int TRIGGER_PIN = 26;
const int ECHO_PIN = 25;
const int RFID_SS_PIN = 5;
const int RFID_RST_PIN = 22;

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
Preferences preferences;
String offlineQueue[12];
int queuedCount = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastPresenceSignalAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(RAMP_BUTTON_PIN, INPUT_PULLUP);
  pinMode(IDENTIFY_BUTTON_PIN, INPUT_PULLUP);
  pinMode(DWELL_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(VIBRATION_PIN, OUTPUT);
  pinMode(TRIGGER_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  SPI.begin();
  rfid.PCD_Init();
  preferences.begin("goassist", false);
  loadOfflineQueue();
  connectWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  maintainConnection();
  handleButton(RAMP_BUTTON_PIN, "WHEELCHAIR_RAMP");
  handleButton(IDENTIFY_BUTTON_PIN, "BUS_AUDIO_IDENTIFICATION");
  handleButton(DWELL_BUTTON_PIN, "EXTENDED_DWELL_TIME");
  handleNfcTap();
  observeBoardingZone();
  flushOfflineQueue();
  if (millis() - lastHeartbeatAt > 10000) {
    lastHeartbeatAt = millis();
    sendHeartbeat();
  }
  delay(25);
}

void handleButton(int pin, const char* assistanceType) {
  static unsigned long lastPress[3] = {0, 0, 0};
  int index = pin == RAMP_BUTTON_PIN ? 0 : pin == IDENTIFY_BUTTON_PIN ? 1 : 2;
  if (digitalRead(pin) == LOW && millis() - lastPress[index] > 1200) {
    lastPress[index] = millis();
    String signalId = String(DEVICE_ID) + "-" + String(millis());
    String body = signalBody(signalId, "PHYSICAL_BUTTON", "EXPLICIT_ASSISTANCE_REQUEST", assistanceType, 1.0);
    if (postJson("/api/operations/signals", body)) confirmationFeedback();
    else { enqueue(body); errorFeedback(); }
  }
}

void handleNfcTap() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  // No card UID leaves the device. The tap is converted into a rotating anonymous intent token.
  String signalId = String(DEVICE_ID) + "-NFC-" + String(millis());
  String body = signalBody(signalId, "NFC", "EXPLICIT_ASSISTANCE_REQUEST", "WHEELCHAIR_RAMP", 1.0);
  if (postJson("/api/operations/signals", body)) confirmationFeedback();
  else { enqueue(body); errorFeedback(); }
  rfid.PICC_HaltA();
}

void observeBoardingZone() {
  if (millis() - lastPresenceSignalAt < 15000) return;
  digitalWrite(TRIGGER_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIGGER_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIGGER_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  float distanceCm = duration * 0.0343 / 2.0;
  if (duration > 0 && distanceCm > 20 && distanceCm < 140) {
    lastPresenceSignalAt = millis();
    String signalId = String(DEVICE_ID) + "-ZONE-" + String(millis());
    String body = signalBody(signalId, "DISTANCE_SENSOR", "PASSENGER_IN_BOARDING_ZONE", "EXTENDED_DWELL_TIME", 0.72);
    if (!postJson("/api/operations/signals", body)) enqueue(body);
  }
}

String signalBody(String signalId, const char* source, const char* kind, const char* assistanceType, float confidence) {
  String body = "{";
  body += "\"signalId\":\"" + signalId + "\",";
  body += "\"idempotencyKey\":\"" + signalId + "\",";
  body += "\"source\":\"" + String(source) + "\",";
  body += "\"kind\":\"" + String(kind) + "\",";
  body += "\"stopCode\":\"" + String(STOP_CODE) + "\",";
  body += "\"busCandidate\":\"" + String(BUS_ID) + "\",";
  body += "\"busService\":\"" + String(BUS_SERVICE) + "\",";
  body += "\"assistanceCandidates\":[\"" + String(assistanceType) + "\"],";
  body += "\"confidence\":" + String(confidence, 2) + ",";
  body += "\"anonymousToken\":\"" + String(DEVICE_ID) + "-" + String(millis()) + "\",";
  body += "\"observedAt\":\"" + isoTimestamp() + "\"";
  body += "}";
  return body;
}

bool postJson(const char* path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(2500);
  http.begin(String(BACKEND_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  addSignedHeaders(http, body);
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

void enqueue(const String& body) {
  if (queuedCount < 12) offlineQueue[queuedCount++] = body;
  persistOfflineQueue();
}

void flushOfflineQueue() {
  if (WiFi.status() != WL_CONNECTED || queuedCount == 0) return;
  if (postJson("/api/operations/signals", offlineQueue[0])) {
    for (int i = 1; i < queuedCount; i++) offlineQueue[i - 1] = offlineQueue[i];
    queuedCount--;
    persistOfflineQueue();
  }
}

void loadOfflineQueue() {
  queuedCount = min(preferences.getInt("queueCount", 0), 12);
  for (int i = 0; i < queuedCount; i++) offlineQueue[i] = preferences.getString(("q" + String(i)).c_str(), "");
}

void persistOfflineQueue() {
  preferences.putInt("queueCount", queuedCount);
  for (int i = 0; i < 12; i++) preferences.putString(("q" + String(i)).c_str(), i < queuedCount ? offlineQueue[i] : "");
}

void sendHeartbeat() {
  String body = "{\"deviceId\":\"" + String(DEVICE_ID) + "\",\"deviceType\":\"BUS_STOP\",\"stopCode\":\"" + String(STOP_CODE) + "\",\"networkOnline\":true,\"sensorHealth\":{\"buttons\":\"OK\",\"rfid\":\"OK\",\"distance\":\"OK\"},\"firmwareVersion\":\"stop-1.0.0\",\"observedAt\":\"" + isoTimestamp() + "\"}";
  postJson("/api/operations/devices/heartbeat", body);
}

String isoTimestamp() {
  time_t now = time(nullptr);
  struct tm utc;
  gmtime_r(&now, &utc);
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", &utc);
  return String(buffer);
}

void addSignedHeaders(HTTPClient& http, const String& body) {
  unsigned long long epochMs = (unsigned long long)time(nullptr) * 1000ULL;
  char timestamp[24];
  snprintf(timestamp, sizeof(timestamp), "%llu", epochMs);
  String message = String(DEVICE_ID) + "." + timestamp + "." + body;
  byte digest[32];
  mbedtls_md_context_t context;
  mbedtls_md_init(&context);
  mbedtls_md_setup(&context, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&context, (const unsigned char*)DEVICE_SHARED_SECRET, strlen(DEVICE_SHARED_SECRET));
  mbedtls_md_hmac_update(&context, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&context, digest);
  mbedtls_md_free(&context);
  char signature[65];
  for (int i = 0; i < 32; i++) sprintf(signature + (i * 2), "%02x", digest[i]);
  signature[64] = 0;
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Timestamp", timestamp);
  http.addHeader("X-Signature", signature);
}

void maintainConnection() { if (WiFi.status() != WL_CONNECTED) connectWifi(); }
void connectWifi() { WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); unsigned long start=millis(); while(WiFi.status()!=WL_CONNECTED && millis()-start<8000) delay(250); }
void confirmationFeedback() { digitalWrite(STATUS_LED_PIN,HIGH); digitalWrite(BUZZER_PIN,HIGH); digitalWrite(VIBRATION_PIN,HIGH); delay(180); digitalWrite(BUZZER_PIN,LOW); digitalWrite(VIBRATION_PIN,LOW); delay(700); digitalWrite(STATUS_LED_PIN,LOW); }
void errorFeedback() { for(int i=0;i<3;i++){digitalWrite(STATUS_LED_PIN,HIGH);delay(120);digitalWrite(STATUS_LED_PIN,LOW);delay(120);} }
