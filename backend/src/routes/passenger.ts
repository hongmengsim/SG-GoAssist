import { Router, type Request, type Response } from "express";
import { SINGAPORE_QUERY_BOUNDS } from "../bus-stops/repository";
import { getPassengerContext } from "../services/passengerContextService";

export const router = Router();

router.get("/context", (req: Request, res: Response) => {
  const latitude = queryNumber(req, "lat");
  const longitude = queryNumber(req, "lng");
  if (
    latitude === null ||
    longitude === null ||
    !validCoordinate(latitude, longitude)
  ) {
    return res
      .status(400)
      .json({ error: "lat and lng must be valid coordinates" });
  }
  if (!withinSingaporeBounds(latitude, longitude)) {
    return res
      .status(400)
      .json({ error: "Coordinates must be within Singapore query bounds" });
  }

  const requestedRadius = queryNumber(req, "radius") ?? 200;
  const radiusMeters = Math.min(1_200, Math.max(50, requestedRadius));
  return res.json(getPassengerContext(latitude, longitude, radiusMeters));
});

function queryNumber(req: Request, key: string): number | null {
  const value = req.query[key];
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCoordinate(latitude: number, longitude: number) {
  return (
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

function withinSingaporeBounds(latitude: number, longitude: number) {
  return (
    latitude <= SINGAPORE_QUERY_BOUNDS.north &&
    latitude >= SINGAPORE_QUERY_BOUNDS.south &&
    longitude <= SINGAPORE_QUERY_BOUNDS.east &&
    longitude >= SINGAPORE_QUERY_BOUNDS.west
  );
}
