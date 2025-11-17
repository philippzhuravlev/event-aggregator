import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStructuredLogger } from "../../src/services/logger-service.ts";

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
});



