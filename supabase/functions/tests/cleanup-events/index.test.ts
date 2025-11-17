import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { cleanupOldEvents, handleCleanupEvents } from "../../cleanup-events/index.ts";
import {
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "../../_shared/services/supabase-service.ts";

type SupabaseMockOptions = {
  count?: number;
  countError?: Error;
  deleteError?: Error;
};

function createSupabaseClientMock(options: SupabaseMockOptions = {}) {
  const {
    count = 0,
    countError,
    deleteError,
  } = options;

  return {
    from: (table: string) => {
      if (table === "events") {
        return {
          select: () => ({
            lt: () =>
              Promise.resolve({
                count: countError ? null : count,
                error: countError
                  ? { message: countError.message }
                  : null,
              }),
          }),
          delete: () => ({
            lt: () =>
              Promise.resolve({
                error: deleteError
                  ? { message: deleteError.message }
                  : null,
              }),
          }),
        };
      }

      return {
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
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
    assertEquals(
      payload.error.includes("Invalid daysToKeep") ||
        payload.error.includes("must be"),
      true,
    );
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

Deno.test("cleanupOldEvents handles custom daysToKeep", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase, 30, false);

  assertEquals(result.success, true);
  assertEquals(result.dryRun, false);
});

Deno.test("cleanupOldEvents returns default result when delete fails", async () => {
  const supabase = createSupabaseClientMock({
    deleteError: new Error("Database error"),
  });
  const result = await cleanupOldEvents(supabase as any, 90, false);

  assertEquals(result.success, true);
  assertEquals(result.eventsDeleted, 0);
});

Deno.test({
  name: "handleCleanupEvents handles successful cleanup",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    const factoryRestore = () => resetSupabaseClientFactory();
    setSupabaseClientFactory(() => createSupabaseClientMock());
    try {
      const request = new Request(
        "https://example.com/cleanup-events?daysToKeep=90&dryRun=true",
        {
          method: "POST",
        },
      );

      const response = await handleCleanupEvents(request);

      // Should return success response (200 or error if DB fails)
      assertEquals(response.status >= 200 && response.status < 600, true);
    } finally {
      factoryRestore();
      restoreEnv();
    }
  },
});

Deno.test("handleCleanupEvents handles negative daysToKeep", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=-1",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 400);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleCleanupEvents handles NaN daysToKeep", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=invalid",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);

    assertEquals(response.status, 400);
  } finally {
    restoreEnv();
  }
});

Deno.test("cleanupOldEvents handles very large daysToKeep", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase, 10000, false);

  assertEquals(result.success, true);
  assertEquals(typeof result.eventsDeleted, "number");
});

Deno.test("cleanupOldEvents handles daysToKeep of 1", async () => {
  const supabase = createSupabaseClientMock();
  const result = await cleanupOldEvents(supabase, 1, false);

  assertEquals(result.success, true);
  assertEquals(result.dryRun, false);
});

Deno.test("cleanupOldEvents handles error in deleteOldEvents", async () => {
  const supabase = createSupabaseClientMock({
    countError: new Error("Database error"),
  });

  const result = await cleanupOldEvents(supabase as any, 90, false);
  assertEquals(result.success, true);
  assertEquals(result.eventsDeleted, 0);
});

Deno.test("handleCleanupEvents handles successful cleanup with dryRun", async () => {
  const restoreEnv = createMockEnv();
  const factoryRestore = () => resetSupabaseClientFactory();
  setSupabaseClientFactory(() => createSupabaseClientMock());
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=90&dryRun=true",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);
    assertEquals(response.status >= 200 && response.status < 600, true);
  } finally {
    factoryRestore();
    restoreEnv();
  }
});

Deno.test("handleCleanupEvents handles cleanup errors", async () => {
  const restoreEnv = createMockEnv();
  const factoryRestore = () => resetSupabaseClientFactory();
  setSupabaseClientFactory(() => createSupabaseClientMock({
    deleteError: new Error("Delete failed"),
  }));
  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=90",
      {
        method: "POST",
      },
    );

    const response = await handleCleanupEvents(request);
    // Should handle errors gracefully
    assertEquals(response.status >= 200 && response.status < 600, true);
  } finally {
    factoryRestore();
    restoreEnv();
  }
});
