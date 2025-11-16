import { assertEquals, assertExists } from "std/assert/mod.ts";
import { validateCleanupEventsQuery } from "../../cleanup-events/schema.ts";

Deno.test("validateCleanupEventsQuery returns error for missing daysToKeep", () => {
  const url = new URL("https://example.com/cleanup-events");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, false);
  assertEquals(result.error, "daysToKeep parameter is required");
});

Deno.test("validateCleanupEventsQuery returns error for NaN daysToKeep", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=invalid");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, false);
  assertEquals(result.error, "daysToKeep must be a positive integer");
});

Deno.test("validateCleanupEventsQuery returns error for zero daysToKeep", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=0");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, false);
  assertEquals(result.error, "daysToKeep must be a positive integer");
});

Deno.test("validateCleanupEventsQuery returns error for negative daysToKeep", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=-1");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, false);
  assertEquals(result.error, "daysToKeep must be a positive integer");
});

Deno.test("validateCleanupEventsQuery parses valid daysToKeep", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=90");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data!.daysToKeep, 90);
});

Deno.test("validateCleanupEventsQuery defaults dryRun to false", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=90");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, false);
});

Deno.test("validateCleanupEventsQuery parses dryRun=true", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=90&dryRun=true");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, true);
});

Deno.test("validateCleanupEventsQuery parses dryRun=false", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=90&dryRun=false");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, false);
});

Deno.test("validateCleanupEventsQuery treats non-true dryRun as false", () => {
  const url = new URL("https://example.com/cleanup-events?daysToKeep=90&dryRun=anything");
  const result = validateCleanupEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.dryRun, false);
});

