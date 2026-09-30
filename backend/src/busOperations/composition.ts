import { isTestRun } from "../platform/runtime";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { publishEvent } from "../events/eventHub";
import { logger } from "../services/logger";
import { OperatorHaltService, type StoredHalt } from "./operatorHalt";
import { AuditBatcher } from "./auditBatcher";
import { getAuditLog } from "../services/operationsData";
import type { OperationsAuditEvent } from "../services/auditLog";
import { acquirePostgres, type PgPool } from "../storage/postgres";
import { PostgresDocumentTable } from "../storage/postgresTables";
import { openSqliteDatabase, type SqliteDatabase } from "../storage/sqlite";
import {
  DocumentBayRepository,
  DocumentBusRecordRepository,
  DocumentBusStatusRepository,
  bayTableSpec,
  busRecordTableSpec,
  busStatusTableSpec,
} from "./documentRepositories";
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
  BusRecord,
  BusRecordRepository,
  BusStatusRepository,
} from "./ports";
import {
  SqliteBayRepository,
  SqliteBusStatusRepository,
} from "./sqliteRepositories";

export type StorageDriver = "memory" | "sqlite" | "postgres";

export interface BusOperationsOptions {
  driver: StorageDriver;
  dataDirectory?: string;
  /** Use this Postgres pool (the caller keeps ownership); otherwise `GOASSIST_DATABASE_URL`. */
  postgres?: PgPool;
  publish?: BusOperationsDeps["publish"];
  audit?: BusOperationsDeps["audit"];
  now?: () => number;
  onMovement?: BusOperationsDeps["onMovement"];
}

export interface BusOperations {
  service: BusOperationsService;
  reports: BusReportsService;
  halts: OperatorHaltService;
  driver: StorageDriver;
  close: () => void;
  /** Writes any audit events still waiting to be batched. */
  flushAudit: () => void;
}

/**
 * Bus-operations audit events go to the same append-only log the case service uses, but in
 * short batches (see AuditBatcher for the trade-off).
 */
function toAuditEvent(event: AuditEventInput): OperationsAuditEvent {
  return {
    eventId: `EVENT-${crypto.randomUUID()}`,
    eventType: event.eventType,
    caseId: event.caseId,
    busId: event.busId,
    actor: event.actor,
    timestamp: new Date().toISOString(),
    detail: event.detail,
  };
}

/**
 * Composition root for bus operations: chooses the storage adapter and wires the service.
 * Bus operations use their own database file so high-rate status traffic never contends
 * with case data.
 */
export function createBusOperations(
  options: BusOperationsOptions,
): BusOperations {
  const batcher = new AuditBatcher((events) =>
    getAuditLog().appendBatch(events),
  );
  let repository: BusStatusRepository | undefined;
  let bays: BayRepository | undefined;
  let database: SqliteDatabase | undefined;
  let driver = options.driver;
  let pgPool: PgPool | undefined;
  let ownsPool = false;
  let pgRecord:
    | (<T extends BusRecord>(table: string) => BusRecordRepository<T>)
    | undefined;

  if (driver === "postgres") {
    const url = process.env.GOASSIST_DATABASE_URL?.trim();
    if (!options.postgres && !url)
      throw new Error("The postgres driver needs GOASSIST_DATABASE_URL");
    pgPool = options.postgres ?? acquirePostgres(url as string);
    ownsPool = !options.postgres;
    const pool = pgPool;
    repository = new DocumentBusStatusRepository(
      new PostgresDocumentTable(pool, busStatusTableSpec),
    );
    bays = new DocumentBayRepository(
      new PostgresDocumentTable(pool, bayTableSpec),
    );
    pgRecord = <T extends BusRecord>(table: string) =>
      new DocumentBusRecordRepository<T>(
        new PostgresDocumentTable<T>(pool, busRecordTableSpec<T>(table)),
      );
  }

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
    audit: options.audit ?? ((event) => batcher.add(toAuditEvent(event))),
    now: options.now ?? Date.now,
    onMovement: options.onMovement ?? bridgeMovementToVehicleEvents,
  });
  const publish = options.publish ?? publishEvent;
  const audit =
    options.audit ??
    ((event: AuditEventInput) => batcher.add(toAuditEvent(event)));
  const repositories = Object.fromEntries(
    REPORT_KINDS.map((kind) => [
      kind,
      pgRecord
        ? pgRecord<AnyReport>(REPORT_TABLES[kind])
        : database
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
  const halts = new OperatorHaltService({
    repository: (pgRecord
      ? pgRecord<StoredHalt>("operator_halt")
      : database
        ? new SqliteBusRecordRepository<StoredHalt>(database, "operator_halt")
        : new MemoryBusRecordRepository<StoredHalt>()) as BusRecordRepository<StoredHalt>,
    publish,
    audit,
    now: options.now ?? Date.now,
  });
  return {
    service,
    reports,
    halts,
    driver,
    flushAudit: () => batcher.flush(),
    close: () => {
      batcher.flush();
      database?.close();
      if (ownsPool) void pgPool?.end();
    },
  };
}

const REPORT_TABLES: Record<ReportKind, string> = {
  RAMP_SIMULATION: "ramp_simulation",
  RAMP_SAFETY: "ramp_safety",
  HELP_REQUIRED: "help_required",
};

let current: BusOperations | undefined;

function defaultOptions(): BusOperationsOptions {
  const forced = process.env.GOASSIST_BUS_OPS_DRIVER;
  const hasDatabaseUrl = Boolean(process.env.GOASSIST_DATABASE_URL?.trim());
  const driver: StorageDriver =
    forced === "sqlite" || forced === "memory" || forced === "postgres"
      ? forced
      : isTestRun()
        ? "memory"
        : hasDatabaseUrl
          ? "postgres"
          : "sqlite";
  return { driver, dataDirectory: process.env.GOASSIST_DATA_DIR };
}

export function getBusReports(): BusReportsService {
  current ??= createBusOperations(defaultOptions());
  return current.reports;
}

export function getOperatorHalts(): OperatorHaltService {
  current ??= createBusOperations(defaultOptions());
  return current.halts;
}

export function getBusOperations(): BusOperationsService {
  current ??= createBusOperations(defaultOptions());
  return current.service;
}

/** Writes audit events that are still waiting, for example before the audit log is read. */
export function flushBusOperationsAudit(): void {
  current?.flushAudit();
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
  await getOperatorHalts().clearAll();
}
