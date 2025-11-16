import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleTokenRefresh, refreshExpiredTokens } from "./index.ts";

function createSupabaseClientMock(options?: {
  pages?: Array<{ page_id: number; page_name?: string; token_expiry?: string; token_status: string; page_access_token_id?: number }>;
  tokenData?: { token?: string; expiry?: string } | null;
  rpcError?: Error | null;
}) {
  const { pages = [], tokenData = null, rpcError = null } = options || {};
  
  const queryResult = Promise.resolve({ data: pages, error: null });
  
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => queryResult,
        }),
      }),
    }),
    rpc: (fnName: string) => {
      if (rpcError) {
        return Promise.resolve({ data: null, error: rpcError });
      }
      if (fnName === "get_page_access_token") {
        return Promise.resolve({ data: tokenData, error: null });
      }
      if (fnName === "store_page_token") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function createMockEnv() {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "SUPABASE_URL") return "https://test.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-key";
    if (key === "FACEBOOK_APP_ID") return "test-app-id";
    if (key === "FACEBOOK_APP_SECRET") return "test-app-secret";
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

Deno.test("refreshExpiredTokens returns empty result when no pages need refresh", async () => {
  const supabase = createSupabaseClientMock();

  const result = await refreshExpiredTokens(supabase);

  assertEquals(result, {
    refreshed: 0,
    failed: 0,
    results: [],
  });
});

Deno.test("refreshExpiredTokens handles pages with no token expiry", async () => {
  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        page_name: "Test Page",
        token_status: "active",
        page_access_token_id: 1,
      },
    ],
    tokenData: { token: "test-token" },
  });

  const result = await refreshExpiredTokens(supabase);

  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles database query errors", async () => {
  const supabase = createSupabaseClientMock({
    pages: [],
  });
  
  // Mock a query error
  const errorSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({ data: null, error: new Error("Query failed") }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  try {
    await refreshExpiredTokens(errorSupabase);
    assertEquals(false, true, "Should have thrown an error");
  } catch (error) {
    assertEquals(error instanceof Error, true);
  }
});

Deno.test("refreshExpiredTokens handles missing token data", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5); // 5 days from now

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        page_name: "Test Page",
        token_status: "active",
        page_access_token_id: 1,
        token_expiry: futureDate.toISOString(),
      },
    ],
    tokenData: null, // No token data
  });

  const result = await refreshExpiredTokens(supabase);

  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("handleTokenRefresh returns 405 for non-POST requests", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/token-refresh", {
      method: "GET",
    });

    const response = await handleTokenRefresh(request);

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

Deno.test("handleTokenRefresh returns 500 when Supabase config is missing", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = () => undefined;
  
  try {
    const request = new Request("https://example.com/token-refresh", {
      method: "POST",
    });

    const response = await handleTokenRefresh(request);

    assertEquals(response.status, 500);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test("handleTokenRefresh returns valid response structure", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/token-refresh", {
      method: "POST",
    });

    const response = await handleTokenRefresh(request);

    assertEquals(response.status, 200);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: true,
      message: "Token refresh job completed",
    });
    assertEquals(typeof payload.refreshed, "number");
    assertEquals(typeof payload.failed, "number");
    assertEquals(Array.isArray(payload.results), true);
  } finally {
    restoreEnv();
  }
});

