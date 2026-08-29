import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { fetchAllDataMallPages } from "../bus-stops/dataMall";
import { normalizeDataMallBusData } from "../bus-stops/normalize";
import type {
  BusStopDatasetSnapshot,
  DataMallBusRouteRecord,
  DataMallBusStopRecord,
} from "../bus-stops/types";

const BUS_STOPS_ENDPOINT =
  "https://datamall2.mytransport.sg/ltaodataservice/BusStops";
const BUS_ROUTES_ENDPOINT =
  "https://datamall2.mytransport.sg/ltaodataservice/BusRoutes";

// Workspace scripts execute with packages/backend as their working directory,
// while the repository's documented environment file lives at the root.
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
dotenv.config();

export async function syncLtaBusData(options: {
  accountKey: string;
  outputPath: string;
}): Promise<BusStopDatasetSnapshot> {
  if (!options.accountKey.trim()) {
    throw new Error(
      "LTA_DATAMALL_ACCOUNT_KEY is required to synchronize bus data.",
    );
  }

  const [stopRecords, routeRecords] = await Promise.all([
    fetchAllDataMallPages<DataMallBusStopRecord>(
      BUS_STOPS_ENDPOINT,
      options.accountKey,
    ),
    fetchAllDataMallPages<DataMallBusRouteRecord>(
      BUS_ROUTES_ENDPOINT,
      options.accountKey,
    ),
  ]);
  const normalized = normalizeDataMallBusData(stopRecords, routeRecords);
  const snapshot: BusStopDatasetSnapshot = {
    metadata: {
      source: "LTA_DATAMALL",
      generatedAt: new Date().toISOString(),
      stopCount: normalized.stops.length,
      routeRecordCount: routeRecords.length,
      routePatternCount: normalized.routes.length,
      serviceCount: normalized.summary.serviceCount,
      stopsWithServices: normalized.summary.stopsWithServices,
      stopsWithCompleteNames: normalized.stops.filter(
        (stop) =>
          stop.description !== `Bus stop ${stop.busStopCode}` &&
          stop.roadName.length > 0,
      ).length,
    },
    stops: normalized.stops,
    routes: normalized.routes,
  };

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(
    options.outputPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );

  console.info(`Bus stops loaded: ${normalized.stops.length}`);
  console.info(`Bus route records loaded: ${routeRecords.length}`);
  console.info(`Route patterns loaded: ${normalized.routes.length}`);
  console.info(`Stops with services: ${normalized.summary.stopsWithServices}`);
  console.info(`Services loaded: ${normalized.summary.serviceCount}`);
  console.info(
    `Stops missing/invalid coordinates: ${normalized.summary.invalidCoordinatesRemoved}`,
  );
  console.info(
    `Duplicate stop codes removed: ${normalized.summary.duplicateStopCodesRemoved}`,
  );
  console.info(`Snapshot written: ${options.outputPath}`);
  return snapshot;
}

if (require.main === module) {
  const accountKey = process.env.LTA_DATAMALL_ACCOUNT_KEY ?? "";
  const outputPath = path.resolve(__dirname, "../../data/bus-stops.sg.json");
  syncLtaBusData({ accountKey, outputPath }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
