import fs from "fs";
import type {
  ActuatorCommand,
  ActuatorStatus,
  AssistanceCase,
  AutonomousVehicleState,
  DeviceHealth,
  PerceptionEvaluationSample,
  PrecisionDockingObservation,
  RampObstacleClassification,
  SafetyTelemetry,
  SignalObservation,
  VehicleCapability,
} from "@buspass/shared";
import type { SqliteDatabase } from "../storage/sqlite";
import type { OperationsData } from "./operationsData";
import { logger } from "./logger";

/**
 * The shape of the old "whole state in one document" store. It is only read here, once, to
 * carry data over to the per-record tables; nothing writes it any more.
 */
interface LegacyState {
  cases?: AssistanceCase[];
  observations?: SignalObservation[];
  capabilities?: VehicleCapability[];
  safetyTelemetry?: SafetyTelemetry[];
  actuatorCommands?: ActuatorCommand[];
  actuatorStatuses?: ActuatorStatus[];
  devices?: DeviceHealth[];
  autonomousVehicles?: AutonomousVehicleState[];
  rampObstacleClassifications?: RampObstacleClassification[];
  perceptionEvaluationSamples?: PerceptionEvaluationSample[];
  precisionDockingObservations?: PrecisionDockingObservation[];
}

function copyIn(data: OperationsData, state: LegacyState): number {
  let copied = 0;
  const each = <T>(items: T[] | undefined, write: (item: T) => void) => {
    for (const item of items ?? []) {
      write(item);
      copied += 1;
    }
  };
  each(state.cases, (item) => data.cases.upsert(item));
  each(state.observations, (item) => data.observations.put(item));
  each(state.capabilities, (item) => data.capabilities.put(item));
  each(state.safetyTelemetry, (item) => data.telemetry.put(item));
  each(state.actuatorCommands, (item) => data.putCommand(item));
  each(state.actuatorStatuses, (item) => data.putStatus(item));
  each(state.devices, (item) => data.devices.put(item));
  each(state.autonomousVehicles, (item) => data.vehicles.put(item));
  each(state.rampObstacleClassifications, (item) =>
    data.rampClassifications.put(item),
  );
  each(state.perceptionEvaluationSamples, (item) =>
    data.perceptionSamples.put(item),
  );
  each(state.precisionDockingObservations, (item) => data.docking.put(item));
  return copied;
}

/**
 * Carries data from the old store into the new tables, once. The old SQLite row is deleted
 * and an old operations.json is renamed, so a second start finds nothing to import. Returns
 * how many records were copied.
 */
export function importLegacyState(
  data: OperationsData,
  database: SqliteDatabase | undefined,
  jsonPath: string,
): number {
  let copied = 0;
  if (database) {
    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'operations_state'",
      )
      .get();
    if (table) {
      const row = database
        .prepare("SELECT state_json FROM operations_state WHERE id = 1")
        .get() as { state_json?: string } | undefined;
      if (row?.state_json) {
        try {
          copied += copyIn(data, JSON.parse(row.state_json) as LegacyState);
          database.exec("DELETE FROM operations_state");
        } catch (error) {
          logger.error("Could not import the old operations state", undefined, {
            error: String(error),
          });
        }
      }
    }
  }
  if (database && fs.existsSync(jsonPath)) {
    try {
      copied += copyIn(
        data,
        JSON.parse(fs.readFileSync(jsonPath, "utf8")) as LegacyState,
      );
      fs.renameSync(jsonPath, `${jsonPath}.migrated`);
    } catch (error) {
      logger.error("Could not import the old operations.json", undefined, {
        error: String(error),
      });
    }
  }
  if (copied > 0)
    logger.info("Imported the old operations store", undefined, { copied });
  return copied;
}
