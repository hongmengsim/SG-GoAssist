const WebSocket = require("ws");

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

const audioPayload = {
  sessionId: "smoke-session",
  busService: "191",
  busId: "SBS-191-001",
  boardingStop: "Changi Airport Terminal 1",
  destination: "Kent Ridge Terminal",
  assistanceTypes: ["BUS_AUDIO_IDENTIFICATION"],
  boardingOrAlighting: "BOARDING",
};

const wheelchairPayload = {
  sessionId: "smoke-wheelchair-mobile",
  busService: "191",
  busId: "SBS-191-001",
  boardingStop: "Changi Airport Terminal 1",
  destination: "Kent Ridge Terminal",
  assistanceTypes: ["WHEELCHAIR_RAMP"],
  source: "MOBILE_APP",
  boardingOrAlighting: "BOARDING",
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

function subscribe(requestId, expectedMessages) {
  const socket = new WebSocket(WS_BASE_URL);
  const seen = [];

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for ${expectedMessages.join(", ")}. Saw: ${JSON.stringify(seen)}`,
        ),
      );
    }, 5000);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "SUBSCRIBE", requestId }));
    });

    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      seen.push(message);
      const labels = seen.map(
        (item) => `${item.type}:${item.status ?? item.announcement}`,
      );
      const complete = expectedMessages.every((expected) =>
        labels.includes(expected),
      );
      if (complete) {
        clearTimeout(timer);
        resolve(seen);
      }
    });

    socket.on("error", reject);
  });

  return { socket, done };
}

async function main() {
  await request("/admin/reset", { method: "POST" });

  const nearbyStops = await request("/api/location/nearby-bus-stops", {
    method: "POST",
    body: JSON.stringify({
      latitude: 1.2942,
      longitude: 103.7711,
      accuracyMeters: 12,
    }),
  });
  if (
    !nearbyStops.stops.length ||
    nearbyStops.stops[0].busStopCode !== "16009"
  ) {
    throw new Error("Expected nearest normalized bus stop 16009");
  }

  const arrivals = await request("/api/location/bus-stops/19011/arrivals");
  const next191 = arrivals.services
    .find((service) => service.serviceNo === "191")
    ?.buses.find((bus) => bus.arrivalSlot === "NEXT_BUS");
  if (!next191 || next191.busId !== "AV-191-03") {
    throw new Error("Expected mocked AV fleet mapping for next Service 191");
  }

  const wheelchair = await request("/api/assistance/request", {
    method: "POST",
    body: JSON.stringify(wheelchairPayload),
  });
  const wheelchairSubscription = subscribe(wheelchair.requestId, [
    "REQUEST_STATUS:ACKNOWLEDGED",
  ]);
  await wheelchairSubscription.done;
  wheelchairSubscription.socket.close();

  const mobileRequests = await request("/api/assistance");
  const mobileWheelchair = mobileRequests.requests.find(
    (item) => item.requestId === wheelchair.requestId,
  );
  if (!mobileWheelchair || mobileWheelchair.source !== "MOBILE_APP") {
    throw new Error(
      "Expected mobile wheelchair request source to be MOBILE_APP",
    );
  }

  await request("/admin/reset", { method: "POST" });

  const button = await request(
    "/api/assistance/hardware/physical-button/wheelchair-ramp",
    {
      method: "POST",
      body: JSON.stringify({
        busService: "191",
        busId: "SBS-191-001",
        boardingStop: "Changi Airport Terminal 1",
      }),
    },
  );

  if (
    button.source !== "PHYSICAL_BUTTON" ||
    button.status !== "ACKNOWLEDGED" ||
    button.feedback.led !== "CONFIRMATION_ON"
  ) {
    throw new Error("Expected physical button confirmation feedback");
  }

  const buttonRequests = await request("/api/assistance");
  const buttonWheelchair = buttonRequests.requests.find(
    (item) => item.requestId === button.requestId,
  );
  if (!buttonWheelchair || buttonWheelchair.source !== "PHYSICAL_BUTTON") {
    throw new Error(
      "Expected physical button wheelchair request source to be PHYSICAL_BUTTON",
    );
  }

  const duplicate = await request("/api/assistance/request", {
    method: "POST",
    body: JSON.stringify({
      ...wheelchairPayload,
      sessionId: "smoke-wheelchair-mobile-again",
    }),
  });
  if (
    duplicate.requestId !== button.requestId ||
    duplicate.duplicateOfRequestId !== button.requestId
  ) {
    throw new Error(
      "Expected active mobile/button duplicate wheelchair need to be consolidated",
    );
  }

  await request("/admin/reset", { method: "POST" });

  const created = await request("/api/assistance/request", {
    method: "POST",
    body: JSON.stringify(audioPayload),
  });

  const first = subscribe(created.requestId, [
    "REQUEST_STATUS:ACKNOWLEDGED",
    "VEHICLE_STATUS:APPROACHING",
    "EXTERNAL_ANNOUNCEMENT:Bus 191",
    "VEHICLE_STATUS:ARRIVED",
  ]);

  await new Promise((resolve) => setTimeout(resolve, 600));
  await request("/api/assistance/simulator/vehicle", {
    method: "POST",
    body: JSON.stringify({ busId: audioPayload.busId, status: "APPROACHING" }),
  });
  await request("/api/assistance/simulator/vehicle", {
    method: "POST",
    body: JSON.stringify({ busId: audioPayload.busId, status: "ARRIVED" }),
  });

  await first.done;
  first.socket.close();

  const announcements = await request(
    "/api/assistance/simulator/announcements",
  );
  if (announcements.count !== 1) {
    throw new Error(`Expected one announcement, got ${announcements.count}`);
  }

  await request("/admin/reset", { method: "POST" });
  const cancelCreated = await request("/api/assistance/request", {
    method: "POST",
    body: JSON.stringify({
      ...audioPayload,
      sessionId: "smoke-cancel-session",
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await request(`/api/assistance/${cancelCreated.requestId}/cancel`, {
    method: "POST",
  });
  await request("/api/assistance/simulator/vehicle", {
    method: "POST",
    body: JSON.stringify({ busId: audioPayload.busId, status: "APPROACHING" }),
  });

  const cancelledAnnouncements = await request(
    "/api/assistance/simulator/announcements",
  );
  if (cancelledAnnouncements.count !== 0) {
    throw new Error(
      `Expected no announcement after cancellation, got ${cancelledAnnouncements.count}`,
    );
  }

  console.log("SG GoAssist E2E smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
