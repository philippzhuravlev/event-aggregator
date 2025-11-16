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
});



