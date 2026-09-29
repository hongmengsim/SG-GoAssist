import { BusOperationsValidationError } from "./busOperationsService";

export const MAX_FUTURE_SKEW_MS = 60_000;

export function fail(message: string): never {
  throw new BusOperationsValidationError(message);
}

export function asObject(
  input: unknown,
  what: string,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    fail(`${what} must be a JSON object`);
  }
  return input as Record<string, unknown>;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (!(allowed as readonly unknown[]).includes(value)) {
    fail(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") fail(`${field} must be true or false`);
  return value;
}

export function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maxLength
  ) {
    fail(
      `${field} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value.trim();
}

export function observedAt(value: unknown, now: number): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("observedAt must be an ISO date-time");
  }
  if (Date.parse(value) > now + MAX_FUTURE_SKEW_MS) {
    fail("observedAt is too far in the future");
  }
  return value;
}

export function matchBusId(body: Record<string, unknown>, busId: string): void {
  if (body.busId !== undefined && body.busId !== busId) {
    fail("busId in the body must match the bus in the path");
  }
}
