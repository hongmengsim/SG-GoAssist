import { Router, type Request, type Response } from "express";
import type { JourneyPlanRequest } from "@buspass/shared";
import { SINGAPORE_QUERY_BOUNDS } from "../bus-stops/repository";
import { planPassengerJourney } from "../services/passengerContextService";

export const router = Router();

router.post("/plan", (req: Request, res: Response) => {
  const request = req.body as Partial<JourneyPlanRequest>;
  if (!validPoint(request.origin) || !validPoint(request.destination)) {
    return res.status(400).json({
      error: "origin and destination must contain valid Singapore coordinates",
    });
  }

  return res.json(planPassengerJourney(request as JourneyPlanRequest));
});

function validPoint(
  point: Partial<JourneyPlanRequest["origin"]> | undefined,
): boolean {
  if (
    !point ||
    typeof point.latitude !== "number" ||
    typeof point.longitude !== "number" ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude)
  ) {
    return false;
  }
  return (
    point.latitude <= SINGAPORE_QUERY_BOUNDS.north &&
    point.latitude >= SINGAPORE_QUERY_BOUNDS.south &&
    point.longitude <= SINGAPORE_QUERY_BOUNDS.east &&
    point.longitude >= SINGAPORE_QUERY_BOUNDS.west
  );
}
