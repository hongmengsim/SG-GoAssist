/**
 * API Service Client
 * 
 * Handles all HTTP communication with the backend.
 * Provides type-safe methods for creating requests and checking status.
 */

import {
  CreateAssistanceRequestPayload,
  AssistanceRequestResponse,
  PassengerAssistanceRequest,
} from "@buspass/shared";
import { API_BASE_URL } from "../config";

// Default backend URL - can be overridden for testing
const DEFAULT_API_URL = `${API_BASE_URL}/api`;

class ApiClient {
  constructor(private baseURL: string = DEFAULT_API_URL) {}

  /**
   * Create a new passenger assistance request
   * 
   * @param payload - Assistance request details
   * @returns Promise with request ID and initial status
   */
  async createAssistanceRequest(
    payload: CreateAssistanceRequestPayload
  ): Promise<AssistanceRequestResponse> {
    const response = await fetch(`${this.baseURL}/assistance/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return (await response.json()) as AssistanceRequestResponse;
  }

  /**
   * Get the current status of a request
   * 
   * @param requestId - The request ID
   * @returns Promise with full request details
   */
  async getRequestStatus(
    requestId: string
  ): Promise<PassengerAssistanceRequest> {
    const response = await fetch(`${this.baseURL}/assistance/${requestId}`);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return (await response.json()) as PassengerAssistanceRequest;
  }

  /**
   * Get performance logs for a request
   * 
   * @param requestId - The request ID
   * @returns Promise with timestamps and calculated metrics
   */
  async getRequestLogs(requestId: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/assistance/${requestId}/logs`);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return response.json();
  }

  /**
   * Get all active requests (for monitoring)
   * 
   * @returns Promise with list of all requests
   */
  async getAllRequests(): Promise<PassengerAssistanceRequest[]> {
    const response = await fetch(`${this.baseURL}/assistance`);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    const body = (await response.json()) as {
      count: number;
      requests: PassengerAssistanceRequest[];
    };
    return body.requests;
  }

  /**
   * Handle API errors with user-friendly messages
   */
  private async handleError(response: Response): Promise<Error> {
    try {
      const body = (await response.json()) as { error?: string };
      return new Error(`API Error: ${body.error ?? response.statusText}`);
    } catch {
      return new Error(`API Error: ${response.statusText}`);
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

export default ApiClient;
