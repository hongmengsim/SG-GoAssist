// Fake agents and a fake backend, as small HTTP servers, so the director is tested the way it runs.
import { createServer } from "node:http";

export function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      }),
    ),
  );
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

/** An agent status page: /api/state and /api/control, guarded by a code. */
export async function fakeAgent({
  busId,
  code,
  simulated,
  controlLevel,
  movement = "TRAVELLING_TO_STOP",
  ramp = "STOWED",
}) {
  const calls = [];
  const agent = {
    busId,
    simulated,
    controlLevel,
    movement: { code: movement, text: movement },
    ramp: { state: ramp },
    decision: { permission: "CONTINUE", reasons: [] },
    link: { ok: true },
    beam: { state: "BEAM_CLEAR", simulated },
    camera: { imageOk: true },
  };
  const listening = await listen(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.headers["x-status-token"] !== code)
      return send(403, { error: "wrong code" });
    if (request.method === "GET" && request.url === "/api/state")
      return send(200, agent);
    if (request.method === "POST" && request.url === "/api/control") {
      const body = await readBody(request);
      calls.push(body);
      return send(202, { queued: body.command });
    }
    send(404, { error: "not found" });
  });
  return { ...listening, calls, agent, code };
}

/** The few backend routes the director uses, recording every path it is asked for. */
export async function fakeBackend({ token, bay, requests = [], halts = [] }) {
  const paths = [];
  const bodies = [];
  const state = { bay, requests, halts, audit: [] };
  const listening = await listen(async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    paths.push(`${request.method} ${request.url}`);
    if (request.headers.authorization !== `Bearer ${token}`)
      return send(401, { error: "token" });
    const body = request.method === "POST" ? await readBody(request) : {};
    if (request.method === "POST") bodies.push({ url: request.url, body });
    const url = request.url ?? "";
    if (request.method === "GET") {
      if (url.startsWith("/api/operations/bays/")) return send(200, state.bay);
      if (url.startsWith("/api/operations/bus-status"))
        return send(200, { statuses: [] });
      if (url.startsWith("/api/assistance"))
        return send(200, { requests: state.requests });
      if (url.startsWith("/api/operations/operator-halts"))
        return send(200, { records: state.halts });
      if (url.startsWith("/api/operations/audit"))
        return send(200, { events: state.audit });
    }
    if (request.method === "POST") {
      if (url === "/api/assistance/request")
        return send(201, { requestId: "REQ-NEW", caseId: "CASE-NEW" });
      if (url.endsWith("/proceed")) return send(200, { grantedBusId: "AV-2" });
      if (url.endsWith("/operator-halt"))
        return send(200, { halted: body.halted });
      if (url.includes("/cases/") && url.endsWith("/operator"))
        return send(200, { state: "CANCELLED" });
    }
    send(404, { error: "not found" });
  });
  return { ...listening, paths, bodies, state };
}

export const bayFree = (stop = "18331") => ({
  stopCode: stop,
  occupantBusId: null,
  grantedBusId: null,
  waitingBusIds: [],
});

export function directorConfig(agents, backendUrl) {
  return {
    backendUrl,
    operatorToken: "operator-token",
    stopCode: "18331",
    agents: agents.map((agent, index) => ({
      busId: agent.agent.busId,
      url: agent.url,
      code: agent.code,
      label: `BUS ${index + 1}`,
    })),
    port: 0,
    host: "127.0.0.1",
    pollMs: 1000,
  };
}
