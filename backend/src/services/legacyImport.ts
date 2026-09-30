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

async function copyIn(
  data: OperationsData,
  state: LegacyState,
): Promise<number> {
  let copied = 0;
  const each = async <T>(
    items: T[] | undefined,
    write: (item: T) => Promise<void>,
  ) => {
    for (const item of items ?? []) {
      await write(item);
      copied += 1;
    }
  };
  // Insert only what is missing. If an import stops half way and runs again, or a newer record
  // was written since, the old copy must not replace it.
  await each(state.cases, async (item) => {
    if (!(await data.cases.get(item.caseId))) await data.cases.upsert(item);
  });
  await each(state.observations, async (item) => {
    await data.observations.compareAndPut(undefined, item);
  });
  await each(state.capabilities, async (item) => {
    await data.capabilities.compareAndPut(undefined, item);
  });
  await each(state.safetyTelemetry, async (item) => {
    await data.telemetry.compareAndPut(undefined, item);
  });
  await each(state.actuatorCommands, async (item) => {
    if (!(await data.commands.get(item.commandId))) await data.putCommand(item);
  });
  await each(state.actuatorStatuses, async (item) => {
    if (!(await data.statuses.get(item.commandId))) await data.putStatus(item);
  });
  await each(state.devices, async (item) => {
    await data.devices.compareAndPut(undefined, item);
  });
  await each(state.autonomousVehicles, async (item) => {
    await data.vehicles.compareAndPut(undefined, item);
  });
  await each(state.rampObstacleClassifications, async (item) => {
    await data.rampClassifications.compareAndPut(undefined, item);
  });
  await each(state.perceptionEvaluationSamples, async (item) => {
    await data.perceptionSamples.compareAndPut(undefined, item);
  });
  await each(state.precisionDockingObservations, async (item) => {
    await data.docking.compareAndPut(undefined, item);
  });
  return copied;
}

/**
 * Carries data from the old store into the new tables, once. The old SQLite row is deleted
 * and an old operations.json is renamed, so a second start finds nothing to import. Returns
 * how many records were copied.
 */
export async function importLegacyState(
  data: OperationsData,
  database: SqliteDatabase | undefined,
  jsonPath: string,
): Promise<number> {
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
          copied += await copyIn(
            data,
            JSON.parse(row.state_json) as LegacyState,
          );
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
      copied += await copyIn(
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
