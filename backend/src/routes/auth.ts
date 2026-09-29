import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

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
  if (req.headers.authorization !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Operator authentication required" });
    return;
  }
  next();
}

/** The fixed body a device signs when it subscribes to its own bus over the WebSocket. */
export const DEVICE_SUBSCRIBE_BODY = "SUBSCRIBE_DEVICE";
const SIGNATURE_WINDOW_MS = 60_000;

export interface DeviceSignatureCheck {
  secret: string;
  deviceId: string;
  timestamp: string;
  signature: string;
  body: Buffer | string;
  now?: number;
}

/**
 * The device signature rule, shared by HTTP requests and WebSocket subscriptions: HMAC-SHA256
 * over `<deviceId>.<timestamp>.` and the exact body, timestamp within 60 seconds either way.
 */
export function verifyDeviceSignature(check: DeviceSignatureCheck): boolean {
  const { secret, deviceId, timestamp, signature, body } = check;
  const timestampMs = Number(timestamp);
  if (!deviceId || !timestamp || !signature || !Number.isFinite(timestampMs))
    return false;
  if (Math.abs((check.now ?? Date.now()) - timestampMs) > SIGNATURE_WINDOW_MS)
    return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.`)
    .update(body)
    .digest("hex");
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function verifyDeviceRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.DEVICE_SHARED_SECRET;
  if (!secret) {
    next();
    return;
  }
  const deviceId = String(req.headers["x-device-id"] ?? "");
  const timestamp = String(req.headers["x-timestamp"] ?? "");
  const supplied = String(req.headers["x-signature"] ?? "");
  const timestampMs = Number(timestamp);
  if (
    !deviceId ||
    !timestamp ||
    !supplied ||
    Math.abs(Date.now() - timestampMs) > 60_000
  ) {
    res.status(401).json({ error: "Valid signed device headers are required" });
    return;
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${deviceId}.${timestamp}.`)
    .update(getSignedRequestBody(req))
    .digest("hex");
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: "Invalid device signature" });
    return;
  }
  next();
}

function getSignedRequestBody(req: Request): Buffer {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (rawBody) return rawBody;
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}
