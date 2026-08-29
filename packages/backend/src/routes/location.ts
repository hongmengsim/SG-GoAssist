import { Router, Request, Response } from "express";
import { NearbyBusStopsRequest } from "@buspass/shared";
import { getArrivalsForStop } from "../data/bus-stops.mock";
import { busStopRepository } from "../bus-stops/repository";
import { logger } from "../services/logger";

export const router = Router();

const nearbyStopLimit = 8;
const maxDistanceMeters = 800;

router.post("/nearby-bus-stops", (req: Request, res: Response) => {
  const payload: NearbyBusStopsRequest = req.body;

  if (typeof payload.latitude !== "number" || typeof payload.longitude !== "number") {
    return res.status(400).json({
      error: "latitude and longitude are required numbers",
    });
  }

  const stops = busStopRepository.nearby(
    payload.latitude,
    payload.longitude,
    maxDistanceMeters,
    nearbyStopLimit,
  );

  logger.info("Nearby bus stop lookup", undefined, {
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracyMeters: payload.accuracyMeters,
    nearestStop: stops[0]?.busStopCode,
    nearestDistanceMeters: stops[0]?.distanceMeters,
  });

  res.json({
    stops,
    debug: {
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters,
      maxDistanceMeters,
    },
  });
});

router.get("/bus-stops/:busStopCode/arrivals", (req: Request, res: Response) => {
  const busStop = busStopRepository.get(req.params.busStopCode);
  if (!busStop) {
    return res.status(404).json({
      error: "Bus stop not found",
      busStopCode: req.params.busStopCode,
    });
  }

  res.json({
    busStop,
    services: getArrivalsForStop(busStop.busStopCode),
  });
});
