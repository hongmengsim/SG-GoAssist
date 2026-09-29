/**
 * In-process request metrics: counts by workload group and status class, latency percentiles
 * over a bounded window, and requests in flight. Memory is bounded however long it runs.
 * (Scalability method SM13; the prototype keeps these per process, a fleet would export them.)
 */

export interface GroupSnapshot {
  count: number;
  status: Record<string, number>;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  samples: number;
}

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  total: number;
  inFlight: number;
  groups: Record<string, GroupSnapshot>;
}

interface Group {
  count: number;
  status: Record<string, number>;
  window: number[];
  next: number;
  max: number;
}

/** The value at a rank (nearest-rank method); 0 for no data. */
export function percentile(values: number[], rank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1);
  return sorted[index];
}

const statusClass = (status: number) => `${Math.floor(status / 100)}xx`;

export class Metrics {
  private readonly groups = new Map<string, Group>();
  private inFlight = 0;
  private readonly startedMs: number;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly windowSize = 1000,
  ) {
    this.startedMs = now();
  }

  started(): void {
    this.inFlight += 1;
  }

  finished(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  record(group: string, status: number, durationMs: number): void {
    let entry = this.groups.get(group);
    if (!entry) {
      entry = { count: 0, status: {}, window: [], next: 0, max: 0 };
      this.groups.set(group, entry);
    }
    entry.count += 1;
    const key = statusClass(status);
    entry.status[key] = (entry.status[key] ?? 0) + 1;
    entry.max = Math.max(entry.max, durationMs);
    if (entry.window.length < this.windowSize) entry.window.push(durationMs);
    else {
      entry.window[entry.next] = durationMs;
      entry.next = (entry.next + 1) % this.windowSize;
    }
  }

  snapshot(): MetricsSnapshot {
    const groups: Record<string, GroupSnapshot> = {};
    let total = 0;
    for (const [name, entry] of this.groups) {
      total += entry.count;
      groups[name] = {
        count: entry.count,
        status: { ...entry.status },
        p50Ms: percentile(entry.window, 50),
        p95Ms: percentile(entry.window, 95),
        p99Ms: percentile(entry.window, 99),
        maxMs: entry.max,
        samples: entry.window.length,
      };
    }
    return {
      startedAt: new Date(this.startedMs).toISOString(),
      uptimeSeconds: Math.round((this.now() - this.startedMs) / 1000),
      total,
      inFlight: this.inFlight,
      groups,
    };
  }
}
