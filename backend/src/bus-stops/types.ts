import type { BusRoutePattern, BusStop } from "@buspass/shared";

export type DataMallBusStopRecord = {
  BusStopCode?: unknown;
  RoadName?: unknown;
  Description?: unknown;
  Latitude?: unknown;
  Longitude?: unknown;
};

export type DataMallBusRouteRecord = {
  BusStopCode?: unknown;
  ServiceNo?: unknown;
  Direction?: unknown;
  StopSequence?: unknown;
};

export type BusStopDatasetMetadata = {
  source:
    "LTA_DATAMALL" | "LTA_DATA_GOV_SG_GEOSPATIAL_FALLBACK" | "TEST_FIXTURE";
  generatedAt: string;
  stopCount: number;
  routeRecordCount: number;
  routePatternCount?: number;
  serviceCount: number;
  stopsWithServices: number;
  stopsWithCompleteNames: number;
  notes?: string[];
};

export type BusStopDatasetSnapshot = {
  metadata: BusStopDatasetMetadata;
  stops: BusStop[];
  routes?: BusRoutePattern[];
};

export type NormalizationSummary = {
  busStopsReceived: number;
  busRouteRecordsReceived: number;
  duplicateStopCodesRemoved: number;
  invalidCoordinatesRemoved: number;
  invalidStopRecordsRemoved: number;
  stopsWithServices: number;
  serviceCount: number;
  routePatternCount: number;
};

export type NormalizedBusStopDataset = {
  stops: BusStop[];
  routes: BusRoutePattern[];
  summary: NormalizationSummary;
};
