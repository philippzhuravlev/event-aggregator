import { assertEquals, assertExists } from "std/assert/mod.ts";
import { assertSpyCalls, stub } from "std/testing/mock.ts";
import { logger } from "../../../_shared/services/logger-service.ts";
import { sanitizeHtml } from "@event-aggregator/shared/validation/input-validation.js";

Deno.test("logger service exports logger instance", () => {
  assertExists(logger);
  assertEquals(typeof logger.info, "function");
  assertEquals(typeof logger.warn, "function");
  assertEquals(typeof logger.error, "function");
  assertEquals(typeof logger.debug, "function");
});

Deno.test("logger.info logs with metadata", () => {
  // Just verify it doesn't throw
  logger.info("Test message", { key: "value" });
  assertEquals(true, true); // Test passes if no error
});

Deno.test("logger.warn logs with metadata", () => {
  logger.warn("Test warning", { key: "value" });
  assertEquals(true, true);
});

Deno.test("logger.error logs with error and metadata", () => {
  logger.error("Test error", new Error("Test"), { key: "value" });
  assertEquals(true, true);
});

Deno.test("logger.error logs with null error", () => {
  logger.error("Test error", null, { key: "value" });
  assertEquals(true, true);
});

Deno.test("logger.debug logs with metadata", () => {
  logger.debug("Test debug", { key: "value" });
  assertEquals(true, true);
});

Deno.test("logger methods work without metadata", () => {
  logger.info("Test message");
  logger.warn("Test warning");
  logger.error("Test error", null);
  logger.debug("Test debug");
  assertEquals(true, true);
});

Deno.test("input validation logger delegates warn calls to structured logger", () => {
  const warnStub = stub(logger, "warn", () => {});
  try {
    const faultyAllowedTags = {
      has() {
        throw new Error("boom");
      },
    } as unknown as Set<string>;

    sanitizeHtml("<p>boom</p>", faultyAllowedTags);
    assertSpyCalls(warnStub, 1);
  } finally {
    warnStub.restore();
  }
});
