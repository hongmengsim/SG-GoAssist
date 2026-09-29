import type {
  OperatorStatusUpdateMessage,
  StatusUpdateMessage,
} from "@buspass/shared";

/** Everything that can travel over the live-update channel. */
export type BusEvent = StatusUpdateMessage | OperatorStatusUpdateMessage;
