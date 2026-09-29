// Runs the app journey with the bus, not the backend timer, acknowledging requests (roadmap R2).
process.env.GOASSIST_JOURNEY_BUS_ACK = "1";
await import("./full-journey-managed.mjs");
