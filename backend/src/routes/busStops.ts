import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  BusStopDataUnavailableError,
  busStopRepository,
  SINGAPORE_QUERY_BOUNDS,
} from "../bus-stops/repository";

export const router = Router();

const DEFAULT_NEARBY_RADIUS_METERS = 1_000;
const MAX_NEARBY_RADIUS_METERS = 25_000;
const DEFAULT_NEARBY_LIMIT = 10;
const MAX_NEARBY_LIMIT = 500;
const DEFAULT_BOUNDS_LIMIT = 500;
const MAX_BOUNDS_LIMIT = 1_000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

router.get("/nearby", (req: Request, res: Response) => {
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
  if (!withinSingaporeQueryBounds(latitude, longitude)) {
    return res
      .status(400)
      .json({ error: "Coordinates must be within Singapore query bounds" });
  }

  const radiusMeters = clampedQueryNumber(
    req,
    "radius",
    DEFAULT_NEARBY_RADIUS_METERS,
    50,
    MAX_NEARBY_RADIUS_METERS,
  );
  const limit = clampedIntegerQuery(
    req,
    "limit",
    DEFAULT_NEARBY_LIMIT,
    1,
    MAX_NEARBY_LIMIT,
  );
  const stops = busStopRepository.nearby(
    latitude,
    longitude,
    radiusMeters,
    limit,
  );
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[BusStops] Loaded ${stops.length} stops for nearby query`, {
      endpoint: req.path,
      latitude,
      longitude,
      radiusMeters,
      limit,
    });
  }
  return res.json({ stops, radiusMeters });
});

router.get("/search", (req: Request, res: Response) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) {
    return res.status(400).json({ error: "q is required" });
  }
  const limit = clampedIntegerQuery(
    req,
    "limit",
    DEFAULT_SEARCH_LIMIT,
    1,
    MAX_SEARCH_LIMIT,
  );
  const stops = busStopRepository.search(query, limit);
  return res.json({ stops, query, total: stops.length });
});

router.get("/bounds", (req: Request, res: Response) => {
  const north = queryNumber(req, "north");
  const south = queryNumber(req, "south");
  const east = queryNumber(req, "east");
  const west = queryNumber(req, "west");
  if (
    north === null ||
    south === null ||
    east === null ||
    west === null ||
    !validCoordinate(north, east) ||
    !validCoordinate(south, west) ||
    north <= south ||
    east <= west
  ) {
    return res
      .status(400)
      .json({ error: "north, south, east and west must form valid bounds" });
  }
  if (
    north > SINGAPORE_QUERY_BOUNDS.north ||
    south < SINGAPORE_QUERY_BOUNDS.south ||
    east > SINGAPORE_QUERY_BOUNDS.east ||
    west < SINGAPORE_QUERY_BOUNDS.west
  ) {
    return res
      .status(400)
      .json({ error: "Bounds must stay within the Singapore query area" });
  }
  const limit = clampedIntegerQuery(
    req,
    "limit",
    DEFAULT_BOUNDS_LIMIT,
    1,
    MAX_BOUNDS_LIMIT,
  );
  const result = busStopRepository.bounds({ north, south, east, west }, limit);
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[BusStops] Loaded ${result.stops.length} stops for bounds`, {
      endpoint: req.path,
      north,
      south,
      east,
      west,
      total: result.total,
      truncated: result.truncated,
    });
  }
  return res.json(result);
});

router.get(
  "/:code/services/:serviceNo/routes",
  (req: Request, res: Response) => {
    const stop = busStopRepository.get(req.params.code);
    if (!stop) {
      return res
        .status(404)
        .json({ error: "Bus stop not found", busStopCode: req.params.code });
    }

    const serviceNo = req.params.serviceNo.trim();
    const routes = busStopRepository.routesForStopAndService(
      stop.busStopCode,
      serviceNo,
    );
    if (routes.length === 0) {
      return res.status(404).json({
        error: "Service route not found for this stop",
        busStopCode: stop.busStopCode,
        serviceNo,
      });
    }

    return res.json({ busStop: stop, serviceNo, routes });
  },
);

router.get("/:code", (req: Request, res: Response) => {
  const stop = busStopRepository.get(req.params.code);
  if (!stop) {
    return res
      .status(404)
      .json({ error: "Bus stop not found", busStopCode: req.params.code });
  }
  return res.json({ stop });
});

router.use(
  (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const operation = req.path === "/bounds" ? "Bounds query" : "Stop query";
    console.error(`[BusStops] ${operation} failed`, {
      endpoint: req.originalUrl,
      error: error instanceof Error ? error.message : "Unknown bus-stop error",
    });
    return res.status(500).json({
      error:
        error instanceof BusStopDataUnavailableError
          ? "BUS_STOP_DATA_UNAVAILABLE"
          : "BUS_STOP_QUERY_FAILED",
    });
  },
);

function queryNumber(req: Request, key: string): number | null {
  const value = req.query[key];
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampedQueryNumber(
  req: Request,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = queryNumber(req, key);
  return value === null
    ? fallback
    : Math.min(maximum, Math.max(minimum, value));
}

function clampedIntegerQuery(
  req: Request,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.floor(clampedQueryNumber(req, key, fallback, minimum, maximum));
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return (
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  );
}

function withinSingaporeQueryBounds(
  latitude: number,
  longitude: number,
): boolean {
  return (
    latitude <= SINGAPORE_QUERY_BOUNDS.north &&
    latitude >= SINGAPORE_QUERY_BOUNDS.south &&
    longitude <= SINGAPORE_QUERY_BOUNDS.east &&
    longitude >= SINGAPORE_QUERY_BOUNDS.west
  );
}
