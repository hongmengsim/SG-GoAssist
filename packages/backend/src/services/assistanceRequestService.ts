import {
  AssistanceRequestInput,
  AssistanceRequestStatus,
  AssistanceType,
  PassengerAssistanceRequest,
} from "@buspass/shared";
import crypto from "crypto";
import { getBusById } from "../data/buses.mock";
import { createRequest, processSimulatorCommand } from "./aviator";
import { logger } from "./logger";

const defaultBoardingStop = "Changi Airport Terminal 1";
const defaultDestination = "Kent Ridge Terminal";

export const supportedAssistanceTypes: AssistanceType[] = [
  "WHEELCHAIR_RAMP",
  "BUS_AUDIO_IDENTIFICATION",
  "EXTENDED_DWELL_TIME",
];

export function isAssistanceType(value: string): value is AssistanceType {
  return supportedAssistanceTypes.includes(value as AssistanceType);
}

export function createStandardizedAssistanceRequest(input: AssistanceRequestInput): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
};
export function createStandardizedAssistanceRequest(
  input: AssistanceRequestInput,
  options: { autoAcknowledge?: boolean }
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
};
export function createStandardizedAssistanceRequest(
  input: AssistanceRequestInput,
  options: { autoAcknowledge?: boolean } = { autoAcknowledge: true }
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
} {
  const bus = getBusById(input.busId);
  if (!bus) {
    throw new Error(`Bus not found: ${input.busId}`);
  }

  if (!bus.isAccessible && input.assistanceType === "WHEELCHAIR_RAMP") {
    throw new Error(`Bus is not accessible for wheelchair ramp requests: ${input.busId}`);
  }

  const candidate: PassengerAssistanceRequest = {
    requestId: generateRequestId(),
    sessionId: input.sessionId ?? `${input.source}:${input.busId}`,
    busService: input.busService,
    busId: input.busId,
    boardingStop: input.boardingStop ?? defaultBoardingStop,
    destination: input.destination ?? defaultDestination,
    stopCode: input.stopCode,
    assistanceTypes: [input.assistanceType],
    source: input.source,
    boardingOrAlighting: input.boardingOrAlighting ?? "BOARDING",
    accessibilityVerificationStatus: input.accessibilityVerificationStatus,
    verificationMethod: input.verificationMethod,
    status: AssistanceRequestStatus.SENDING,
    createdAt: new Date().toISOString(),
  };

  const savedRequest = createRequest(candidate);
  const duplicateOfRequestId =
    savedRequest.requestId !== candidate.requestId ? savedRequest.requestId : undefined;

  logger.info("Standardized assistance input accepted", savedRequest.requestId, {
    assistanceType: input.assistanceType,
    source: input.source,
    busId: input.busId,
    duplicateOfRequestId,
  });

  if (!duplicateOfRequestId && options.autoAcknowledge !== false) {
    setTimeout(() => {
      processSimulatorCommand({ requestId: savedRequest.requestId, command: "ACKNOWLEDGE" });
    }, 300);
  }

  return { request: savedRequest, duplicateOfRequestId };
}

function generateRequestId(): string {
  const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REQ-${timestamp}-${random}`;
}
