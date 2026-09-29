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
import { isAutoAcknowledgeEnabled } from "./autoAcknowledge";
import { recordPassengerRequest } from "./assistanceCaseService";

const defaultBoardingStop = "Changi Airport Terminal 1";

export const supportedAssistanceTypes: AssistanceType[] = [
  "WHEELCHAIR_RAMP",
  "BUS_AUDIO_IDENTIFICATION",
  "EXTENDED_DWELL_TIME",
];

export function isAssistanceType(value: string): value is AssistanceType {
  return supportedAssistanceTypes.includes(value as AssistanceType);
}

export function createStandardizedAssistanceRequest(
  input: AssistanceRequestInput,
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
};
export function createStandardizedAssistanceRequest(
  input: AssistanceRequestInput,
  options: { autoAcknowledge?: boolean },
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
};
export function createStandardizedAssistanceRequest(
  input: AssistanceRequestInput,
  options: { autoAcknowledge?: boolean } = { autoAcknowledge: true },
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
} {
  return createStandardizedAssistanceRequestBundle(
    {
      ...input,
      assistanceTypes: [input.assistanceType],
    },
    options,
  );
}

export function createStandardizedAssistanceRequestBundle(
  input: Omit<AssistanceRequestInput, "assistanceType"> & {
    assistanceTypes: AssistanceType[];
  },
  options: { autoAcknowledge?: boolean } = { autoAcknowledge: true },
): {
  request: PassengerAssistanceRequest;
  duplicateOfRequestId?: string;
} {
  const bus = getBusById(input.busId);
  if (!bus) {
    throw new Error(`Bus not found: ${input.busId}`);
  }

  const assistanceTypes = Array.from(new Set(input.assistanceTypes));
  if (assistanceTypes.length === 0) {
    throw new Error("At least one assistance type is required");
  }

  if (!bus.isAccessible && assistanceTypes.includes("WHEELCHAIR_RAMP")) {
    throw new Error(
      `Bus is not accessible for wheelchair ramp requests: ${input.busId}`,
    );
  }

  const candidate: PassengerAssistanceRequest = {
    requestId: generateRequestId(),
    sessionId: input.sessionId ?? `${input.source}:${input.busId}`,
    busService: input.busService,
    busId: input.busId,
    boardingStop: input.boardingStop ?? defaultBoardingStop,
    destination: input.destination,
    stopCode: input.stopCode,
    assistanceTypes,
    source: input.source,
    boardingOrAlighting: input.boardingOrAlighting ?? "BOARDING",
    accessibilityVerificationStatus: input.accessibilityVerificationStatus,
    verificationMethod: input.verificationMethod,
    status: AssistanceRequestStatus.SENDING,
    createdAt: new Date().toISOString(),
  };

  const savedRequest = createRequest(candidate);
  const assistanceCase = recordPassengerRequest(candidate);
  savedRequest.caseId = assistanceCase.caseId;
  savedRequest.assistanceCaseState = assistanceCase.state;
  const duplicateOfRequestId =
    savedRequest.requestId !== candidate.requestId
      ? savedRequest.requestId
      : undefined;

  logger.info(
    "Standardized assistance input accepted",
    savedRequest.requestId,
    {
      assistanceTypes,
      source: input.source,
      busId: input.busId,
      duplicateOfRequestId,
    },
  );

  if (
    !duplicateOfRequestId &&
    options.autoAcknowledge !== false &&
    isAutoAcknowledgeEnabled()
  ) {
    setTimeout(() => {
      processSimulatorCommand({
        requestId: savedRequest.requestId,
        command: "ACKNOWLEDGE",
      });
    }, 300);
  }

  return { request: savedRequest, duplicateOfRequestId };
}

function generateRequestId(): string {
  const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REQ-${timestamp}-${random}`;
}
