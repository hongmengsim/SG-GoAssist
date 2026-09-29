/**
 * Logger Service
 *
 * Provides structured logging with timestamps for:
 * - Request lifecycle events
 * - System performance metrics
 * - Error tracking
 */

interface LogEntry {
  timestamp: string;
  requestId?: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  data?: Record<string, any>;
}

/** The in-memory log keeps only the newest entries, so it cannot grow without bound. */
export const MAX_LOG_ENTRIES = 2000;

class Logger {
  private logs: LogEntry[] = [];

  /** Keeps an entry in memory without printing it. */
  record(
    level: "INFO" | "WARN" | "ERROR" | "DEBUG",
    message: string,
    requestId?: string,
    data?: Record<string, any>,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId,
      data,
    };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }
    return entry;
  }

  log(
    level: "INFO" | "WARN" | "ERROR" | "DEBUG",
    message: string,
    requestId?: string,
    data?: Record<string, any>,
  ) {
    const entry = this.record(level, message, requestId, data);
    console.log(
      `[${entry.timestamp}] [${level}] ${requestId ? `[${requestId}] ` : ""}${message}`,
      data || "",
    );
  }

  info(message: string, requestId?: string, data?: Record<string, any>) {
    this.log("INFO", message, requestId, data);
  }

  warn(message: string, requestId?: string, data?: Record<string, any>) {
    this.log("WARN", message, requestId, data);
  }

  error(message: string, requestId?: string, data?: Record<string, any>) {
    this.log("ERROR", message, requestId, data);
  }

  debug(message: string, requestId?: string, data?: Record<string, any>) {
    this.log("DEBUG", message, requestId, data);
  }

  getLogs(requestId?: string): LogEntry[] {
    if (requestId) {
      return this.logs.filter((log) => log.requestId === requestId);
    }
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();
