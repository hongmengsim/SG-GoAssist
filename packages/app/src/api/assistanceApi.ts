import {
  AssistanceRequestResponse,
  Bus,
  CreateAssistanceRequestPayload,
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
