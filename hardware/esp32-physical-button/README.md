# ESP32 Physical Wheelchair Request Button

This prototype validates Slice 3B:

`physical button -> ESP32 -> backend hardware endpoint -> simulated bus acknowledgement -> LED/buzzer confirmation`

The ESP32 only sends passenger assistance intent. It does not control ramp hardware, inspect obstructions, or run ramp safety logic.

## Hardware

- ESP32 development board
- Momentary push button
- LED with resistor
- Optional active buzzer

Default pins in `esp32_physical_button.ino`:

- Button: GPIO 13, wired to ground. Uses `INPUT_PULLUP`.
- LED: GPIO 2.
- Buzzer: GPIO 12.

## Backend URL

Set `BACKEND_BASE_URL` in the sketch to your computer's LAN IP, not `localhost`.

Example:

```cpp
const char* BACKEND_BASE_URL = "http://192.168.1.23:3000";
```

Find your Windows IP:

```powershell
ipconfig
```

Use the IPv4 address for your Wi-Fi adapter.

## Run

1. Start the backend:

```powershell
npm.cmd run dev:backend
```

2. Verify from another device on the same Wi-Fi:

```text
http://YOUR_COMPUTER_IP:3000/health
```

3. Edit the sketch Wi-Fi credentials and backend URL.
4. Flash the sketch using Arduino IDE or PlatformIO.
5. Open Serial Monitor at `115200`.
6. Press the button.

Expected backend payload:

```json
{
  "busId": "SBS-191-001",
  "busService": "191",
  "boardingStop": "Changi Airport Terminal 1"
}
```

Expected successful response behavior:

- LED turns on briefly.
- Buzzer beeps briefly if connected.
- Serial output shows the request ID and acknowledgement response.

## Prototype Duplicate Behavior

Current duplicate consolidation is prototype request de-duplication:

`same bus + same assistance type = one active bus action`

It should not be interpreted as passenger counting. A later version should distinguish repeated signals from one passenger versus separate intents from multiple wheelchair users.
