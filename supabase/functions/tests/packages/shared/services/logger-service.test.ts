import {
  assertEquals,
  assertObjectMatch,
} from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import type { ServiceLogger } from "@event-aggregator/shared/src/services/logger-service.ts";
import {
  createServiceLoggerFromStructuredLogger,
  createStructuredLogger,
  getConsoleServiceLogger,
  resolveServiceLogger,
} from "@event-aggregator/shared/src/services/logger-service.ts";

const FIXED_TIME = "2025-01-01T00:00:00.000Z";

function parsePayload(callArgs: unknown[]): Record<string, unknown> {
  const [payload] = callArgs;
  if (typeof payload !== "string") {
    throw new Error("Expected logger to emit a JSON string payload");
  }
  return JSON.parse(payload);
}

Deno.test("createStructuredLogger emits structured info logs", () => {
  const logStub = stub(console, "log", () => {});
  try {
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.info("sync complete", { count: 3 });

    assertEquals(logStub.calls.length, 1);
    assertObjectMatch(parsePayload(logStub.calls[0].args), {
      severity: "INFO",
      message: "sync complete",
      timestamp: FIXED_TIME,
      count: 3,
    });
  } finally {
    logStub.restore();
  }
});

Deno.test("createStructuredLogger normalizes arbitrary error inputs", () => {
  const errorStub = stub(console, "error", () => {});
  try {
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.error("boom", { custom: "error" });

    assertEquals(errorStub.calls.length, 1);
    const payload = parsePayload(errorStub.calls[0].args);
    assertEquals(payload.severity, "ERROR");
    assertEquals(payload.message, "boom");
    assertEquals(payload.timestamp, FIXED_TIME);
    assertEquals(payload.error, { details: { custom: "error" } });
  } finally {
    errorStub.restore();
  }
});

Deno.test("resolveServiceLogger fills in missing methods from fallback", () => {
  let customInfoCalls = 0;
  let fallbackWarnCalls = 0;
  const fallback: Required<ServiceLogger> = {
    info: () => {},
    warn: () => fallbackWarnCalls++,
    error: () => {},
    debug: () => {},
  };

  const partialLogger: ServiceLogger = {
    info: () => customInfoCalls++,
  };

  const resolved = resolveServiceLogger(partialLogger, fallback);
  resolved.info("custom");
  resolved.warn?.("fallback");

  assertEquals(customInfoCalls, 1);
  assertEquals(fallbackWarnCalls, 1);
});

Deno.test("createServiceLoggerFromStructuredLogger proxies calls", () => {
  const proxyLog = stub(console, "log", () => {});
  const proxyWarn = stub(console, "warn", () => {});
  const proxyError = stub(console, "error", () => {});
  const proxyDebug = stub(console, "debug", () => {});

  try {
    const structured = createStructuredLogger({ now: () => FIXED_TIME });
    const serviceLogger = createServiceLoggerFromStructuredLogger(structured);

    serviceLogger.info("info");
    serviceLogger.warn("warn");
    serviceLogger.error("error", new Error("boom"));
    serviceLogger.debug("debug");

    assertEquals(proxyLog.calls.length, 1);
    assertEquals(proxyWarn.calls.length, 1);
    assertEquals(proxyError.calls.length, 1);
    assertEquals(proxyDebug.calls.length, 1);
  } finally {
    proxyLog.restore();
    proxyWarn.restore();
    proxyError.restore();
    proxyDebug.restore();
  }
});

Deno.test("createStructuredLogger suppresses debug when predicate returns false", () => {
  const debugStub = stub(console, "debug", () => {});
  try {
    const logger = createStructuredLogger({
      shouldLogDebug: () => false,
      now: () => FIXED_TIME,
    });
    logger.debug("hidden");
    assertEquals(debugStub.calls.length, 0);
  } finally {
    debugStub.restore();
  }
});

Deno.test("createStructuredLogger logs debug when predicate allows it", () => {
  const debugStub = stub(console, "debug", () => {});
  try {
    const logger = createStructuredLogger({
      shouldLogDebug: () => true,
      now: () => FIXED_TIME,
    });
    logger.debug("verbose", { detail: 42 });
    assertEquals(debugStub.calls.length, 1);
    const payload = parsePayload(debugStub.calls[0].args);
    assertEquals(payload.severity, "DEBUG");
    assertEquals(payload.detail, 42);
  } finally {
    debugStub.restore();
  }
});

Deno.test("createStructuredLogger logs critical severity with normalized error", () => {
  const errorStub = stub(console, "error", () => {});
  try {
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    const err = new Error("catastrophic");
    logger.critical("critical issue", err, { subsystem: "facebook" });

    assertEquals(errorStub.calls.length, 1);
    const payload = parsePayload(errorStub.calls[0].args);
    assertEquals(payload.severity, "CRITICAL");
    assertEquals(payload.message, "critical issue");
    assertEquals(payload.subsystem, "facebook");
    assertEquals((payload.error as Record<string, unknown>).message, "catastrophic");
  } finally {
    errorStub.restore();
  }
});

Deno.test("createStructuredLogger falls back when metadata serialization fails", () => {
  const logStub = stub(console, "log", () => {});
  try {
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    const circular: Record<string, unknown> & { self?: unknown } = {};
    circular.self = circular;

    logger.info("circular payload", circular);

    assertEquals(logStub.calls.length, 1);
    const payload = parsePayload(logStub.calls[0].args);
    assertEquals(payload.message, "Failed to serialize log payload");
    assertEquals(payload.originalMessage, "circular payload");
  } finally {
    logStub.restore();
  }
});

Deno.test("createStructuredLogger error omits payload error when null provided", () => {
  const errorStub = stub(console, "error", () => {});
  try {
    const logger = createStructuredLogger({ now: () => FIXED_TIME });
    logger.error("no error object", null, { context: "test" });
    assertEquals(errorStub.calls.length, 1);
    const payload = parsePayload(errorStub.calls[0].args);
    assertEquals(payload.severity, "ERROR");
    assertEquals(payload.context, "test");
    if ("error" in payload) {
      throw new Error("Payload should not have an error field");
    }
  } finally {
    errorStub.restore();
  }
});

Deno.test("getConsoleServiceLogger proxies console methods", () => {
  const logStub = stub(console, "log", () => {});
  const warnStub = stub(console, "warn", () => {});
  const errorStub = stub(console, "error", () => {});
  const debugStub = stub(console, "debug", () => {});

  try {
    const logger = getConsoleServiceLogger();
    logger.info("info", { meta: 1 });
    logger.warn("warn", { meta: 2 });
    logger.error("error", new Error("boom"), { meta: 3 });
    logger.debug("debug", { meta: 4 });

    assertEquals(logStub.calls.length, 1);
    assertEquals(warnStub.calls.length, 1);
    assertEquals(errorStub.calls.length, 1);
    assertEquals(debugStub.calls.length, 1);
  } finally {
    logStub.restore();
    warnStub.restore();
    errorStub.restore();
    debugStub.restore();
  }
});

Deno.test("resolveServiceLogger returns fallback when logger is undefined", () => {
  const fallback: Required<ServiceLogger> = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  const resolved = resolveServiceLogger(undefined, fallback);
  assertEquals(resolved, fallback);
});

Deno.test("getConsoleServiceLogger omits metadata when not provided", () => {
  const warnStub = stub(console, "warn", () => {});
  const debugStub = stub(console, "debug", () => {});

  try {
    const consoleLogger = getConsoleServiceLogger();
    consoleLogger.warn("warning-without-metadata");
    consoleLogger.debug("debug-without-metadata");

    assertEquals(warnStub.calls.length, 1);
    assertEquals(warnStub.calls[0].args, ["warning-without-metadata"]);
    assertEquals(debugStub.calls.length, 1);
    assertEquals(debugStub.calls[0].args, ["debug-without-metadata"]);
  } finally {
    warnStub.restore();
    debugStub.restore();
  }
});

Deno.test("resolveServiceLogger falls back for missing info method", () => {
  let fallbackInfoCalls = 0;
  const fallback: Required<ServiceLogger> = {
    info: () => {
      fallbackInfoCalls++;
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  const partialLogger: ServiceLogger = {
    warn: () => {},
  };

  const resolved = resolveServiceLogger(partialLogger, fallback);
  resolved.info("should use fallback");

  assertEquals(fallbackInfoCalls, 1);
  resolved.warn?.("still available");
});

