import type {
  AssistanceRequestResponse,
  Bus,
  BusStop,
  BusStopDetailResponse,
  BusStopServiceRoutesResponse,
  BusStopSearchResponse,
  BusStopArrivalsResponse,
  CreateAssistanceRequestPayload,
  NearbyBusStopsResponse,
} from "@buspass/shared";
import { API_BASE_URL } from "../config";

export class BusStopRequestError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number | null,
    cause?: unknown,
  ) {
    super(message);
    this.name = "BusStopRequestError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export async function fetchMockBuses(service = "191"): Promise<Bus[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/assistance/buses/mock?service=${service}`,
  );
  if (!response.ok) {
    throw new Error("Unable to load nearby buses.");
  }

  const body = (await response.json()) as { buses: Bus[] };
  return body.buses;
}

export async function createAssistanceRequest(
  payload: CreateAssistanceRequestPayload,
): Promise<AssistanceRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/assistance/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Unable to create assistance request.");
  }

  return (await response.json()) as AssistanceRequestResponse;
}

export async function cancelAssistanceRequest(
  requestId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/assistance/${requestId}/cancel`,
    {
      method: "POST",
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("Unable to cancel assistance request.");
  }
}

export async function findNearbyBusStops(
  payload: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  },
  signal?: AbortSignal,
): Promise<NearbyBusStopsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/location/nearby-bus-stops`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("Unable to find nearby bus stops.");
  }

  const body = (await response.json()) as NearbyBusStopsResponse;
  return { ...body, stops: body.stops.map(normalizeBusStopServices) };
}

export async function fetchRegionalBusStops(
  payload: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<{
  stops: Array<BusStop & { distanceMeters: number }>;
  radiusMeters: number;
}> {
  const query = new URLSearchParams({
    lat: String(payload.latitude),
    lng: String(payload.longitude),
    radius: String(payload.radiusMeters),
    limit: String(payload.limit ?? 500),
  });
  const endpoint = `${API_BASE_URL}/api/bus-stops/nearby?${query}`;
  let response: Response;
  try {
    response = await fetch(endpoint, { signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new BusStopRequestError(
      "Unable to reach the bus-stop service.",
      endpoint,
      null,
      error,
    );
  }
  if (!response.ok) {
    throw new BusStopRequestError(
      "Unable to load nearby bus stops.",
      endpoint,
      response.status,
    );
  }
  const body = (await response.json()) as {
    stops: Array<BusStop & { distanceMeters: number }>;
    radiusMeters: number;
  };
  return { ...body, stops: body.stops.map(normalizeBusStopServices) };
}

export async function searchBusStops(
  query: string,
  signal?: AbortSignal,
): Promise<BusStopSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: "50" });
  const response = await fetch(
    `${API_BASE_URL}/api/bus-stops/search?${params}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error("Unable to search bus stops.");
  }
  const body = (await response.json()) as BusStopSearchResponse;
  return { ...body, stops: body.stops.map(normalizeBusStopServices) };
}

export async function fetchBusStop(
  busStopCode: string,
  signal?: AbortSignal,
): Promise<BusStopDetailResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/bus-stops/${encodeURIComponent(busStopCode)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error("Unable to load the bus stop.");
  }
  const body = (await response.json()) as BusStopDetailResponse;
  return { ...body, stop: normalizeBusStopServices(body.stop) };
}

export async function fetchBusStopServiceRoutes(
  busStopCode: string,
  serviceNo: string,
  signal?: AbortSignal,
): Promise<BusStopServiceRoutesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/bus-stops/${encodeURIComponent(busStopCode)}/services/${encodeURIComponent(serviceNo)}/routes`,
    { signal },
  );
  if (!response.ok) {
    throw new Error("Unable to load route details for this service.");
  }

  const body = (await response.json()) as BusStopServiceRoutesResponse;
  return {
    ...body,
    busStop: normalizeBusStopServices(body.busStop),
    routes: body.routes.map((route) => ({
      ...route,
      destination: normalizeBusStopServices(route.destination),
    })),
  };
}

export async function fetchBusStopArrivals(
  busStopCode: string,
  signal?: AbortSignal,
): Promise<BusStopArrivalsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/location/bus-stops/${busStopCode}/arrivals`,
    {
      signal,
    },
  );

  if (!response.ok) {
    throw new Error("Unable to load buses for this stop.");
  }

  const body = (await response.json()) as BusStopArrivalsResponse;
  return { ...body, busStop: normalizeBusStopServices(body.busStop) };
}

function normalizeBusStopServices<T extends BusStop>(stop: T): T {
  return {
    ...stop,
    services: Array.isArray(stop.services) ? stop.services : [],
  };
}
