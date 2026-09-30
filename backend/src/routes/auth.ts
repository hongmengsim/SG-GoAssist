import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/** Compares two secrets without leaking, through timing, how much of them matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

/** Bearer-token check for operator endpoints. Open when OPERATOR_API_TOKEN is unset (development). */
export function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.OPERATOR_API_TOKEN;
  if (!expected) {
    next();
    return;
  }
  if (
    !safeEqual(String(req.headers.authorization ?? ""), `Bearer ${expected}`)
  ) {
    res.status(401).json({ error: "Operator authentication required" });
    return;
  }
  next();
}

/** The fixed body a device signs when it subscribes to its own bus over the WebSocket. */
export const DEVICE_SUBSCRIBE_BODY = "SUBSCRIBE_DEVICE";
const SIGNATURE_WINDOW_MS = 60_000;
/** Signatures remembered to refuse an exact replay; bounded so it cannot grow without limit. */
const MAX_REMEMBERED_SIGNATURES = 20_000;

let perDeviceSecrets:
  { source: string; secrets: Map<string, string> } | undefined;

/**
 * The secret one device signs with. `DEVICE_SECRETS` is a JSON object of device id to secret
 * (so one stolen secret is one bus, not the fleet); a device not listed falls back to
 * `DEVICE_SHARED_SECRET`. Returns undefined when neither is configured (development mode).
 */
export function deviceSecretFor(deviceId: string): string | undefined {
  const source = process.env.DEVICE_SECRETS ?? "";
  if (!perDeviceSecrets || perDeviceSecrets.source !== source) {
    const secrets = new Map<string, string>();
    if (source.trim()) {
      const parsed = JSON.parse(source) as Record<string, unknown>;
      for (const [id, secret] of Object.entries(parsed))
        if (typeof secret === "string" && secret) secrets.set(id, secret);
    }
    perDeviceSecrets = { source, secrets };
  }
  return (
    perDeviceSecrets.secrets.get(deviceId) ??
    (process.env.DEVICE_SHARED_SECRET || undefined)
  );
}

/** True when any device secret is configured, so device requests must be signed. */
export function deviceAuthEnabled(): boolean {
  return (
    Boolean(process.env.DEVICE_SHARED_SECRET) ||
    Boolean(process.env.DEVICE_SECRETS?.trim())
  );
}

export interface DeviceSignatureCheck {
  secret: string;
  deviceId: string;
  timestamp: string;
  signature: string;
  body: Buffer | string;
  /** Bound into the signature so it cannot be replayed on another method or path (HTTP). */
  method?: string;
  path?: string;
  now?: number;
}

/**
 * The device signature rule, shared by HTTP requests and WebSocket subscriptions: HMAC-SHA256
 * over `<deviceId>.<timestamp>.` (for HTTP also `<METHOD>.<path and query>.`) and the exact
 * body, timestamp within 60 seconds either way.
 */
export function verifyDeviceSignature(check: DeviceSignatureCheck): boolean {
  const { secret, deviceId, timestamp, signature, body } = check;
  const timestampMs = Number(timestamp);
  if (!deviceId || !timestamp || !signature || !Number.isFinite(timestampMs))
    return false;
  if (Math.abs((check.now ?? Date.now()) - timestampMs) > SIGNATURE_WINDOW_MS)
    return false;
  const context =
    check.method !== undefined
      ? `${check.method.toUpperCase()}.${check.path ?? ""}.`
      : "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.${context}`)
    .update(body)
    .digest("hex");
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export type DeviceCheck =
  | { ok: true; deviceId: string; signature: string; signed: boolean }
  | { ok: false; status: number; error: string };

/**
 * Judges a device request without answering it or remembering anything, so the rate limiter
 * can ask "is this really that device?" before deciding how to treat the request. In
 * development (no secret configured) every request passes, unsigned.
 */
export function checkDeviceRequest(req: Request): DeviceCheck {
  const deviceId = String(req.headers["x-device-id"] ?? "");
  if (!deviceAuthEnabled())
    return { ok: true, deviceId, signature: "", signed: false };
  const timestamp = String(req.headers["x-timestamp"] ?? "");
  const supplied = String(req.headers["x-signature"] ?? "");
  const secret = deviceId ? deviceSecretFor(deviceId) : undefined;
  if (!deviceId || !timestamp || !supplied || !secret)
    return {
      ok: false,
      status: 401,
      error: "Valid signed device headers are required",
    };
  const valid = verifyDeviceSignature({
    secret,
    deviceId,
    timestamp,
    signature: supplied,
    body: getSignedRequestBody(req),
    method: req.method,
    path: req.originalUrl,
  });
  if (!valid)
    return { ok: false, status: 401, error: "Invalid device signature" };
  // A bus may only act for itself: routes under /vehicles/:busId are for that bus.
  const busId = req.params?.busId;
  if (busId !== undefined && busId !== deviceId)
    return {
      ok: false,
      status: 403,
      error: "A device may only act for its own bus",
    };
  return { ok: true, deviceId, signature: supplied, signed: true };
}

const seenSignatures = new Map<string, number>();

/** Remembers a signature; false if it was already used inside the window (a replay). */
function rememberSignature(signature: string, now = Date.now()): boolean {
  for (const [known, seenAt] of seenSignatures) {
    if (now - seenAt <= SIGNATURE_WINDOW_MS * 2) break;
    seenSignatures.delete(known);
  }
  if (seenSignatures.has(signature)) return false;
  seenSignatures.set(signature, now);
  if (seenSignatures.size > MAX_REMEMBERED_SIGNATURES) {
    const oldest = seenSignatures.keys().next().value;
    if (oldest !== undefined) seenSignatures.delete(oldest);
  }
  return true;
}

export function verifyDeviceRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const check = checkDeviceRequest(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }
  if (check.signed && !rememberSignature(check.signature)) {
    res.status(401).json({ error: "This signed request was already used" });
    return;
  }
  next();
}

function getSignedRequestBody(req: Request): Buffer {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (rawBody) return rawBody;
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}
