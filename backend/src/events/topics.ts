import type { BusEvent } from "./types";

/**
 * Topic names. Passenger topics reproduce exactly what the WebSocket server used to
 * match by comparing ids; operator topics ("op:") are a separate namespace so an
 * operator-only message can never reach a passenger subscription.
 */
export const topic = {
  request: (id: string) => `request:${id}`,
  case: (id: string) => `case:${id}`,
  bus: (id: string) => `bus:${id}`,
  stop: (code: string) => `stop:${code}`,
  operatorBus: (id: string) => `op:bus:${id}`,
  operatorStop: (code: string) => `op:stop:${code}`,
} as const;

export interface ScopeKeys {
  busIds: Set<string>;
  stopCodes: Set<string>;
}

/** Objects that carry a bus or stop inside a message. */
const NESTED_CONTAINERS = [
  "status",
  "ramp",
  "decision",
  "help",
  "halt",
  "telemetry",
  "vehicle",
  "autonomy",
  "health",
  "bay",
  "request",
] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function add(target: Set<string>, value: unknown): void {
  if (isId(value)) target.add(value);
}

/**
 * The buses and stops a message concerns, wherever it keeps them. Used to decide
 * which scoped operators should see it.
 */
export function scopeKeysFor(message: BusEvent): ScopeKeys {
  const keys: ScopeKeys = { busIds: new Set(), stopCodes: new Set() };
  const collect = (source: UnknownRecord | undefined): void => {
    if (!source) return;
    add(keys.busIds, source.busId);
    add(keys.stopCodes, source.stopCode);
    add(keys.busIds, source.occupantBusId);
    add(keys.busIds, source.grantedBusId);
    if (Array.isArray(source.waitingBusIds)) {
      for (const id of source.waitingBusIds) add(keys.busIds, id);
    }
  };
  const record = message as unknown as UnknownRecord;
  collect(record);
  for (const name of NESTED_CONTAINERS) collect(asRecord(record[name]));
  return keys;
}

/**
 * Topics a passenger socket may subscribe to for this message. Only ids at the top
 * level count, so operator-only messages, which keep their bus nested, produce none.
 */
export function passengerTopicsFor(message: BusEvent): string[] {
  const record = message as unknown as UnknownRecord;
  const topics: string[] = [];
  if (isId(record.caseId)) topics.push(topic.case(record.caseId));
  if (isId(record.requestId)) topics.push(topic.request(record.requestId));
  // Per-passenger updates are never put on the bus topic: every passenger watching a bus would
  // receive them, learn other passengers' request ids, and (cancel being open) could cancel them.
  const perPassenger =
    message.type === "REQUEST_STATUS" || message.type === "CASE_STATUS";
  if (isId(record.busId) && !perPassenger) topics.push(topic.bus(record.busId));
  if (message.type === "STOP_VEHICLE_PRESENCE" && isId(record.stopCode)) {
    topics.push(topic.stop(record.stopCode));
  }
  return topics;
}

/** Topics a scoped operator socket subscribes to for this message. */
export function operatorTopicsFor(message: BusEvent): string[] {
  const keys = scopeKeysFor(message);
  return [
    ...[...keys.busIds].map(topic.operatorBus),
    ...[...keys.stopCodes].map(topic.operatorStop),
  ];
}
