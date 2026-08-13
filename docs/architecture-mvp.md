# BusPass Assistance MVP Architecture

## Backend Stack Choice

Use Node.js, Express, TypeScript, and `ws`.

This stack is intentionally small: Express handles request creation through REST, `ws` handles live status updates, and in-memory storage keeps the first demo easy to run. It is enough for the MVP and can later be replaced behind the same service interfaces with a database, queue, or real AV controller integration.

## Folder Structure

- `packages/shared`: TypeScript contracts shared by app, backend, and simulator.
- `packages/backend`: Passenger Assistance Engine, REST API, WebSocket broadcaster, mocked bus data, simulator control.
- `packages/app`: Expo React Native passenger app.
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

## Assistance Request State Machine

`SENDING -> ACKNOWLEDGED -> CANCELLED`

`SENDING -> FAILED`

Vehicle status is a separate model:

`APPROACHING -> ARRIVED -> DEPARTED`

`APPROACHING` and `ARRIVED` are never assistance request statuses. They are vehicle events from the autonomous bus simulator.

## Assistance Types

- `WHEELCHAIR_RAMP`: passenger requests ramp assistance. The app does not control or validate ramp deployment.
- `BUS_AUDIO_IDENTIFICATION`: passenger requests bus identification assistance. When the simulated bus approaches and has an acknowledged matching request, the simulator records an external announcement event.

## Input Adapter Boundary

All input sources should submit an `AssistanceRequestInput` into the backend assistance request service:

- `MOBILE_APP`
- `PHYSICAL_BUTTON`
- `RFID` (future)
- `AUTOMATIC_DETECTION` (future)

For Vertical Slice 3, both the app and the development physical-button endpoint create the same standardized `WHEELCHAIR_RAMP` request. The request `source` is logged and shown for debugging, but it does not change how the autonomous bus receives or acknowledges the wheelchair-ramp assistance need.

Development physical button endpoint:

`POST /api/assistance/hardware/physical-button/wheelchair-ramp`

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
