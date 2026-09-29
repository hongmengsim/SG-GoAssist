import fs from "node:fs/promises";
import path from "node:path";
import type { BusStopDatasetSnapshot } from "../bus-stops/types";
import { isValidSingaporeCoordinate } from "../bus-stops/normalize";

type GeoJsonFeature = {
  geometry?: { type?: string; coordinates?: unknown[] };
  properties?: { BUS_STOP_NUM?: unknown };
};

type GeoJsonFeatureCollection = {
  features?: GeoJsonFeature[];
};

export async function importDataGovSgBusStops(
  inputPath: string,
  outputPath: string,
): Promise<BusStopDatasetSnapshot> {
  const input = JSON.parse(
    await fs.readFile(inputPath, "utf8"),
  ) as GeoJsonFeatureCollection;
  if (!Array.isArray(input.features))
    throw new Error("Expected a GeoJSON FeatureCollection.");

  const byCode = new Map<string, BusStopDatasetSnapshot["stops"][number]>();
  let invalidFeatures = 0;
  for (const feature of input.features) {
    const rawCode = feature.properties?.BUS_STOP_NUM;
    const busStopCode =
      typeof rawCode === "string"
        ? rawCode.trim()
        : String(rawCode ?? "").trim();
    const coordinates = feature.geometry?.coordinates;
    const longitude = Number(coordinates?.[0]);
    const latitude = Number(coordinates?.[1]);
    if (
      !busStopCode ||
      feature.geometry?.type !== "Point" ||
      !isValidSingaporeCoordinate(latitude, longitude)
    ) {
      invalidFeatures += 1;
      continue;
    }
    if (!byCode.has(busStopCode)) {
      byCode.set(busStopCode, {
        busStopCode,
        roadName: "",
        description: `Bus stop ${busStopCode}`,
        latitude,
        longitude,
        services: [],
      });
    }
  }

  const stops = [...byCode.values()].sort((a, b) =>
    a.busStopCode.localeCompare(b.busStopCode),
  );
  const snapshot: BusStopDatasetSnapshot = {
    metadata: {
      source: "LTA_DATA_GOV_SG_GEOSPATIAL_FALLBACK",
      generatedAt: new Date().toISOString(),
      stopCount: stops.length,
      routeRecordCount: 0,
      serviceCount: 0,
      stopsWithServices: 0,
      stopsWithCompleteNames: 0,
      notes: [
        "Official LTA geospatial fallback: coordinates and stop codes only.",
        "Run npm run sync:lta --workspace @buspass/backend with a DataMall key for road names, descriptions and services.",
      ],
    },
    stops,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.info(`Official geospatial stops imported: ${stops.length}`);
  console.info(`Invalid features removed: ${invalidFeatures}`);
  console.info(`Snapshot written: ${outputPath}`);
  return snapshot;
}

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: ts-node src/cli/import-data-gov-sg-bus-stops.ts <input.geojson>",
    );
    process.exitCode = 1;
  } else {
    importDataGovSgBusStops(
      path.resolve(inputPath),
      path.resolve(__dirname, "../../data/bus-stops.sg.json"),
    ).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
