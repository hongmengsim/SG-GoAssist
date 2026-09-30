/**
 * Rate limiting and overload shedding with priority (scalability method SM8).
 *
 * Every request belongs to a class. Each (class, key) pair has a token bucket, so one noisy
 * client cannot use up another's allowance. Separately, when the number of requests in flight
 * grows, the lowest-priority classes are shed first (browsing, then passengers, then operators);
 * safety traffic (buses reporting status, acknowledging, polling commands) is never shed.
 * Memory is bounded: idle keys are forgotten.
 */

export type RequestClass = "safety" | "operator" | "passenger" | "browse";

export interface ClassLimit {
  perSecond: number;
  burst: number;
  /** Refuse new requests of this class while more than this many are in flight. */
  shedAbove: number;
}

export type LimitConfig = Record<RequestClass, ClassLimit>;

// Deliberately generous for one bus fleet on one process; the point is the shape (a device gets
// far more room than a browsing client, and browsing goes first under load), not the numbers,
// which are placeholders to be set from load tests.
export const DEFAULT_LIMITS: LimitConfig = {
  safety: { perSecond: 200, burst: 400, shedAbove: Infinity },
  operator: { perSecond: 100, burst: 200, shedAbove: 800 },
  passenger: { perSecond: 30, burst: 60, shedAbove: 400 },
  browse: { perSecond: 30, burst: 60, shedAbove: 200 },
};

/**
 * Which allowance a request draws on. Bus traffic gets the safety class (never shed) only when
 * `trustedDevice` is true, meaning its signature was verified; anything else is limited like
 * an ordinary client, so nobody can claim safety priority by sending a device header.
 */
export function classifyRequest(
  method: string,
  path: string,
  trustedDevice = true,
): RequestClass {
  const safety =
    /^\/api\/operations\/(vehicles\/[^/]+\/[^/]+|actuators(\/.*)?|devices\/heartbeat)$/;
  if (path.startsWith("/api/operations/vehicles/") && method === "GET") {
    // Reading a bus's record is an operator action; only what a bus posts or polls is safety.
    if (!/\/requests$/.test(path)) return "operator";
  }
  if (safety.test(path)) return trustedDevice ? "safety" : "operator";
  if (path.startsWith("/api/operations")) return "operator";
  if (path.startsWith("/api/assistance") || path.startsWith("/api/passenger"))
    return "passenger";
  return "browse";
}

export interface Admission {
  ok: boolean;
  retryAfterSeconds: number;
  reason?: "rate" | "overload";
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface LimiterOptions {
  maxKeys?: number;
  idleMs?: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private inFlight = 0;
  private readonly maxKeys: number;
  private readonly idleMs: number;

  constructor(
    private readonly config: LimitConfig,
    private readonly now: () => number = Date.now,
    options: LimiterOptions = {},
  ) {
    this.maxKeys = options.maxKeys ?? 10_000;
    this.idleMs = options.idleMs ?? 5 * 60_000;
  }

  enter(): void {
    this.inFlight += 1;
  }

  leave(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  trackedKeys(): number {
    return this.buckets.size;
  }

  admit(klass: RequestClass, key: string): Admission {
    const limit = this.config[klass];
    if (this.inFlight > limit.shedAbove) {
      return { ok: false, retryAfterSeconds: 1, reason: "overload" };
    }
    const at = this.now();
    const id = `${klass}:${key}`;
    let bucket = this.buckets.get(id);
    if (!bucket) {
      this.makeRoom(at);
      bucket = { tokens: limit.burst, updatedAt: at };
      this.buckets.set(id, bucket);
    }
    bucket.tokens = Math.min(
      limit.burst,
      bucket.tokens + ((at - bucket.updatedAt) / 1000) * limit.perSecond,
    );
    bucket.updatedAt = at;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true, retryAfterSeconds: 0 };
    }
    const wait = Math.ceil((1 - bucket.tokens) / limit.perSecond);
    return { ok: false, retryAfterSeconds: Math.max(1, wait), reason: "rate" };
  }

  private makeRoom(at: number): void {
    if (this.buckets.size < this.maxKeys) return;
    for (const [id, bucket] of this.buckets) {
      if (at - bucket.updatedAt > this.idleMs) this.buckets.delete(id);
    }
    if (this.buckets.size >= this.maxKeys) {
      // Still full of active keys: drop the oldest so the table cannot grow without bound.
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
  }
}
