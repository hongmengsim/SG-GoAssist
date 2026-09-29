import type {
  AssistRequestForBus,
  PassengerAssistanceRequest,
} from "@buspass/shared";

/** The bus-facing view of a request: everything needed to act, no passenger identity. */
export function toBusRequest(
  request: PassengerAssistanceRequest,
): AssistRequestForBus {
  return {
    requestId: request.requestId,
    ...(request.caseId ? { caseId: request.caseId } : {}),
    busId: request.busId,
    busService: request.busService,
    boardingStop: request.boardingStop,
    ...(request.stopCode ? { stopCode: request.stopCode } : {}),
    ...(request.destination ? { destination: request.destination } : {}),
    assistanceTypes: request.assistanceTypes,
    boardingOrAlighting: request.boardingOrAlighting,
    createdAt: request.createdAt,
  };
}
