import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleCleanupEvents, cleanupOldEvents } from "./index.ts";
import type { CleanupResult } from "@event-aggregator/shared/types.ts";

function createSupabaseClientMock() {
  return {
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  };
}

function createMockEnv() {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "SUPABASE_URL") return "https://test.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-key";
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

Deno.test("handleCleanupEvents returns 405 for non-POST requests", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/cleanup-events", {
      method: "GET",
    });

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 405);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
      error: "Method not allowed",
    });
  } finally {
    restoreEnv();
  }
});

Deno.test("handleCleanupEvents handles OPTIONS for CORS", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/cleanup-events", {
      method: "OPTIONS",
    });

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 204);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleCleanupEvents returns 400 for invalid daysToKeep", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=0",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
    assertEquals(typeof payload.error, "string");
    assertEquals(payload.error.includes("Invalid daysToKeep") || payload.error.includes("must be"), true);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleCleanupEvents returns 500 when Supabase config is missing", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = () => undefined;
  
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=90",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 500);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
      error: "Missing Supabase configuration",
    });
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test("cleanupOldEvents returns valid result structure", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase, 90, false);

  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.eventsDeleted, "number");
  assertEquals(typeof result.dryRun, "boolean");
  assertEquals(typeof result.timestamp, "string");
  assertEquals(result.dryRun, false);
  assertEquals(result.eventsDeleted >= 0, true);
});

Deno.test("cleanupOldEvents respects dryRun parameter", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase, 90, true);

  assertEquals(result.dryRun, true);
});

Deno.test("cleanupOldEvents uses default parameters", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase);

  assertEquals(result.dryRun, false);
  assertEquals(typeof result.eventsDeleted, "number");
});

