import { isTestRun } from "../platform/runtime";
import fs from "fs";
import path from "path";
import type {
  ActuatorCommand,
  ActuatorStatus,
  AutonomousVehicleState,
  DeviceHealth,
  ExternalAnnouncementMessage,
  PassengerAssistanceRequest,
  PerceptionEvaluationSample,
  PrecisionDockingObservation,
  RampObstacleClassification,
  SafetyTelemetry,
  SignalObservation,
  VehicleCapability,
  VehicleStatus,
} from "@buspass/shared";
import type { CaseRepository } from "../cases/ports";
import { MemoryCaseRepository } from "../cases/memoryCaseRepository";
import { SqliteCaseRepository } from "../cases/sqliteCaseRepository";
import {
  MemoryDocumentTable,
  SqliteDocumentTable,
  type DocumentTable,
  type TableSpec,
} from "../storage/documentTable";
import { PostgresCaseRepository } from "../cases/postgresCaseRepository";
import { PostgresLeaseStore } from "../concurrency/postgresLeaseStore";
import { SqliteLeaseStore } from "../concurrency/leaseStores";
import type { LeaseStore } from "../concurrency/keyedLock";
import { openPostgres, type PgPool } from "../storage/postgres";
import { PostgresDocumentTable } from "../storage/postgresTables";
import { openSqliteDatabase, type SqliteDatabase } from "../storage/sqlite";
import { PostgresAuditLog } from "./postgresAuditLog";
import { AuditLog, type AuditSink } from "./auditLog";
import type { StoredDiagnostic } from "./assistantDiagnosticsService";
import { importLegacyState } from "./legacyImport";
import { logger } from "./logger";
import {
  enforceRetention,
  retentionPolicyFromEnv,
  type ArchivedCase,
  type RetentionPolicy,
} from "./retention";

/** The archive is rotated past this size, and this many files are kept. */
const ARCHIVE_MAX_BYTES = 20 * 1024 * 1024;
const ARCHIVE_KEEP_FILES = 3;

/** Copies of a record with every passenger token removed, at any depth. */
function withoutPassengerTokens<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutPassengerTokens) as T;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value))
      if (key !== "anonymousToken") copy[key] = withoutPassengerTokens(inner);
    return copy as T;
  }
  return value;
}

/** How often the retention limits are applied while the server runs. */
const RETENTION_INTERVAL_MS = 60_000;

/** A command counts as open until a terminal status is recorded for it. */
const OPEN = "1";
const TERMINAL_ACTUATOR_STATES = [
  "COMPLETED",
  "CANCELLED",
  "BLOCKED",
  "FAILED",
];

/** The last vehicle event the passenger app was told about, per bus. */
export interface VehicleStatusRecord {
  busId: string;
  status: VehicleStatus;
}

/** An announcement, keyed so two for one request do not replace each other. */
export const announcementKey = (event: ExternalAnnouncementMessage): string =>
  `${event.requestId}:${event.timestamp}`;

const specs = {
  requests: {
    name: "requests",
    key: (doc) => doc.requestId,
    indexes: {
      busId: (doc) => doc.busId,
      status: (doc) => doc.status,
      // One bus's requests in one state, found through the index however many others exist.
      busStatus: (doc) => `${doc.busId}:${doc.status}`,
    },
  } satisfies TableSpec<PassengerAssistanceRequest>,
  vehicleStatuses: {
    name: "vehicle_statuses",
    key: (doc) => doc.busId,
  } satisfies TableSpec<VehicleStatusRecord>,
  announcements: {
    name: "announcements",
    key: announcementKey,
    indexes: { requestId: (doc) => doc.requestId },
  } satisfies TableSpec<ExternalAnnouncementMessage>,
  diagnostics: {
    name: "diagnostics",
    key: (doc) => doc.diagnosticId,
  } satisfies TableSpec<StoredDiagnostic>,
  observations: {
    name: "observations",
    key: (doc) => doc.signalId,
    indexes: {
      idempotencyKey: (doc) => doc.idempotencyKey || undefined,
      source: (doc) => doc.source,
    },
  } satisfies TableSpec<SignalObservation>,
  capabilities: {
    name: "capabilities",
    key: (doc) => doc.busId,
  } satisfies TableSpec<VehicleCapability>,
  telemetry: {
    name: "telemetry",
    key: (doc) => doc.busId,
    indexes: { stopCode: (doc) => doc.stopCode },
  } satisfies TableSpec<SafetyTelemetry>,
  commands: {
    name: "commands",
    key: (doc) => doc.commandId,
    indexes: {
      caseId: (doc) => doc.caseId,
      caseCommand: (doc) => `${doc.caseId}:${doc.command}`,
      open: () => OPEN,
    },
  } satisfies TableSpec<ActuatorCommand>,
  statuses: {
    name: "statuses",
    key: (doc) => doc.commandId,
    indexes: { caseId: (doc) => doc.caseId },
  } satisfies TableSpec<ActuatorStatus>,
  devices: {
    name: "devices",
    key: (doc) => doc.deviceId,
  } satisfies TableSpec<DeviceHealth>,
  vehicles: {
    name: "vehicles",
    key: (doc) => doc.busId,
  } satisfies TableSpec<AutonomousVehicleState>,
  rampClassifications: {
    name: "ramp_classifications",
    key: (doc) => doc.busId,
  } satisfies TableSpec<RampObstacleClassification>,
  perceptionSamples: {
    name: "perception_samples",
    key: (doc) => doc.sampleId,
  } satisfies TableSpec<PerceptionEvaluationSample>,
  docking: {
    name: "docking",
    key: (doc) => doc.busId,
  } satisfies TableSpec<PrecisionDockingObservation>,
};

export interface OperationsDataOptions {
  retention?: RetentionPolicy;
  /** "memory" (or "json") keeps everything in memory; anything else uses SQLite when it is available. */
  driver?: string;
  /** Use this Postgres pool (the caller keeps ownership of it). */
  postgres?: PgPool;
  /** Tests turn the background retention timer off. */
  retentionTimer?: boolean;
}

/**
 * Everything the case service stores, one row per record, replacing the old store that kept
 * all of it in one document and rewrote that document on every change. Each entity has its
 * own table or repository, so a write touches one row and costs the same however much is
 * stored. Data lives in `operations.sqlite` (the same file the old store used), or in memory
 * when SQLite is unavailable, in which case it does not survive a restart.
 */
export class OperationsData {
  readonly cases: CaseRepository;
  readonly observations: DocumentTable<SignalObservation>;
  readonly capabilities: DocumentTable<VehicleCapability>;
  readonly telemetry: DocumentTable<SafetyTelemetry>;
  readonly commands: DocumentTable<ActuatorCommand>;
  readonly statuses: DocumentTable<ActuatorStatus>;
  readonly devices: DocumentTable<DeviceHealth>;
  readonly vehicles: DocumentTable<AutonomousVehicleState>;
  readonly rampClassifications: DocumentTable<RampObstacleClassification>;
  readonly perceptionSamples: DocumentTable<PerceptionEvaluationSample>;
  readonly docking: DocumentTable<PrecisionDockingObservation>;
  readonly requests: DocumentTable<PassengerAssistanceRequest>;
  readonly vehicleStatuses: DocumentTable<VehicleStatusRecord>;
  readonly announcements: DocumentTable<ExternalAnnouncementMessage>;
  readonly diagnostics: DocumentTable<StoredDiagnostic>;
  readonly audit: AuditSink;
  /** Where lock leases live, when the storage is shared (SQLite file or Postgres). */
  readonly leases: LeaseStore | undefined;
  readonly durable: boolean;
  readonly databasePath: string;
  readonly archivePath: string;
  private readonly database: SqliteDatabase | undefined;
  private readonly postgres: PgPool | undefined;
  private readonly ownsPostgres: boolean;
  private readonly retention: RetentionPolicy;
  private timer: NodeJS.Timeout | undefined;
  /** Resolves once old data is imported and the first retention pass is done. */
  readonly ready: Promise<void>;

  constructor(dataDirectory: string, options: OperationsDataOptions = {}) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    this.databasePath = path.join(dataDirectory, "operations.sqlite");
    this.archivePath = path.join(dataDirectory, "cases-archive.ndjson");
    this.retention = options.retention ?? retentionPolicyFromEnv();
    const requested = (
      options.driver ??
      process.env.GOASSIST_STORAGE_DRIVER ??
      ""
    ).toLowerCase();
    // "json" is the name the old store used for its no-SQLite mode; it now means memory too.
    const wantMemory = requested === "memory" || requested === "json";
    // Postgres when a pool is given or GOASSIST_DATABASE_URL is set (and memory was not asked for).
    // Tests use their own data directories and ignore the environment's database, so a variable
    // left set in a shell or a CI job cannot make them share one; they pass `postgres` instead.
    const databaseUrl = isTestRun()
      ? undefined
      : process.env.GOASSIST_DATABASE_URL?.trim();
    this.postgres = wantMemory
      ? undefined
      : (options.postgres ??
        (databaseUrl && requested !== "sqlite"
          ? openPostgres(databaseUrl)
          : undefined));
    this.ownsPostgres = !options.postgres && this.postgres !== undefined;
    this.database =
      wantMemory || this.postgres
        ? undefined
        : openOperationsDatabase(this.databasePath);
    this.durable = this.database !== undefined || this.postgres !== undefined;
    if (!this.durable && !wantMemory)
      logger.warn(
        "Operations data is using memory storage and will not survive a restart",
      );
    const db = this.database;
    const pg = this.postgres;
    const table = <T>(spec: TableSpec<T>): DocumentTable<T> =>
      pg
        ? new PostgresDocumentTable<T>(pg, spec)
        : db
          ? new SqliteDocumentTable<T>(db, spec)
          : new MemoryDocumentTable<T>(spec);
    this.cases = pg
      ? new PostgresCaseRepository(pg)
      : db
        ? new SqliteCaseRepository(db)
        : new MemoryCaseRepository();
    this.leases = pg
      ? new PostgresLeaseStore(pg)
      : db
        ? new SqliteLeaseStore(db)
        : undefined;
    this.observations = table(specs.observations);
    this.capabilities = table(specs.capabilities);
    this.telemetry = table(specs.telemetry);
    this.commands = table(specs.commands);
    this.statuses = table(specs.statuses);
    this.devices = table(specs.devices);
    this.vehicles = table(specs.vehicles);
    this.rampClassifications = table(specs.rampClassifications);
    this.perceptionSamples = table(specs.perceptionSamples);
    this.docking = table(specs.docking);
    this.requests = table(specs.requests);
    this.vehicleStatuses = table(specs.vehicleStatuses);
    this.announcements = table(specs.announcements);
    this.diagnostics = table(specs.diagnostics);
    const auditPath = path.join(dataDirectory, "audit.ndjson");
    this.audit = pg
      ? new PostgresAuditLog(pg, auditPath)
      : new AuditLog(db, auditPath);
    this.ready = this.start(db, path.join(dataDirectory, "operations.json"));
    if (options.retentionTimer !== false) {
      this.timer = setInterval(
        () => void this.runRetention(),
        RETENTION_INTERVAL_MS,
      );
      this.timer.unref();
    }
  }

  private async start(
    database: SqliteDatabase | undefined,
    legacyJsonPath: string,
  ): Promise<void> {
    await importLegacyState(this, database, legacyJsonPath);
    await this.runRetention();
  }

  /** Records a command as open, so it is offered to the bus until a status closes it. */
  async putCommand(command: ActuatorCommand): Promise<void> {
    await this.commands.put(command);
  }

  /**
   * Records a status for a command. A terminal status closes the command (it is no longer
   * offered to the bus); any other status leaves it open.
   */
  async putStatus(status: ActuatorStatus): Promise<void> {
    await this.statuses.put(status);
    await this.commands.setIndex(
      status.commandId,
      "open",
      TERMINAL_ACTUATOR_STATES.includes(status.state) ? undefined : OPEN,
    );
  }

  /** Commands with no terminal status yet, oldest first. */
  async openCommands(limit: number): Promise<ActuatorCommand[]> {
    return await this.commands.find("open", OPEN, limit);
  }

  /**
   * Appends removed cases to the archive file (one line each, with when it was archived). The
   * file is readable only by its owner, passenger tokens are left out, and once it passes
   * `ARCHIVE_MAX_BYTES` it is rotated (the newest `ARCHIVE_KEEP_FILES` are kept), so the archive
   * cannot outlive the retention it exists to serve or grow without limit. Under Postgres it is
   * still a local file: on a host that does not keep its disk, treat it as best effort.
   */
  archive(entries: ArchivedCase[]): void {
    if (entries.length === 0) return;
    const archivedAt = new Date().toISOString();
    this.rotateArchive();
    fs.appendFileSync(
      this.archivePath,
      entries
        .map(
          (entry) =>
            `${JSON.stringify(withoutPassengerTokens({ archivedAt, ...entry }))}\n`,
        )
        .join(""),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  private rotateArchive(): void {
    try {
      if (fs.statSync(this.archivePath).size < ARCHIVE_MAX_BYTES) return;
    } catch {
      return; // no archive yet
    }
    for (let n = ARCHIVE_KEEP_FILES - 1; n >= 1; n -= 1) {
      const from = n === 1 ? this.archivePath : `${this.archivePath}.${n - 1}`;
      const to = `${this.archivePath}.${n}`;
      if (fs.existsSync(to)) fs.unlinkSync(to);
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
  }

  /** Applies the retention limits now; returns how many cases were archived. */
  async runRetention(nowMs = Date.now()): Promise<number> {
    try {
      return await enforceRetention(this, this.retention, nowMs);
    } catch (error) {
      logger.error("Retention failed", undefined, { error: String(error) });
      return 0;
    }
  }

  /** The SQLite connection, when there is one (for the shared lock leases). */
  get sqlite(): SqliteDatabase | undefined {
    return this.database;
  }

  /** A cheap read used by the readiness check: fails if the storage is unusable. */
  async ping(): Promise<void> {
    await this.cases.count();
  }

  /** Removes all data; with `removeFiles` also the audit and archive files. */
  async reset(removeFiles = false): Promise<void> {
    await this.cases.clear();
    for (const table of [
      this.observations,
      this.capabilities,
      this.telemetry,
      this.commands,
      this.statuses,
      this.devices,
      this.vehicles,
      this.rampClassifications,
      this.perceptionSamples,
      this.docking,
      this.requests,
      this.vehicleStatuses,
      this.announcements,
      this.diagnostics,
    ] as Array<DocumentTable<unknown>>)
      await table.clear();
    await this.audit.reset(removeFiles);
    if (removeFiles && fs.existsSync(this.archivePath))
      fs.unlinkSync(this.archivePath);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try {
      this.database?.close();
      if (this.ownsPostgres) void this.postgres?.end();
    } catch (error) {
      logger.warn("Could not close the operations database", undefined, {
        error: String(error),
      });
    }
  }
}

/** Case data keeps the full flush the old store used, unlike the latest-state bus tables. */
function openOperationsDatabase(file: string): SqliteDatabase | undefined {
  const database = openSqliteDatabase(file);
  database?.exec("PRAGMA synchronous = FULL;");
  return database;
}

function defaultDataDirectory(): string {
  const baseDirectory = path.resolve(
    process.env.GOASSIST_DATA_DIR ?? path.join(process.cwd(), ".runtime"),
  );
  return isTestRun()
    ? path.join(baseDirectory, `test-${process.pid}`)
    : baseDirectory;
}

let current: OperationsData | undefined;

/**
 * The audit log, without waiting for the data to be ready. Audit writes are fire-and-forget
 * (they are batched and never block a request), so they use this instead of
 * `getOperationsData()`.
 */
export function getAuditLog(): AuditSink {
  current ??= new OperationsData(defaultDataDirectory());
  return current.audit;
}

/** The current data, once it is ready to use. */
export async function getOperationsData(): Promise<OperationsData> {
  current ??= new OperationsData(defaultDataDirectory());
  await current.ready;
  return current;
}

/** Used by isolated tests and demo resets: closes the current data and opens another. */
export async function configureOperationsData(
  dataDirectory: string,
  options: OperationsDataOptions = {},
): Promise<OperationsData> {
  current?.close();
  current = new OperationsData(dataDirectory, options);
  await current.ready;
  return current;
}

export async function resetOperationsData(removeFiles = false): Promise<void> {
  await (await getOperationsData()).reset(removeFiles);
}

/** Closes the current data (if any) so its files can be removed; the next use opens it again. */
export function closeOperationsData(): void {
  current?.close();
  current = undefined;
}
