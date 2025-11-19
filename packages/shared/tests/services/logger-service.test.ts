import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createServiceLoggerFromStructuredLogger,
  createStructuredLogger,
  getConsoleServiceLogger,
  resolveServiceLogger,
} from "../../src/services/logger-service.ts";
import type { ServiceLogger } from "../../src/services/logger-service.ts";

const FIXED_TIME = "2024-01-01T00:00:00.000Z";

const parseLoggedPayload = (call: unknown[]): Record<string, unknown> => {
  const [arg] = call;
  expect(typeof arg).toBe("string");
  return JSON.parse(String(arg));
};

describe("services/logger-service createStructuredLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes structured info logs with metadata", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    logger.info("sync completed", { count: 5 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(logSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "INFO",
      message: "sync completed",
      timestamp: FIXED_TIME,
      count: 5,
    });
  });

  it("normalizes errors when logging failures", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    const error = new Error("network failure");

    logger.error("fetch failed", error, { retrying: false });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "fetch failed",
      retrying: false,
      timestamp: FIXED_TIME,
    });
    expect(payload.error).toMatchObject({
      message: "network failure",
      name: "Error",
    });
  });

  it("skips debug logs when predicate blocks them", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createStructuredLogger({
      shouldLogDebug: () => false,
      now: () => FIXED_TIME,
    });

    logger.debug("verbose event", { attempt: 1 });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("falls back to safe payload when serialization fails", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> & { self?: unknown } = {
      foo: "bar",
    };
    circular.self = circular;

    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.info("circular metadata", circular);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(logSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "Failed to serialize log payload",
      originalMessage: "circular metadata",
      timestamp: FIXED_TIME,
    });
  });

  it("logs warn messages", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    logger.warn("warning message", { key: "value" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(warnSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "WARNING",
      message: "warning message",
      timestamp: FIXED_TIME,
      key: "value",
    });
  });

  it("logs critical messages", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    const error = new Error("critical error");

    logger.critical("critical message", error, { context: "test" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "CRITICAL",
      message: "critical message",
      timestamp: FIXED_TIME,
      context: "test",
    });
    expect(payload.error).toMatchObject({
      message: "critical error",
      name: "Error",
    });
  });

  it("logs debug messages when shouldLogDebug returns true", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createStructuredLogger({
      shouldLogDebug: () => true,
      now: () => FIXED_TIME,
    });

    logger.debug("debug message", { debug: true });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(debugSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "DEBUG",
      message: "debug message",
      timestamp: FIXED_TIME,
      debug: true,
    });
  });

  it("handles non-Error objects in error logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    logger.error("error message", { custom: "error object" }, { meta: "data" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "error message",
      timestamp: FIXED_TIME,
      meta: "data",
    });
    expect(payload.error).toEqual({ details: { custom: "error object" } });
  });

  it("handles null error in error logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    logger.error("error message", null, { meta: "data" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "error message",
      timestamp: FIXED_TIME,
      meta: "data",
    });
    expect(payload.error).toBeUndefined();
  });

  it("handles undefined error in error logging", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    logger.error("error message", undefined, { meta: "data" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "error message",
      timestamp: FIXED_TIME,
      meta: "data",
    });
    expect(payload.error).toBeUndefined();
  });

  it("handles serialization error that is not an Error instance", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Mock JSON.stringify to throw a non-Error
    const originalStringify = JSON.stringify;
    vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw "string error"; // Not an Error instance
    });

    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.info("test message", { data: "test" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(logSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "Failed to serialize log payload",
      originalMessage: "test message",
      timestamp: FIXED_TIME,
    });
    expect(payload.serializationError).toBe("string error");

    // Restore
    JSON.stringify = originalStringify;
  });

  it("resolves to fallback logger when none is provided", () => {
    const fallback: Required<ServiceLogger> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const resolved = resolveServiceLogger(undefined, fallback);
    resolved.info("hello");
    expect(fallback.info).toHaveBeenCalledWith("hello");
  });

  it("fills missing logger methods from the fallback implementation", () => {
    const fallback: Required<ServiceLogger> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const partial: ServiceLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    const resolved = resolveServiceLogger(partial, fallback);
    resolved.info?.("info");
    resolved.warn?.("warn");

    expect(partial.info).toHaveBeenCalledWith("info");
    expect(fallback.warn).toHaveBeenCalledWith("warn");
  });

  it("wraps a structured logger for service consumption", () => {
    const baseLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const serviceLogger = createServiceLoggerFromStructuredLogger(baseLogger);
    serviceLogger.info("info", { count: 1 });
    serviceLogger.error("error", undefined, { context: "test" });
    serviceLogger.warn("warn", { level: "warn" });
    serviceLogger.debug("debug", { verbose: true });

    expect(baseLogger.info).toHaveBeenCalledWith("info", { count: 1 });
    expect(baseLogger.error).toHaveBeenCalledWith(
      "error",
      null,
      { context: "test" },
    );
    expect(baseLogger.warn).toHaveBeenCalledWith("warn", { level: "warn" });
    expect(baseLogger.debug).toHaveBeenCalledWith("debug", { verbose: true });
  });

  it("exposes console-backed logger helpers", () => {
    const logger = getConsoleServiceLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("console info", { foo: "bar" });

    expect(logSpy).toHaveBeenCalledWith("console info", { foo: "bar" });
  });

  it("createStructuredLogger uses default options when none provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createStructuredLogger();
    logger.info("default test");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(logSpy.mock.calls[0]);
    expect(payload.severity).toBe("INFO");
    expect(payload.message).toBe("default test");
    expect(typeof payload.timestamp).toBe("string");
    // Verify defaultNow is being used (timestamp should be a valid ISO string)
    expect(new Date(payload.timestamp as string).toISOString()).toBe(
      payload.timestamp,
    );
  });

  it("createStructuredLogger uses default shouldLogDebug when not provided", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    // shouldLogDebug defaults to () => true, so debug should be logged
    logger.debug("debug with default predicate");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(debugSpy.mock.calls[0]);
    expect(payload.severity).toBe("DEBUG");
    expect(payload.message).toBe("debug with default predicate");
  });

  it("createStructuredLogger handles info without metadata", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.info("simple message");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(logSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "INFO",
      message: "simple message",
      timestamp: FIXED_TIME,
    });
  });

  it("createStructuredLogger handles warn without metadata", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.warn("simple warning");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(warnSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "WARNING",
      message: "simple warning",
      timestamp: FIXED_TIME,
    });
  });

  it("createStructuredLogger handles critical without error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.critical("critical issue", undefined, { subsystem: "test" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "CRITICAL",
      message: "critical issue",
      subsystem: "test",
      timestamp: FIXED_TIME,
    });
    expect(payload.error).toBeUndefined();
  });

  it("createStructuredLogger handles debug without metadata", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createStructuredLogger({
      shouldLogDebug: () => true,
      now: () => FIXED_TIME,
    });
    logger.debug("simple debug");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(debugSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "DEBUG",
      message: "simple debug",
      timestamp: FIXED_TIME,
    });
  });

  it("createStructuredLogger handles Error instance in serialization error", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const originalStringify = JSON.stringify;
    let callCount = 0;
    JSON.stringify = function (value: unknown) {
      callCount++;
      if (callCount === 1) {
        throw new Error("Serialization failed");
      }
      return originalStringify.call(this, value);
    };

    try {
      const logger = createStructuredLogger({ now: () => FIXED_TIME });
      logger.info("test", { data: "test" });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = parseLoggedPayload(logSpy.mock.calls[0]);
      expect(payload).toMatchObject({
        severity: "ERROR",
        message: "Failed to serialize log payload",
        originalMessage: "test",
        timestamp: FIXED_TIME,
      });
      expect((payload.serializationError as Record<string, unknown>).message).toBe(
        "Serialization failed",
      );
    } finally {
      JSON.stringify = originalStringify;
    }
  });

  it("normalizeError handles falsy values", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStructuredLogger({ now: () => FIXED_TIME });

    // Test with false
    logger.error("test1", false, {});
    let payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload.error).toBeUndefined();

    // Test with 0
    logger.error("test2", 0, {});
    payload = parseLoggedPayload(errorSpy.mock.calls[1]);
    expect(payload.error).toBeUndefined();

    // Test with empty string
    logger.error("test3", "", {});
    payload = parseLoggedPayload(errorSpy.mock.calls[2]);
    expect(payload.error).toBeUndefined();
  });

  it("resolveServiceLogger uses default console logger when no fallback provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const resolved = resolveServiceLogger(undefined);
    resolved.info("test");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("test");
  });

  it("createServiceLoggerFromStructuredLogger handles null error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const structured = createStructuredLogger({ now: () => FIXED_TIME });
    const serviceLogger = createServiceLoggerFromStructuredLogger(structured);
    serviceLogger.error("error message", null, { context: "test" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = parseLoggedPayload(errorSpy.mock.calls[0]);
    expect(payload).toMatchObject({
      severity: "ERROR",
      message: "error message",
      context: "test",
      timestamp: FIXED_TIME,
    });
    expect(payload.error).toBeUndefined();
  });

  it("getConsoleServiceLogger handles null error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.error("error message", null, { meta: "data" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe("error message");
    expect(errorSpy.mock.calls[0][1]).toBe(null);
    expect(errorSpy.mock.calls[0][2]).toEqual({ meta: "data" });
  });

  it("getConsoleServiceLogger handles warn without metadata", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.warn("warning-without-metadata");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe("warning-without-metadata");
  });

  it("getConsoleServiceLogger handles debug without metadata", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.debug("debug-without-metadata");

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0][0]).toBe("debug-without-metadata");
  });

  it("getConsoleServiceLogger handles info with metadata", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.info("info-with-metadata", { key: "value" });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("info-with-metadata");
    expect(logSpy.mock.calls[0][1]).toEqual({ key: "value" });
  });

  it("getConsoleServiceLogger handles warn with metadata", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.warn("warn-with-metadata", { level: "high" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe("warn-with-metadata");
    expect(warnSpy.mock.calls[0][1]).toEqual({ level: "high" });
  });

  it("getConsoleServiceLogger handles debug with metadata", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.debug("debug-with-metadata", { verbose: true });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0][0]).toBe("debug-with-metadata");
    expect(debugSpy.mock.calls[0][1]).toEqual({ verbose: true });
  });

  it("getConsoleServiceLogger handles error with Error and metadata", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    const err = new Error("test error");
    logger.error("error-message", err, { context: "test" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe("error-message");
    expect(errorSpy.mock.calls[0][1]).toBe(err);
    expect(errorSpy.mock.calls[0][2]).toEqual({ context: "test" });
  });

  it("getConsoleServiceLogger handles error with undefined error and metadata", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = getConsoleServiceLogger();
    logger.error("error-message", undefined, { context: "test" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe("error-message");
    expect(errorSpy.mock.calls[0][1]).toBe(null);
    expect(errorSpy.mock.calls[0][2]).toEqual({ context: "test" });
  });

  it("resolveServiceLogger uses provided logger when all methods are present", () => {
    let customInfoCalls = 0;
    let customWarnCalls = 0;
    let customErrorCalls = 0;
    let customDebugCalls = 0;

    const fullLogger: Required<ServiceLogger> = {
      info: () => {
        customInfoCalls++;
      },
      warn: () => {
        customWarnCalls++;
      },
      error: () => {
        customErrorCalls++;
      },
      debug: () => {
        customDebugCalls++;
      },
    };

    const resolved = resolveServiceLogger(fullLogger);
    resolved.info("info");
    resolved.warn("warn");
    resolved.error("error", new Error("test"));
    resolved.debug("debug");

    expect(customInfoCalls).toBe(1);
    expect(customWarnCalls).toBe(1);
    expect(customErrorCalls).toBe(1);
    expect(customDebugCalls).toBe(1);
  });

  it("createServiceLoggerFromStructuredLogger handles all methods with metadata", () => {
    const baseLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const serviceLogger = createServiceLoggerFromStructuredLogger(baseLogger);
    serviceLogger.info("info", { count: 1 });
    serviceLogger.warn("warn", { level: "high" });
    serviceLogger.error("error", new Error("test"), { context: "test" });
    serviceLogger.debug("debug", { verbose: true });

    expect(baseLogger.info).toHaveBeenCalledWith("info", { count: 1 });
    expect(baseLogger.warn).toHaveBeenCalledWith("warn", { level: "high" });
    expect(baseLogger.error).toHaveBeenCalledWith("error", new Error("test"), {
      context: "test",
    });
    expect(baseLogger.debug).toHaveBeenCalledWith("debug", { verbose: true });
  });

  it("createServiceLoggerFromStructuredLogger handles error with undefined", () => {
    const baseLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    const serviceLogger = createServiceLoggerFromStructuredLogger(baseLogger);
    serviceLogger.error("error", undefined, { context: "test" });

    expect(baseLogger.error).toHaveBeenCalledWith("error", null, {
      context: "test",
    });
  });

  it("resolveServiceLogger falls back for missing warn method", () => {
    let fallbackWarnCalls = 0;
    const fallback: Required<ServiceLogger> = {
      info: vi.fn(),
      warn: () => {
        fallbackWarnCalls++;
      },
      error: vi.fn(),
      debug: vi.fn(),
    };

    const partialLogger: ServiceLogger = {
      info: vi.fn(),
    };

    const resolved = resolveServiceLogger(partialLogger, fallback);
    resolved.warn?.("should use fallback");

    expect(fallbackWarnCalls).toBe(1);
  });

  it("resolveServiceLogger falls back for missing error method", () => {
    let fallbackErrorCalls = 0;
    const fallback: Required<ServiceLogger> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: () => {
        fallbackErrorCalls++;
      },
      debug: vi.fn(),
    };

    const partialLogger: ServiceLogger = {
      info: vi.fn(),
    };

    const resolved = resolveServiceLogger(partialLogger, fallback);
    resolved.error?.("error", new Error("test"));

    expect(fallbackErrorCalls).toBe(1);
  });

  it("resolveServiceLogger falls back for missing debug method", () => {
    let fallbackDebugCalls = 0;
    const fallback: Required<ServiceLogger> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: () => {
        fallbackDebugCalls++;
      },
    };

    const partialLogger: ServiceLogger = {
      info: vi.fn(),
    };

    const resolved = resolveServiceLogger(partialLogger, fallback);
    resolved.debug?.("debug message");

    expect(fallbackDebugCalls).toBe(1);
  });
});



