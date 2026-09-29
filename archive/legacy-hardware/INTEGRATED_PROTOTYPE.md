# Integrated portable prototype

The prototype separates passenger intent from safety-critical movement:

`app / tactile control / NFC / anonymous sensor → assistance case → vehicle capability → fresh safety telemetry → command → local interlock → limit-switch verification`

## Modules

- `esp32-accessible-stop`: three tactile controls, MFRC522 NFC reader, distance sensor, LED, buzzer, vibration motor, offline queue, and heartbeat.
- `esp32-mock-bus`: servo ramp, stopped/brake/door inputs, obstruction sensor, deployed/stowed limit switches, command polling, local emergency stop, telemetry, and heartbeat.
- `esp32-physical-button`: retained as the minimal legacy request demonstration.
- Edge camera: run a local classifier that sends only `SignalObservation` classifications to `/api/operations/signals`. Do not send or retain frames, faces, or identity data.

## Required Arduino libraries

- MFRC522
- ArduinoJson 6
- ESP32Servo
- SparkFun VL53L5CX Arduino Library

## Demonstration wiring

Stop node: ramp/identify/dwell buttons on GPIO 13/14/27; RGB or status LED on 2; buzzer on 12; vibration motor through a transistor on 32; HC-SR04 trigger/echo on 26/25; MFRC522 SS/RST on 5/22.

Mock bus: ramp servo on 18; stopped/brake/door inputs on 32/33/25; obstruction on 26; stowed/deployed limit switches on 27/14; speaker on 12; status display or LED on 2; VL53L5CX multi-zone laser sensor on I²C SDA/SCL 21/22.

All switches use `INPUT_PULLUP`; an active safe signal is wired to ground. The obstruction input is fail-safe: a disconnected or active sensor prevents movement.

Mount the VL53L5CX above the centre door so its 8×8 field covers the entire ramp sweep and pavement landing area. Power up with that area empty: the first 20 frames establish the clear-path baseline. Recalibrate after moving the sensor or ramp. Verify and adjust `criticalRampZone()` for the physical orientation before trials.

The edge camera may classify leaves or tissue as `LIGHT_DEBRIS`. That classification permits movement only at 92% confidence or higher, for no more than two occupied laser zones, at least 350 mm from the sensor, outside the configured hinge/landing zones, and while both readings remain fresh. People, mobility devices, luggage, animals, unknown objects, stale readings, sensor failure, or larger debris always block movement. Local ESP32 checks repeat these rules while the ramp is moving.

## Safety demonstration

1. Start the backend and open `/operator`.
2. Flash both controllers after setting Wi-Fi and backend LAN address.
3. Set stopped, brake, and door inputs active; leave the path clear.
4. Press the ramp control. The case is acknowledged but no ramp command is issued until fresh telemetry clears every interlock.
5. Block the obstruction sensor while moving. The mock bus stops and reports `BLOCKED`.
6. Clear the fault, use **Retry checks** in the operator console, and repeat.
7. Confirm that `READY` appears only after the deployed limit switch and actuator completion agree.
8. Send a high-confidence boarding-complete signal or cancel the case. Confirm that the ramp retracts and the case stays active until the stowed limit switch is verified.
9. While the ramp is moving, cancel the request and confirm that firmware stops the servo locally; an intermediate or unknown ramp position must require operator review.

Use a low-voltage model servo only. This firmware is a competition demonstrator, not certified vehicle control software.

## Autonomous-route demonstration

The backend includes a mock autonomous route controller for the tabletop bus. It demonstrates route assignment, approach detection, ArUco/ToF precision stopping, brake confirmation, door release, safe departure, obstacle stops, poor-localization stops, and operator override.

1. Register the mock bus capability with `autonomous: true` and `autonomyLevel: "MOCK_ROUTE_AUTOMATION"`.
2. Assign an ordered stop list through `PUT /api/operations/vehicles/:busId/autonomy/route`.
3. Start it through `POST /api/operations/vehicles/:busId/autonomy/start`.
4. Send simulated distance, speed, localization accuracy, and obstruction updates to `/autonomy/motion`.
5. Run `edge-observer/docking_observer.py` with a calibrated camera and fresh ToF feed. The bus cannot reach `STOPPED_SECURE` from distance alone.
6. Open doors only after the state reaches `STOPPED_SECURE`; a fresh aligned docking observation is checked again at door release.
7. Depart only after the door/ramp/path interlocks are clear. A deployed or unverified ramp prevents departure.
8. Use `/autonomy/override` to stop, select manual mode, or resume after an operator explicitly confirms that the obstruction or localization fault has cleared.

`AUTONOMY_STATUS` WebSocket events let the operator console and passenger app follow these changes live. This controls only the mock state and low-voltage demonstrator outputs; it does not steer or brake a road vehicle.
