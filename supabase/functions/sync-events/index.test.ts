import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleSyncEvents, syncAllPageEvents } from "./index.ts";

function createSupabaseClientMock() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

function createMockEnv() {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "SUPABASE_URL") return "https://test.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-key";
    if (key === "SYNC_TOKEN") return "test-sync-token";
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

Deno.test("handleSyncEvents returns 405 for non-POST requests", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/sync-events", {
      method: "GET",
    });

    const response = await handleSyncEvents(request);

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

Deno.test("handleSyncEvents handles OPTIONS for CORS", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/sync-events", {
      method: "OPTIONS",
    });

    const response = await handleSyncEvents(request);

    assertEquals(response.status, 204);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleSyncEvents returns 401 for missing authorization", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/sync-events", {
      method: "POST",
    });

    const response = await handleSyncEvents(request);

    assertEquals(response.status, 401);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
      error: "Unauthorized",
    });
  } finally {
    restoreEnv();
  }
});

Deno.test("handleSyncEvents returns 500 when SYNC_TOKEN is missing", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "SUPABASE_URL") return "https://test.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-key";
    return undefined;
  };
  
  try {
    const request = new Request("https://example.com/sync-events", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });

    const response = await handleSyncEvents(request);

    assertEquals(response.status, 500);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
      error: "Server configuration error",
    });
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test("syncAllPageEvents returns valid structure with no pages", async () => {
  const supabase = createSupabaseClientMock();
  const result = await syncAllPageEvents(supabase);

  assertEquals(typeof result.success, "boolean");
  assertEquals(typeof result.pagesProcessed, "number");
  assertEquals(typeof result.eventsAdded, "number");
  assertEquals(typeof result.eventsUpdated, "number");
  assertEquals(Array.isArray(result.errors), true);
  assertEquals(typeof result.timestamp, "string");
  assertEquals(result.pagesProcessed, 0);
  assertEquals(result.eventsAdded, 0);
});

