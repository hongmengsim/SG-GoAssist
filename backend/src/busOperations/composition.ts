import crypto from "crypto";
import fs from "fs";
import path from "path";
import { publishEvent } from "../events/eventHub";
import { logger } from "../services/logger";
import { getOperationsStore } from "../services/operationsStore";
import { openSqliteDatabase, type SqliteDatabase } from "../storage/sqlite";
import {
  BusOperationsService,
  type AuditEventInput,
  type BusOperationsDeps,
} from "./busOperationsService";
import {
  MemoryBayRepository,
  MemoryBusStatusRepository,
} from "./memoryRepositories";
import {
  BusReportsService,
  REPORT_KINDS,
  type AnyReport,
  type ReportKind,
} from "./busReports";
import {
  MemoryBusRecordRepository,
  SqliteBusRecordRepository,
} from "./busRecordRepositories";
import { bridgeMovementToVehicleEvents } from "./movementBridge";
import type {
  BayRepository,
  BusRecordRepository,
  BusStatusRepository,
} from "./ports";
import {
  SqliteBayRepository,
  SqliteBusStatusRepository,
} from "./sqliteRepositories";

export type StorageDriver = "memory" | "sqlite";

export interface BusOperationsOptions {
  driver: StorageDriver;
  dataDirectory?: string;
  publish?: BusOperationsDeps["publish"];
  audit?: BusOperationsDeps["audit"];
  now?: () => number;
  onMovement?: BusOperationsDeps["onMovement"];
}

export interface BusOperations {
  service: BusOperationsService;
  reports: BusReportsService;
  driver: StorageDriver;
  close: () => void;
}

/** Writes to the same append-only audit log the case service uses. */
function auditToOperationsStore(event: AuditEventInput): void {
  getOperationsStore().appendAudit({
    eventId: `EVENT-${crypto.randomUUID()}`,
    eventType: event.eventType,
    caseId: event.caseId,
    busId: event.busId,
    actor: event.actor,
    timestamp: new Date().toISOString(),
    detail: event.detail,
  });
}

/**
 * Composition root for bus operations: chooses the storage adapter and wires the service.
 * Bus operations use their own database file so high-rate status traffic never contends
 * with case data.
 */
export function createBusOperations(
  options: BusOperationsOptions,
): BusOperations {
  let repository: BusStatusRepository | undefined;
  let bays: BayRepository | undefined;
  let database: SqliteDatabase | undefined;
  let driver = options.driver;

  if (driver === "sqlite") {
    const directory =
      options.dataDirectory ?? path.resolve(process.cwd(), ".runtime");
    fs.mkdirSync(directory, { recursive: true });
    database = openSqliteDatabase(
      path.join(directory, "bus-operations.sqlite"),
    );
    if (database) {
      repository = new SqliteBusStatusRepository(database);
      bays = new SqliteBayRepository(database);
    } else {
      logger.warn(
        "Bus operations are using memory storage and will not survive a restart",
      );
      driver = "memory";
    }
  }
  repository ??= new MemoryBusStatusRepository();
  bays ??= new MemoryBayRepository();

  const service = new BusOperationsService({
    busStatus: repository,
    bays,
    publish: options.publish ?? publishEvent,
    audit: options.audit ?? auditToOperationsStore,
    now: options.now ?? Date.now,
    onMovement: options.onMovement ?? bridgeMovementToVehicleEvents,
  });
  const publish = options.publish ?? publishEvent;
  const audit = options.audit ?? auditToOperationsStore;
  const repositories = Object.fromEntries(
    REPORT_KINDS.map((kind) => [
      kind,
      database
        ? new SqliteBusRecordRepository<AnyReport>(
            database,
            REPORT_TABLES[kind],
          )
        : new MemoryBusRecordRepository<AnyReport>(),
    ]),
  ) as unknown as Record<ReportKind, BusRecordRepository<AnyReport>>;
  const reports = new BusReportsService({
    repositories,
    publish,
    audit,
    now: options.now ?? Date.now,
  });
  return { service, reports, driver, close: () => database?.close() };
}

const REPORT_TABLES: Record<ReportKind, string> = {
  RAMP_SIMULATION: "ramp_simulation",
  RAMP_SAFETY: "ramp_safety",
  HELP_REQUIRED: "help_required",
};

let current: BusOperations | undefined;

function defaultOptions(): BusOperationsOptions {
  const forced = process.env.GOASSIST_BUS_OPS_DRIVER;
  const driver: StorageDriver =
    forced === "sqlite" || forced === "memory"
      ? forced
      : process.env.NODE_TEST_CONTEXT
        ? "memory"
        : "sqlite";
  return { driver, dataDirectory: process.env.GOASSIST_DATA_DIR };
}

export function getBusReports(): BusReportsService {
  current ??= createBusOperations(defaultOptions());
  return current.reports;
}

export function getBusOperations(): BusOperationsService {
  current ??= createBusOperations(defaultOptions());
  return current.service;
}

/** Drops the current instance (closing its database) so the next use starts fresh. */
export function resetBusOperations(): void {
  current?.close();
  current = undefined;
}

/** Removes all stored bus-operations data, for the admin reset endpoint. */
export async function clearBusOperationsData(): Promise<void> {
  await getBusOperations().clearAll();
  await getBusReports().clearAll();
}
