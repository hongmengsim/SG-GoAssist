# SG GoAssist MVP Architecture

SG GoAssist helps less-abled passengers travel with confidence by making bus journeys easier, safer, and more independent.

## Backend Stack Choice

Use Node.js, Express, TypeScript, and `ws`.

This stack is intentionally small: Express handles request creation through REST, `ws` handles live status updates, and in-memory storage keeps the first demo easy to run. It is enough for the MVP and can later be replaced behind the same service interfaces with a database, queue, or real AV controller integration.

## Folder Structure

- `contracts`: TypeScript contracts shared by app, backend, and simulator.
- `backend`: Passenger Assistance Engine, REST API, WebSocket broadcaster, mocked bus data, simulator control.
- `passenger-app`: Expo React Native passenger app.
- `docs`: Architecture notes for the student engineering team.

## Communication Model

1. Passenger app requests mocked nearby buses:
   `GET /api/assistance/buses/mock?service=191`
2. Passenger app creates a standardized request:
   `POST /api/assistance/request`
3. Backend returns `requestId`, `status`, and `createdAt`.
4. Passenger app opens `ws://<backend-host>:3000`.
5. Passenger app sends:
   `{ "type": "SUBSCRIBE", "requestId": "REQ-..." }`
6. Backend broadcasts status updates for that request.

Future RFID, physical button, camera/LiDAR, and sensor inputs should map their signal into `CreateAssistanceRequestPayload`, then submit it to the same Passenger Assistance Engine. They should not create a parallel request shape.

## Location-Aware Bus Selection

The app requests foreground location only when the passenger chooses `Use my location`. It sends one latitude/longitude reading to the backend:

`POST /api/location/nearby-bus-stops`

The backend returns up to three nearby mocked bus stops ranked by distance. The passenger must confirm the stop before buses are shown. The app does not automatically assume the closest stop is correct.

After confirmation, the app requests mocked arrivals:

`GET /api/location/bus-stops/:busStopCode/arrivals`

The arrival response includes a prototype AV fleet mapping, for example public-facing `Service 191 / NEXT_BUS` mapped to `AV-191-03`. This simulates the future layer that will connect public arrival data to actual autonomous bus IDs. Real LTA DataMall API keys remain backend-only and are not used in this offline prototype.

No continuous background GPS is used in this slice.

## Assistance Request State Machine

`SENDING -> ACKNOWLEDGED -> CANCELLED`

`SENDING -> FAILED`

Vehicle status is a separate model:

`APPROACHING -> ARRIVED -> DEPARTED`

`APPROACHING` and `ARRIVED` are never assistance request statuses. They are vehicle events from the autonomous bus simulator.

## Assistance Types

- `WHEELCHAIR_RAMP`: passenger requests ramp assistance. The app does not control or validate ramp deployment.
- `BUS_AUDIO_IDENTIFICATION`: passenger requests bus identification assistance. When the simulated bus approaches and has an acknowledged matching request, the simulator records an external announcement event.
- `EXTENDED_DWELL_TIME`: passenger requests additional boarding time. The app does not decide door timing or vehicle movement safety.

## App Accessibility Preferences

Phone-only accessibility preferences are separate from bus-facing `AssistanceType` values. They are not sent to the autonomous bus.

Examples:

- `screenReaderOptimised`
- `hapticAlerts`
- `largeText`
- `highContrast`
- `repeatAudio`

For hearing-impaired passenger support, any spoken update should also be displayed visually and, when enabled, paired with haptic feedback.

For visually impaired passenger support, the app announces selected buses, repeats journey guidance on demand, and uses a distinct repeated haptic cue when the selected bus is approaching. `BUS_AUDIO_IDENTIFICATION` remains bus-facing assistance: it can ask the autonomous bus to announce its service number externally, while screen-reader guidance and repeat announcements stay on the phone.

Passenger profiles store curated assistance defaults for each individual. Bus-facing defaults become request types such as `WHEELCHAIR_RAMP`, `BUS_AUDIO_IDENTIFICATION`, and `EXTENDED_DWELL_TIME`; phone-only defaults such as haptics, high contrast, large text, and repeat announcements stay in the app profile and are not sent to the bus.

Accessibility verification is separate from assistance preferences. A profile can be `UNVERIFIED`, `PENDING`, or `VERIFIED` through a method such as a demo credential, PWD concession card, or senior concession card. Verification means eligibility/trust, not a diagnosis; the passenger still chooses functional needs. The prototype mocks verification and stores only status, method, and an optional credential suffix. A production version would require an authorised verification provider rather than direct card reading.

## Input Adapter Boundary

All input sources should submit an `AssistanceRequestInput` into the backend assistance request service:

- `MOBILE_APP`
- `PHYSICAL_BUTTON`
- `RFID` (future)
- `AUTOMATIC_DETECTION` (future)

For Vertical Slice 3, both the app and the development physical-button endpoint create the same standardized `WHEELCHAIR_RAMP` request. The request `source` is logged and shown for debugging, but it does not change how the autonomous bus receives or acknowledges the wheelchair-ramp assistance need.

Development physical button endpoint:

`POST /api/assistance/hardware/physical-button/wheelchair-ramp`

The ESP32 prototype in `archive/legacy-hardware/esp32-physical-button` calls this endpoint when its physical button is pressed. The backend waits briefly for the simulated bus acknowledgement before returning confirmation feedback instructions for LED/buzzer output.

Current duplicate consolidation is prototype request de-duplication, not passenger counting:

`same bus + same assistance type = one active bus action`

Later versions should distinguish one passenger pressing twice from two separate wheelchair users requesting the same bus. The bus may still only need one ramp deployment, but the system should eventually preserve both passenger intents.

## Minimum Dependencies

- App: Expo, React, React Native, TypeScript.
- Phone feedback: `AccessibilityInfo.announceForAccessibility` and Expo Haptics.
- Backend: Express, CORS, dotenv, ws, TypeScript, ts-node-dev.
- Shared: TypeScript only.

## First Vertical Slice

Implemented scope:

1. Accessibility setup with wheelchair ramp selected by default.
2. Select mocked Service 191 bus.
3. Confirm destination and assistance request.
4. Backend receives and stores request.
5. Simulated AV automatically acknowledges the request.
6. App receives `ACKNOWLEDGED` in real time over WebSocket.

Out of scope for this slice: RFID, ML, LiDAR, physical buttons, real ramp hardware, accounts, medical information, persistent database, maps, and full alighting flow.
