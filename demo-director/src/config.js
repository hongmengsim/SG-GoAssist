// Settings come from the environment, never from a file: the agents' start-up codes and the operator
// token are secrets, and they stay on the server (the browser never receives them).

const DEFAULT_STOP = "18331";
const DEFAULT_BACKEND = "http://localhost:3000";
const DEFAULT_PORT = 5190;
const DEFAULT_PAGE_HOST = "127.0.0.1";

function parseAgents(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw new Error("DEMO_AGENTS is not valid JSON");
  }
  if (!Array.isArray(list) || list.length === 0)
    throw new Error("DEMO_AGENTS must be a non-empty list of agents");
  return list.map((item, index) => {
    const { busId, url, code } = item ?? {};
    for (const [name, value] of [
      ["busId", busId],
      ["url", url],
      ["code", code],
    ])
      if (typeof value !== "string" || !value)
        throw new Error(`DEMO_AGENTS[${index}].${name} is required`);
    if (!/^https?:\/\//.test(url))
      throw new Error(`DEMO_AGENTS[${index}].url must be http or https`);
    return { busId, url: url.replace(/\/+$/, ""), code, label: `BUS ${index + 1}` };
  });
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env) {
  const token = env.DEMO_OPERATOR_TOKEN ?? env.OPERATOR_API_TOKEN ?? "";
  return {
    backendUrl: (env.DEMO_BACKEND_URL ?? DEFAULT_BACKEND).replace(/\/+$/, ""),
    operatorToken: token,
    stopCode: env.DEMO_STOP ?? DEFAULT_STOP,
    agents: parseAgents(env.DEMO_AGENTS ?? ""),
    port: Number(env.DEMO_PORT ?? DEFAULT_PORT),
    host: env.DEMO_HOST ?? DEFAULT_PAGE_HOST,
    pollMs: Number(env.DEMO_POLL_MS ?? 1000),
  };
}
