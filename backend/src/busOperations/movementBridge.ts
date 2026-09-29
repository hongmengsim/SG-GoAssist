import {
  VehicleStatus,
  type BusMovementState,
  type BusStatus,
} from "@buspass/shared";
import { processVehicleCommand } from "../services/aviator";

/**
 * The passenger app understands three vehicle events. A bus that is still travelling or
 * waiting for the bay has not arrived, so both count as approaching.
 */
export function vehicleStatusFor(movement: BusMovementState): VehicleStatus {
  switch (movement) {
    case "TRAVELLING_TO_STOP":
    case "WAITING_FOR_BAY":
      return VehicleStatus.APPROACHING;
    case "POSITIONED_AT_STOP":
      return VehicleStatus.ARRIVED;
    case "DEPARTING":
      return VehicleStatus.DEPARTED;
  }
}

/** Lets the app follow a real bus without any change to the app. */
export function bridgeMovementToVehicleEvents(status: BusStatus): void {
  processVehicleCommand({
    busId: status.busId,
    busService: status.busService,
    stopCode: status.stopCode,
    status: vehicleStatusFor(status.movement),
  });
}
