import {
  subscribeToRequestStatus,
  subscribeToStopVehiclePresence,
} from "../src/api/statusSocket";

type SocketHandler = ((event?: any) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: SocketHandler = null;
  onmessage: SocketHandler = null;
  onerror: SocketHandler = null;
  onclose: SocketHandler = null;
  sent: string[] = [];
  closed = false;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  disconnect() {
    this.onclose?.();
  }
}

describe("request status socket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.instances = [];
    Object.defineProperty(global, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("filters malformed and stale request messages", () => {
    const onUpdate = jest.fn();
    const stop = subscribeToRequestStatus("REQ-CURRENT", onUpdate, jest.fn());
    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "SUBSCRIBE",
      requestId: "REQ-CURRENT",
    });

    socket.message({
      type: "REQUEST_STATUS",
      requestId: "REQ-STALE",
      status: "ACKNOWLEDGED",
      timestamp: "2026-08-28T01:00:00.000Z",
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      source: "MOBILE_APP",
      busId: "BUS-1",
      busService: "191",
    });
    socket.onmessage?.({ data: "not json" });
    expect(onUpdate).not.toHaveBeenCalled();

    socket.message({
      type: "REQUEST_STATUS",
      requestId: "REQ-CURRENT",
      status: "ACKNOWLEDGED",
      timestamp: "2026-08-28T01:00:00.000Z",
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      source: "MOBILE_APP",
      busId: "BUS-1",
      busService: "191",
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    socket.message({
      type: "VEHICLE_STATUS",
      status: "APPROACHING",
      timestamp: "2026-08-28T01:01:00.000Z",
      busId: "BUS-OTHER",
      busService: "191",
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    socket.message({
      type: "VEHICLE_STATUS",
      status: "APPROACHING",
      timestamp: "2026-08-28T01:01:01.000Z",
      busId: "BUS-1",
      busService: "191",
    });
    expect(onUpdate).toHaveBeenCalledTimes(2);

    socket.message({
      type: "AUTONOMY_STATUS",
      timestamp: "2026-08-28T01:01:02.000Z",
      busId: "BUS-1",
      busService: "191",
      autonomy: {
        busId: "BUS-1",
        state: "PRECISION_STOPPING",
      },
    });
    expect(onUpdate).toHaveBeenCalledTimes(3);

    socket.message({
      type: "AUTONOMY_STATUS",
      timestamp: "2026-08-28T01:01:03.000Z",
      busId: "BUS-1",
      busService: "191",
      autonomy: {
        busId: "BUS-1",
        state: "UNSAFE_UNKNOWN_STATE",
      },
    });
    expect(onUpdate).toHaveBeenCalledTimes(3);
    stop();
  });

  it("reconnects with one scoped subscription and stops cleanly", () => {
    const onError = jest.fn();
    const onConnected = jest.fn();
    const stop = subscribeToRequestStatus("REQ-RECONNECT", jest.fn(), onError, {
      initialReconnectDelayMs: 25,
      maxReconnectDelayMs: 100,
      onConnected,
    });
    const first = MockWebSocket.instances[0];
    first.open();
    first.disconnect();

    expect(onError).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(25);
    const second = MockWebSocket.instances[1];
    second.open();
    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(JSON.parse(second.sent[0])).toEqual({
      type: "SUBSCRIBE",
      requestId: "REQ-RECONNECT",
    });

    stop();
    second.disconnect();
    jest.runOnlyPendingTimers();
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("subscribes to and filters the assistance-case lifecycle", () => {
    const onUpdate = jest.fn();
    const stop = subscribeToRequestStatus("REQ-CASE", onUpdate, jest.fn(), {
      caseId: "CASE-CURRENT",
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[1])).toEqual({
      type: "SUBSCRIBE_CASE",
      caseId: "CASE-CURRENT",
    });

    socket.message({
      type: "CASE_STATUS",
      caseId: "CASE-OTHER",
      stopCode: "18331",
      state: "READY",
      passengerCount: 1,
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      timestamp: "2026-08-31T01:00:00.000Z",
    });
    socket.message({
      type: "CASE_STATUS",
      caseId: "CASE-CURRENT",
      stopCode: "18331",
      state: "READY",
      passengerCount: 1,
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      timestamp: "2026-08-31T01:00:01.000Z",
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].state).toBe("READY");
    stop();
  });

  it("accepts safety, actuator and escalation updates only for the active bus and case", () => {
    const onUpdate = jest.fn();
    const stop = subscribeToRequestStatus("REQ-SAFETY", onUpdate, jest.fn(), {
      caseId: "CASE-SAFETY",
    });
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.message({
      type: "REQUEST_STATUS",
      requestId: "REQ-SAFETY",
      status: "ACKNOWLEDGED",
      timestamp: "2026-09-01T04:00:00.000Z",
      assistanceTypes: ["WHEELCHAIR_RAMP"],
      source: "MOBILE_APP",
      busId: "AV-095-01",
      busService: "95",
    });
    socket.message({
      type: "SAFETY_TELEMETRY",
      busId: "AV-OTHER",
      fresh: true,
      timestamp: "2026-09-01T04:00:01.000Z",
      telemetry: {
        busId: "AV-OTHER",
        vehicleStopped: true,
        parkingBrakeActive: true,
        doorOpen: true,
        deploymentPathClear: true,
        rampPosition: "DEPLOYED",
        observedAt: "2026-09-01T04:00:01.000Z",
      },
    });
    socket.message({
      type: "SAFETY_TELEMETRY",
      busId: "AV-095-01",
      stopCode: "18301",
      fresh: true,
      timestamp: "2026-09-01T04:00:02.000Z",
      telemetry: {
        busId: "AV-095-01",
        stopCode: "18301",
        vehicleStopped: true,
        parkingBrakeActive: true,
        doorOpen: true,
        deploymentPathClear: true,
        rampPosition: "DEPLOYED",
        observedAt: "2026-09-01T04:00:02.000Z",
      },
    });
    socket.message({
      type: "OPERATOR_ESCALATION",
      caseId: "CASE-SAFETY",
      busId: "AV-095-01",
      stopCode: "18301",
      reason: "Path needs review",
      timestamp: "2026-09-01T04:00:03.000Z",
    });
    socket.message({
      type: "ACTUATOR_STATUS",
      caseId: "CASE-SAFETY",
      busId: "AV-095-01",
      timestamp: "2026-09-01T04:00:04.000Z",
      status: {
        commandId: "CMD-1",
        caseId: "CASE-SAFETY",
        busId: "AV-095-01",
        state: "IN_PROGRESS",
        updatedAt: "2026-09-01T04:00:04.000Z",
      },
    });

    expect(onUpdate.mock.calls.map(([message]) => message.type)).toEqual([
      "REQUEST_STATUS",
      "SAFETY_TELEMETRY",
      "OPERATOR_ESCALATION",
      "ACTUATOR_STATUS",
    ]);
    stop();
  });

  it("subscribes to one stop and rejects presence for other stops", () => {
    const onUpdate = jest.fn();
    const stop = subscribeToStopVehiclePresence("18301", onUpdate, jest.fn());
    const socket = MockWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "SUBSCRIBE_STOP",
      stopCode: "18301",
    });
    const vehicle = {
      busId: "AV-095-01",
      busService: "95",
      stopCode: "18301",
      state: "PARKED",
      wheelchairAccessible: true,
      observedAt: "2026-09-01T01:00:00.000Z",
      fresh: true,
    };
    socket.message({
      type: "STOP_VEHICLE_PRESENCE",
      stopCode: "18321",
      vehicle: { ...vehicle, stopCode: "18321" },
      timestamp: "2026-09-01T01:00:00.000Z",
    });
    socket.message({
      type: "STOP_VEHICLE_PRESENCE",
      stopCode: "18301",
      vehicle,
      timestamp: "2026-09-01T01:00:01.000Z",
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(vehicle);
    stop();
  });
});
