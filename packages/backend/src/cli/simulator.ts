import readline from "readline";
import { SimulatorCommand, VehicleStatus } from "@buspass/shared";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function showHelp() {
  console.log("SIMULATED AV - BUSPASS");
  console.log("Commands:");
  console.log("  list");
  console.log("  ack <requestId>");
  console.log("  cancel <requestId>");
  console.log("  fail <requestId>");
  console.log("  vehicle <busId> <APPROACHING|ARRIVED|DEPARTED>");
  console.log("  announcements");
  console.log("  exit");
}

async function listRequests() {
  const response = await fetch(`${API_BASE_URL}/api/assistance`);
  const body = (await response.json()) as {
    requests: Array<{
      requestId: string;
      busService: string;
      busId: string;
      assistanceTypes: string[];
      source: string;
      status: string;
    }>;
  };

  console.table(
    body.requests.map((request) => ({
      requestId: request.requestId,
      bus: request.busService,
      vehicle: request.busId,
      assistance: request.assistanceTypes.join(", "),
      source: request.source,
      status: request.status,
    }))
  );
}

async function sendRequestCommand(requestId: string, command: SimulatorCommand["command"]) {
  const response = await fetch(`${API_BASE_URL}/api/assistance/simulator/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, command }),
  });
  const body = (await response.json()) as { message: string };
  console.log(body.message);
}

async function sendVehicleCommand(busId: string, status: VehicleStatus) {
  const response = await fetch(`${API_BASE_URL}/api/assistance/simulator/vehicle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ busId, status }),
  });
  const body = (await response.json()) as { message: string; announcement?: { announcement: string } };
  console.log(body.message);
  if (body.announcement) {
    console.log(`External announcement triggered: ${body.announcement.announcement}`);
  }
}

async function listAnnouncements() {
  const response = await fetch(`${API_BASE_URL}/api/assistance/simulator/announcements`);
  const body = (await response.json()) as {
    announcements: Array<{ busService: string; busId: string; requestId: string; announcement: string }>;
  };
  console.table(body.announcements);
}

showHelp();

rl.on("line", async (line) => {
  const [action, first, second] = line.trim().split(/\s+/);

  try {
    if (action === "exit") {
      rl.close();
      return;
    }
    if (action === "list") {
      await listRequests();
      return;
    }
    if (action === "ack" && first) {
      await sendRequestCommand(first, "ACKNOWLEDGE");
      return;
    }
    if (action === "cancel" && first) {
      await sendRequestCommand(first, "CANCEL");
      return;
    }
    if (action === "fail" && first) {
      await sendRequestCommand(first, "FAIL");
      return;
    }
    if (action === "vehicle" && first && second) {
      await sendVehicleCommand(first, second as VehicleStatus);
      return;
    }
    if (action === "announcements") {
      await listAnnouncements();
      return;
    }

    showHelp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
});
