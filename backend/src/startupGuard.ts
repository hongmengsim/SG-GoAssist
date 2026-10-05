/**
 * Refuses to start a server that would be open to the world by accident. With no operator
 * token and no device secret every operator route, the data reset and the bus endpoints answer
 * anyone, which is fine on a developer's laptop and a serious mistake anywhere else. So when
 * the environment says this is not a laptop (production, or a shared database, Redis or locks
 * are configured) both must be set, unless `GOASSIST_ALLOW_INSECURE=true` says the operator
 * knows and accepts that (the multi-process test scripts do).
 */
export interface GuardEnvironment {
  [name: string]: string | undefined;
}

export interface SecurityCheck {
  /** True when the environment is one that must be locked down. */
  shared: boolean;
  problems: string[];
  /** The operator chose to run open anyway. */
  overridden: boolean;
}

const on = (value: string | undefined) =>
  ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());

export function checkSecurity(env: GuardEnvironment): SecurityCheck {
  const shared =
    env.NODE_ENV === "production" ||
    Boolean(env.GOASSIST_DATABASE_URL?.trim()) ||
    Boolean(env.GOASSIST_REDIS_URL?.trim()) ||
    (env.GOASSIST_EVENT_BUS ?? "").trim().toLowerCase() === "redis" ||
    (env.GOASSIST_LOCKS ?? "").trim().toLowerCase() === "database";
  const problems: string[] = [];
  if (!env.OPERATOR_API_TOKEN?.trim())
    problems.push(
      "OPERATOR_API_TOKEN is not set (operator routes and the data reset would be open)",
    );
  if (!env.DEVICE_SHARED_SECRET?.trim() && !env.DEVICE_SECRETS?.trim())
    problems.push(
      "DEVICE_SHARED_SECRET or DEVICE_SECRETS is not set (bus endpoints would accept anyone)",
    );
  if ((env.GOASSIST_AUTO_ACK ?? "").trim().toLowerCase() !== "off")
    problems.push(
      'GOASSIST_AUTO_ACK is not "off" (the backend would confirm requests itself, and only a bus may)',
    );
  return { shared, problems, overridden: on(env.GOASSIST_ALLOW_INSECURE) };
}

/** Hosts that only this machine can reach. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Warnings about the Redis address: an event bus with no password on an address other
 * machines can reach lets anyone on that network publish operator and bus events.
 */
export function redisWarnings(env: GuardEnvironment): string[] {
  const raw = env.GOASSIST_REDIS_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    if (LOOPBACK.has(url.hostname) || url.password) return [];
    return [
      `GOASSIST_REDIS_URL points at ${url.hostname} with no password; anyone who can reach it can publish events`,
    ];
  } catch {
    return ["GOASSIST_REDIS_URL is not a valid URL"];
  }
}

/**
 * Throws when a shared or production environment is missing its secrets. When the override is
 * set it returns the problems instead, for the caller to log loudly.
 */
export function assertSecureStart(env: GuardEnvironment): string[] {
  const check = checkSecurity(env);
  if (!check.shared || check.problems.length === 0) return [];
  if (check.overridden) return check.problems;
  throw new Error(
    `Refusing to start: ${check.problems.join("; ")}. Set them, or set GOASSIST_ALLOW_INSECURE=true to run open on purpose.`,
  );
}
