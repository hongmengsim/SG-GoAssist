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
