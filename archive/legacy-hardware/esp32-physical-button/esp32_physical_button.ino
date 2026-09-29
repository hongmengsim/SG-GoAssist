#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your laptop/backend LAN IP. Do not use localhost from the ESP32.
const char* BACKEND_BASE_URL = "http://192.168.1.23:3000";

const char* BUS_ID = "SBS-191-001";
const char* BUS_SERVICE = "191";
const char* BOARDING_STOP = "Changi Airport Terminal 1";

const int BUTTON_PIN = 13;
const int LED_PIN = 2;
const int BUZZER_PIN = 12;

const unsigned long DEBOUNCE_MS = 60;
const unsigned long REQUEST_COOLDOWN_MS = 2500;
const unsigned long HTTP_TIMEOUT_MS = 4000;

int lastButtonReading = HIGH;
int stableButtonState = HIGH;
unsigned long lastDebounceAt = 0;
unsigned long lastRequestAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  connectToWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWifi();
  }

  int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonReading) {
    lastDebounceAt = millis();
  }

  if ((millis() - lastDebounceAt) > DEBOUNCE_MS && reading != stableButtonState) {
    stableButtonState = reading;

    if (stableButtonState == LOW && (millis() - lastRequestAt) > REQUEST_COOLDOWN_MS) {
      lastRequestAt = millis();
      sendWheelchairRampRequest();
    }
  }

  lastButtonReading = reading;
}

void connectToWifi() {
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startedAt) < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected. ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("Wi-Fi connection failed. Will retry.");
    errorFeedback();
  }
}

void sendWheelchairRampRequest() {
  Serial.println("Button pressed. Sending WHEELCHAIR_RAMP request.");

  String url = String(BACKEND_BASE_URL) + "/api/assistance/hardware/physical-button/wheelchair-ramp";
  String body = "{";
  body += "\"busId\":\"" + String(BUS_ID) + "\",";
  body += "\"busService\":\"" + String(BUS_SERVICE) + "\",";
  body += "\"boardingStop\":\"" + String(BOARDING_STOP) + "\"";
  body += "}";

  for (int attempt = 1; attempt <= 2; attempt++) {
    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    int statusCode = http.POST(body);
    String response = http.getString();
    http.end();

    Serial.print("HTTP attempt ");
    Serial.print(attempt);
    Serial.print(" status: ");
    Serial.println(statusCode);
    Serial.println(response);

    if (statusCode >= 200 && statusCode < 300 && response.indexOf("\"ACKNOWLEDGED\"") >= 0) {
      confirmationFeedback();
      return;
    }

    delay(500);
  }

  errorFeedback();
}

void confirmationFeedback() {
  Serial.println("Bus acknowledged request. Showing confirmation feedback.");
  digitalWrite(LED_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(140);
  digitalWrite(BUZZER_PIN, LOW);
  delay(900);
  digitalWrite(LED_PIN, LOW);
}

void errorFeedback() {
  Serial.println("Request failed or timed out. Showing error feedback.");
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(160);
    digitalWrite(LED_PIN, LOW);
    delay(160);
  }
}
