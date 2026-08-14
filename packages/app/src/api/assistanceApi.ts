import type {
  AssistanceRequestResponse,
  Bus,
  BusStopArrivalsResponse,
  CreateAssistanceRequestPayload,
  NearbyBusStopsResponse,
} from "@buspass/shared";
import { API_BASE_URL } from "../config";

export async function fetchMockBuses(service = "191"): Promise<Bus[]> {
  const response = await fetch(`${API_BASE_URL}/api/assistance/buses/mock?service=${service}`);
  if (!response.ok) {
    throw new Error("Unable to load nearby buses.");
  }

  const body = (await response.json()) as { buses: Bus[] };
  return body.buses;
}

export async function createAssistanceRequest(
  payload: CreateAssistanceRequestPayload
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

export async function cancelAssistanceRequest(requestId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/assistance/${requestId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Unable to cancel assistance request.");
  }
}

export async function findNearbyBusStops(payload: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}, signal?: AbortSignal): Promise<NearbyBusStopsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/location/nearby-bus-stops`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error("Unable to find nearby bus stops.");
  }

  return (await response.json()) as NearbyBusStopsResponse;
}

export async function fetchBusStopArrivals(
  busStopCode: string,
  signal?: AbortSignal
): Promise<BusStopArrivalsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/location/bus-stops/${busStopCode}/arrivals`, {
    signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load buses for this stop.");
  }

  return (await response.json()) as BusStopArrivalsResponse;
}
