import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
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
import { logger } from "./logger";

export interface OperationsAuditEvent {
  eventId: string;
  eventType: string;
  caseId?: string;
  busId?: string;
  actor: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  /** Callers always pass a bound. */
  limit: number;
  caseId?: string;
  busId?: string;
}

export interface OperationsState {
  cases: AssistanceCase[];
  observations: SignalObservation[];
  capabilities: VehicleCapability[];
  safetyTelemetry: SafetyTelemetry[];
  actuatorCommands: ActuatorCommand[];
  actuatorStatuses: ActuatorStatus[];
  devices: DeviceHealth[];
  autonomousVehicles: AutonomousVehicleState[];
  rampObstacleClassifications: RampObstacleClassification[];
  perceptionEvaluationSamples: PerceptionEvaluationSample[];
  precisionDockingObservations: PrecisionDockingObservation[];
}

const emptyState = (): OperationsState => ({
  cases: [],
  observations: [],
  capabilities: [],
  safetyTelemetry: [],
  actuatorCommands: [],
  actuatorStatuses: [],
  devices: [],
  autonomousVehicles: [],
  rampObstacleClassifications: [],
  perceptionEvaluationSamples: [],
  precisionDockingObservations: [],
});

export class OperationsStore {
  private state: OperationsState;
  private database?: {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      get: (...values: unknown[]) => unknown;
      all: (...values: unknown[]) => unknown[];
      run: (...values: unknown[]) => unknown;
    };
  };
  readonly statePath: string;
  readonly auditPath: string;
  readonly backupPath: string;
  readonly databasePath: string;

  constructor(dataDirectory = defaultDataDirectory()) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    this.statePath = path.join(dataDirectory, "operations.json");
    this.auditPath = path.join(dataDirectory, "audit.ndjson");
    this.backupPath = `${this.statePath}.backup`;
    this.databasePath = path.join(dataDirectory, "operations.sqlite");
    this.database = this.openDatabase();
    this.state = this.load();
  }

  snapshot(): OperationsState {
    return structuredClone(this.state);
  }

  update(mutator: (state: OperationsState) => void): OperationsState {
    mutator(this.state);
    this.persist();
    return this.snapshot();
  }

  appendAudit(event: OperationsAuditEvent): void {
    this.database
      ?.prepare(
        "INSERT INTO audit_events (event_id, event_type, case_id, bus_id, actor, timestamp, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.eventId,
        event.eventType,
        event.caseId ?? null,
        event.busId ?? null,
        event.actor,
        event.timestamp,
        JSON.stringify(event.detail ?? {}),
      );
    fs.appendFileSync(this.auditPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  /**
   * Newest events first. SQLite answers from indexes and reads only `limit` rows; the
   * ndjson fallback has to read the whole file, which is acceptable for a demo-sized log
   * and is the reason the SQLite driver is the default outside tests.
   */
  readAudit(query: AuditQuery): OperationsAuditEvent[] {
    return this.database
      ? this.readAuditFromDatabase(query)
      : this.readAuditFromFile(query);
  }

  private readAuditFromDatabase(query: AuditQuery): OperationsAuditEvent[] {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.caseId !== undefined) {
      conditions.push("case_id = ?");
      values.push(query.caseId);
    }
    if (query.busId !== undefined) {
      conditions.push("bus_id = ?");
      values.push(query.busId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database
      ?.prepare(
        `SELECT event_id, event_type, case_id, bus_id, actor, timestamp, detail_json FROM audit_events ${where} ORDER BY sequence DESC LIMIT ?`,
      )
      .all(...values, query.limit) as Array<{
      event_id: string;
      event_type: string;
      case_id: string | null;
      bus_id: string | null;
      actor: string;
      timestamp: string;
      detail_json: string;
    }>;
    return (rows ?? []).map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      ...(row.case_id !== null ? { caseId: row.case_id } : {}),
      ...(row.bus_id !== null ? { busId: row.bus_id } : {}),
      actor: row.actor,
      timestamp: row.timestamp,
      detail: JSON.parse(row.detail_json) as Record<string, unknown>,
    }));
  }

  private readAuditFromFile(query: AuditQuery): OperationsAuditEvent[] {
    if (!fs.existsSync(this.auditPath)) return [];
    const matches: OperationsAuditEvent[] = [];
    const lines = fs.readFileSync(this.auditPath, "utf8").split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (!lines[index]) continue;
      let parsed: OperationsAuditEvent;
      try {
        parsed = JSON.parse(lines[index]) as OperationsAuditEvent;
      } catch (error) {
        logger.warn("Skipped an unreadable audit line", undefined, {
          error: String(error),
        });
        continue;
      }
      if (query.caseId !== undefined && parsed.caseId !== query.caseId)
        continue;
      if (query.busId !== undefined && parsed.busId !== query.busId) continue;
      matches.push(parsed);
      if (matches.length >= query.limit) break;
    }
    return matches;
  }

  reset(removePersistentFiles = false): void {
    this.state = emptyState();
    if (this.database) {
      this.database.exec(
        "DELETE FROM operations_state; DELETE FROM audit_events;",
      );
      this.persist();
    }
    if (removePersistentFiles) {
      for (const target of [this.statePath, this.backupPath, this.auditPath]) {
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
      }
      return;
    }
    this.persist();
  }

  private load(): OperationsState {
    if (this.database) {
      const row = this.database
        .prepare("SELECT state_json FROM operations_state WHERE id = 1")
        .get() as { state_json?: string } | undefined;
      if (!row?.state_json) return emptyState();
      try {
        return {
          ...emptyState(),
          ...JSON.parse(row.state_json),
        } as OperationsState;
      } catch (error) {
        logger.error("Unable to read SQLite operations state", undefined, {
          databasePath: this.databasePath,
          error: String(error),
        });
        return emptyState();
      }
    }
    if (!fs.existsSync(this.statePath)) {
      return emptyState();
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
      return { ...emptyState(), ...parsed } as OperationsState;
    } catch (error) {
      logger.error("Unable to read persisted operations state", undefined, {
        statePath: this.statePath,
        error: String(error),
      });
      if (fs.existsSync(this.backupPath)) {
        try {
          return {
            ...emptyState(),
            ...JSON.parse(fs.readFileSync(this.backupPath, "utf8")),
          } as OperationsState;
        } catch {
          // Fall through to a safe empty state when both files are invalid.
        }
      }
      return emptyState();
    }
  }

  private persist(): void {
    if (this.database) {
      this.database
        .prepare(
          "INSERT INTO operations_state (id, state_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
        )
        .run(JSON.stringify(this.state), new Date().toISOString());
      return;
    }
    const temporaryPath = `${this.statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(this.state, null, 2),
      "utf8",
    );
    if (fs.existsSync(this.statePath)) {
      fs.copyFileSync(this.statePath, this.backupPath);
    }
    fs.copyFileSync(temporaryPath, this.statePath);
    fs.unlinkSync(temporaryPath);
  }

  private openDatabase(): OperationsStore["database"] {
    if (
      (process.env.NODE_TEST_CONTEXT &&
        process.env.GOASSIST_STORAGE_DRIVER?.toLowerCase() !== "sqlite") ||
      process.env.GOASSIST_STORAGE_DRIVER?.toLowerCase() === "json"
    ) {
      return undefined;
    }
    try {
      // Dynamic loading keeps Node 20-compatible deployments on the JSON fallback.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseSync } = require("node:sqlite") as {
        DatabaseSync: new (
          filename: string,
        ) => NonNullable<OperationsStore["database"]>;
      };
      const database = new DatabaseSync(this.databasePath);
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS operations_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          case_id TEXT,
          bus_id TEXT,
          actor TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          detail_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_events_case ON audit_events (case_id, sequence);
        CREATE INDEX IF NOT EXISTS audit_events_bus ON audit_events (bus_id, sequence);
      `);
      return database;
    } catch (error) {
      logger.warn(
        "SQLite unavailable; using durable JSON operations store",
        undefined,
        {
          error: String(error),
        },
      );
      return undefined;
    }
  }
}

function defaultDataDirectory(): string {
  const baseDirectory = path.resolve(
    process.env.GOASSIST_DATA_DIR ?? path.join(process.cwd(), ".runtime"),
  );
  return process.env.NODE_TEST_CONTEXT
    ? path.join(baseDirectory, `test-${process.pid}`)
    : baseDirectory;
}

let store = new OperationsStore();

export function getOperationsStore(): OperationsStore {
  return store;
}

/** Used by isolated tests and demo resets. */
export function configureOperationsStore(
  dataDirectory: string,
): OperationsStore {
  store = new OperationsStore(dataDirectory);
  return store;
}

export function resetOperationsStore(removePersistentFiles = false): void {
  store.reset(removePersistentFiles);
}
