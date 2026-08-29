import fs from "node:fs/promises";
import path from "node:path";
import { normalizeDataMallBusData } from "../bus-stops/normalize";
import type {
  BusStopDatasetSnapshot,
  DataMallBusRouteRecord,
  DataMallBusStopRecord,
} from "../bus-stops/types";

type CsvRecord = Record<string, string>;

export async function importLtaBusData(options: {
  busStopsPath: string;
  busRoutesPath: string;
  outputPath: string;
  generatedAt?: string;
}): Promise<BusStopDatasetSnapshot> {
  const [busStopsCsv, busRoutesCsv] = await Promise.all([
    fs.readFile(options.busStopsPath, "utf8"),
    fs.readFile(options.busRoutesPath, "utf8"),
  ]);
  const stopRecords = parseCsv(busStopsCsv) as DataMallBusStopRecord[];
  const routeRecords = parseCsv(busRoutesCsv) as DataMallBusRouteRecord[];
  const normalized = normalizeDataMallBusData(stopRecords, routeRecords);
  const snapshot: BusStopDatasetSnapshot = {
    metadata: {
      source: "LTA_DATAMALL",
      generatedAt: options.generatedAt ?? new Date().toISOString(),
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
      notes: [
        "Static stop, service membership and route patterns normalized from LTA DataMall BusStops and BusRoutes.",
        "Source CSV snapshot: LTA DataMall data accessed 2026-07-06 via Vorld/singapore-gtfs.",
        "Service membership and route details do not depend on live Bus Arrival responses.",
      ],
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
  return snapshot;
}

export function parseCsv(input: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [rawHeaders, ...values] = rows;
  if (!rawHeaders) return [];
  const headers = rawHeaders.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  return values.map((columns) =>
    Object.fromEntries(
      headers.map((header, index) => [header, columns[index]?.trim() ?? ""]),
    ),
  );
}

if (require.main === module) {
  const [busStopsPath, busRoutesPath, outputPath] = process.argv.slice(2);
  if (!busStopsPath || !busRoutesPath) {
    console.error(
      "Usage: ts-node src/cli/import-lta-bus-data.ts <BusStops.csv> <BusRoutes.csv> [output.json]",
    );
    process.exitCode = 1;
  } else {
    importLtaBusData({
      busStopsPath: path.resolve(busStopsPath),
      busRoutesPath: path.resolve(busRoutesPath),
      outputPath: path.resolve(
        outputPath ?? path.resolve(__dirname, "../../data/bus-stops.sg.json"),
      ),
    })
      .then((snapshot) => {
        console.info(`Bus stops loaded: ${snapshot.metadata.stopCount}`);
        console.info(
          `Bus route records loaded: ${snapshot.metadata.routeRecordCount}`,
        );
        console.info(
          `Route patterns loaded: ${snapshot.metadata.routePatternCount}`,
        );
        console.info(
          `Stops with services: ${snapshot.metadata.stopsWithServices}`,
        );
        console.info(
          `Snapshot written: ${path.resolve(outputPath ?? path.resolve(__dirname, "../../data/bus-stops.sg.json"))}`,
        );
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}
