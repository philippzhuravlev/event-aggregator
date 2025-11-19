import {
  assertEquals,
  assertObjectMatch,
} from "std/assert/mod.ts";
import { stub } from "std/testing/mock.ts";
import type { ServiceLogger } from "@event-aggregator/shared/src/services/logger-service.ts";
import {
  createServiceLoggerFromStructuredLogger,
  createStructuredLogger,
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

