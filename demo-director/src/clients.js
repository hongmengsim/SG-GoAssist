// The two things the director talks to. Both keep their secrets here, on the server.

const TIMEOUT_MS = 4000;

async function call(fetchFn, url, options) {
  try {
    const response = await fetchFn(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * A bus agent's own status page and control API. The start-up code the agent printed is sent as the
 * `X-Status-Token` header. The agent decides what it will accept: a simulated bus takes scene and
 * movement commands, a real bus started with --demo-movement takes movement commands only.
 */
export function createAgentClient({ url, code, fetchFn = fetch }) {
  const headers = { "X-Status-Token": code };
  return {
    state: () => call(fetchFn, `${url}/api/state`, { headers }),
    control: (body) =>
      call(fetchFn, `${url}/api/control`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

/**
 * The backend's existing REST routes, with the operator token. Nothing here can acknowledge a request
 * for a bus or change a ramp: those routes are not called, and the director holds no device secret.
 */
export function createBackendClient({ baseUrl, token, fetchFn = fetch }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path) => call(fetchFn, `${baseUrl}${path}`, { headers });
  const post = (path, body) =>
    call(fetchFn, `${baseUrl}${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const enc = encodeURIComponent;
  return {
    bay: (stop) => get(`/api/operations/bays/${enc(stop)}`),
    busStatuses: () => get("/api/operations/bus-status?limit=100"),
    requests: () => get("/api/assistance"),
    halts: () => get("/api/operations/operator-halts?limit=100"),
    audit: (limit = 40) => get(`/api/operations/audit?limit=${limit}`),
    createRequest: (body) => post("/api/assistance/request", body),
    proceed: (stop) => post(`/api/operations/bays/${enc(stop)}/proceed`, {}),
    setHalt: (busId, halted, reason) =>
      post(
        `/api/operations/vehicles/${enc(busId)}/operator-halt`,
        halted ? { halted: true, reason } : { halted: false },
      ),
    cancelCase: (caseId, reason) =>
      post(`/api/operations/cases/${enc(caseId)}/operator`, {
        action: "CANCEL",
        reason,
      }),
  };
}
