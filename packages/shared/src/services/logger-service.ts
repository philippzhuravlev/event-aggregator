import type { ErrorMetadata, LogMetadata } from "../types.ts";

export interface LoggerOptions {
  /**
   * Determines whether debug logs should be emitted.
   * Defaults to always logging debug messages.
   */
  shouldLogDebug?: () => boolean;
  /**
   * Allows overriding the timestamp generator, primarily for testing.
   */
  now?: () => string;
}

export interface StructuredLogger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(
    message: string,
    error?: unknown | null,
    metadata?: ErrorMetadata,
  ): void;
  critical(
    message: string,
    error?: unknown | null,
    metadata?: ErrorMetadata,
  ): void;
  debug(message: string, metadata?: LogMetadata): void;
}

const defaultNow = () => new Date().toISOString();

export interface ServiceLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  warn?(message: string, metadata?: Record<string, unknown>): void;
  error?(
    message: string,
    error?: Error | null,
    metadata?: Record<string, unknown>,
  ): void;
  debug?(message: string, metadata?: Record<string, unknown>): void;
}

type LoggerLike = Pick<
  StructuredLogger,
  "info" | "warn" | "error" | "debug"
>;

const consoleServiceLogger: Required<ServiceLogger> = {
  info(message, metadata) {
    console.log(message, ...(metadata ? [metadata] : []));
  },
  warn(message, metadata) {
    console.warn(message, ...(metadata ? [metadata] : []));
  },
  error(message, error, metadata) {
    console.error(message, error ?? null, metadata);
  },
  debug(message, metadata) {
    console.debug(message, ...(metadata ? [metadata] : []));
  },
};

export function getConsoleServiceLogger(): Required<ServiceLogger> {
  return consoleServiceLogger;
}

export function resolveServiceLogger(
  logger?: ServiceLogger,
  fallback: Required<ServiceLogger> = consoleServiceLogger,
): Required<ServiceLogger> {
  if (!logger) {
    return fallback;
  }

  return {
    info: logger.info ?? fallback.info,
    warn: logger.warn ?? fallback.warn,
    error: logger.error ?? fallback.error,
    debug: logger.debug ?? fallback.debug,
  };
}

export function createServiceLoggerFromStructuredLogger(
  baseLogger: LoggerLike,
): Required<ServiceLogger> {
  return {
    info(message, metadata) {
      baseLogger.info(message, metadata);
    },
    warn(message, metadata) {
      baseLogger.warn(message, metadata);
    },
    error(message, error, metadata) {
      baseLogger.error(message, error ?? null, metadata);
    },
    debug(message, metadata) {
      baseLogger.debug(message, metadata);
    },
  };
}

function normalizeError(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  return { details: error };
}

function write(
  consoleFn: (message?: unknown, ...optionalParams: unknown[]) => void,
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL" | "DEBUG",
  message: string,
  metadata: LogMetadata = {},
  now: () => string,
  error?: unknown | null,
): void {
  const payload: Record<string, unknown> = {
    severity,
    message,
    timestamp: now(),
    ...metadata,
  };

  const normalized = normalizeError(error ?? undefined);
  if (normalized) {
    payload.error = normalized;
  }

  try {
    consoleFn(JSON.stringify(payload));
  } catch (serializationError) {
    // Fallback to a safe console output if JSON serialization fails.
    consoleFn(
      JSON.stringify({
        severity: "ERROR",
        message: "Failed to serialize log payload",
        originalMessage: message,
        timestamp: now(),
        serializationError: serializationError instanceof Error
          ? {
            message: serializationError.message,
            stack: serializationError.stack,
            name: serializationError.name,
          }
          : serializationError,
      }),
    );
  }
}

export function createStructuredLogger(
  options: LoggerOptions = {},
): StructuredLogger {
  const {
    shouldLogDebug = () => true,
    now = defaultNow,
  } = options;

  return {
    info(message, metadata) {
      write(console.log, "INFO", message, metadata, now);
    },
    warn(message, metadata) {
      write(console.warn, "WARNING", message, metadata, now);
    },
    error(message, error, metadata) {
      write(console.error, "ERROR", message, metadata, now, error);
    },
    critical(message, error, metadata) {
      write(console.error, "CRITICAL", message, metadata, now, error);
    },
    debug(message, metadata) {
      if (!shouldLogDebug()) return;
      write(console.debug, "DEBUG", message, metadata, now);
    },
  };
}
