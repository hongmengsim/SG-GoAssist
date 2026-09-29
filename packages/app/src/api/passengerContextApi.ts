import type {
  JourneyPlanRequest,
  JourneyPlanResponse,
  PassengerContextSnapshot,
} from "@buspass/shared";
import { API_BASE_URL } from "../config";

export async function fetchPassengerContext(
  location: { latitude: number; longitude: number },
  radiusMeters = 200,
  signal?: AbortSignal,
): Promise<PassengerContextSnapshot> {
  const query = new URLSearchParams({
    lat: String(location.latitude),
    lng: String(location.longitude),
    radius: String(radiusMeters),
  });
  const response = await fetch(
    `${API_BASE_URL}/api/passenger/context?${query}`,
    {
      signal,
    },
  );
  if (!response.ok) {
    throw new Error("Unable to load passenger travel context.");
  }
  return (await response.json()) as PassengerContextSnapshot;
}

export async function fetchJourneyPlanOptions(
  request: JourneyPlanRequest,
  signal?: AbortSignal,
): Promise<JourneyPlanResponse> {
  const response = await fetch(`${API_BASE_URL}/api/journeys/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw new Error("Unable to plan this journey.");
  }
  return (await response.json()) as JourneyPlanResponse;
}
