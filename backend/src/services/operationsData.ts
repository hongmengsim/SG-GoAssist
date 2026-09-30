import fs from "fs";
import path from "path";
import type {
  ActuatorCommand,
  ActuatorStatus,
  AutonomousVehicleState,
  DeviceHealth,
  PerceptionEvaluationSample,
  PrecisionDockingObservation,
  RampObstacleClassification,
  SafetyTelemetry,
  SignalObservation,
  VehicleCapability,
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
import { openSqliteDatabase, type SqliteDatabase } from "../storage/sqlite";
import { AuditLog } from "./auditLog";
import { importLegacyState } from "./legacyImport";
import { logger } from "./logger";
import {
  enforceRetention,
  retentionPolicyFromEnv,
  type ArchivedCase,
  type RetentionPolicy,
} from "./retention";

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

const specs = {
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
  readonly audit: AuditLog;
  readonly durable: boolean;
  readonly databasePath: string;
  readonly archivePath: string;
  private readonly database: SqliteDatabase | undefined;
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
    this.database = wantMemory
      ? undefined
      : openOperationsDatabase(this.databasePath);
    this.durable = this.database !== undefined;
    if (!this.durable && !wantMemory)
      logger.warn(
        "Operations data is using memory storage and will not survive a restart",
      );
    const db = this.database;
    const table = <T>(spec: TableSpec<T>): DocumentTable<T> =>
      db
        ? new SqliteDocumentTable<T>(db, spec)
        : new MemoryDocumentTable<T>(spec);
    this.cases = db ? new SqliteCaseRepository(db) : new MemoryCaseRepository();
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
    this.audit = new AuditLog(db, path.join(dataDirectory, "audit.ndjson"));
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

  /** Appends removed cases to the archive file (one line each, with when it was archived). */
  archive(entries: ArchivedCase[]): void {
    if (entries.length === 0) return;
    const archivedAt = new Date().toISOString();
    fs.appendFileSync(
      this.archivePath,
      entries
        .map((entry) => `${JSON.stringify({ archivedAt, ...entry })}\n`)
        .join(""),
      "utf8",
    );
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
    ] as Array<DocumentTable<unknown>>)
      await table.clear();
    this.audit.reset(removeFiles);
    if (removeFiles && fs.existsSync(this.archivePath))
      fs.unlinkSync(this.archivePath);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try {
      this.database?.close();
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
  return process.env.NODE_TEST_CONTEXT
    ? path.join(baseDirectory, `test-${process.pid}`)
    : baseDirectory;
}

let current: OperationsData | undefined;

/**
 * The audit log, without waiting for the data to be ready. Audit writes are fire-and-forget
 * (they are batched and never block a request), so they use this instead of
 * `getOperationsData()`.
 */
export function getAuditLog(): AuditLog {
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
