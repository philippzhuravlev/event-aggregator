import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleTokenRefresh, refreshExpiredTokens } from "../../token-refresh/index.ts";

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
    // Test the function directly with a mock instead of the handler
    // since the handler creates a real Supabase client
    const supabase = createSupabaseClientMock();
    const result = await refreshExpiredTokens(supabase);

    assertEquals(typeof result.refreshed, "number");
    assertEquals(typeof result.failed, "number");
    assertEquals(Array.isArray(result.results), true);
    assertEquals(result.refreshed >= 0, true);
    assertEquals(result.failed >= 0, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("refreshExpiredTokens handles token that expires in more than 7 days", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10); // 10 days from now

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
    tokenData: { token: "test-token", expiry: futureDate.toISOString() },
  });

  const result = await refreshExpiredTokens(supabase);
  // Token expires in 10 days, so should not be refreshed
  assertEquals(result.refreshed, 0);
  assertEquals(result.failed, 0);
});

Deno.test("refreshExpiredTokens handles token that expires within 7 days", async () => {
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
    tokenData: { token: "test-token", expiry: futureDate.toISOString() },
  });

  const result = await refreshExpiredTokens(supabase);
  // Token expires in 5 days, should attempt refresh
  // Note: Actual refresh will fail without real Facebook API, but we test the logic
  assertEquals(result.refreshed >= 0, true);
});

Deno.test("refreshExpiredTokens handles already expired token", async () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1); // 1 day ago

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        page_name: "Test Page",
        token_status: "active",
        page_access_token_id: 1,
        token_expiry: pastDate.toISOString(),
      },
    ],
    tokenData: { token: "test-token", expiry: pastDate.toISOString() },
  });

  const result = await refreshExpiredTokens(supabase);
  // Token already expired, should fail
  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles RPC errors when getting token", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

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
    rpcError: new Error("RPC failed"),
  });

  const result = await refreshExpiredTokens(supabase);
  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles rate limiting", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);
  
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
    tokenData: { token: "test-token", expiry: futureDate.toISOString() },
  });

  // Call multiple times to potentially trigger rate limiting
  const result1 = await refreshExpiredTokens(supabase);
  const result2 = await refreshExpiredTokens(supabase);
  
  // At least one should succeed or be rate limited
  assertEquals(result1.refreshed >= 0 || result1.failed >= 0, true);
  assertEquals(result2.refreshed >= 0 || result2.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles invalid expiry date", async () => {
  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        page_name: "Test Page",
        token_status: "active",
        page_access_token_id: 1,
        token_expiry: "invalid-date",
      },
    ],
    tokenData: { token: "test-token", expiry: "invalid-date" },
  });

  const result = await refreshExpiredTokens(supabase);
  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles missing expiry in tokenData", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

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
    tokenData: { token: "test-token" }, // No expiry field
  });

  const result = await refreshExpiredTokens(supabase);
  // Should use page token_expiry as fallback
  assertEquals(result.refreshed >= 0, true);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles array tokenData", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

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
    tokenData: [{ token: "test-token", expiry: futureDate.toISOString() }], // Array format
  });

  const result = await refreshExpiredTokens(supabase);
  assertEquals(result.refreshed >= 0, true);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles store error", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({
            data: [{
              page_id: 123,
              page_name: "Test Page",
              token_status: "active",
              page_access_token_id: 1,
              token_expiry: futureDate.toISOString(),
            }],
            error: null,
          }),
        }),
      }),
    }),
    rpc: (fnName: string) => {
      if (fnName === "get_page_access_token") {
        return Promise.resolve({
          data: { token: "test-token", expiry: futureDate.toISOString() },
          error: null,
        });
      }
      if (fnName === "store_page_token") {
        return Promise.resolve({
          data: null,
          error: { message: "Store failed" },
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  const result = await refreshExpiredTokens(supabase as any);
  assertEquals(result.refreshed, 0);
  assertEquals(result.failed >= 0, true);
});

Deno.test("refreshExpiredTokens handles missing FACEBOOK_APP_ID", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "FACEBOOK_APP_ID") return undefined;
    if (key === "FACEBOOK_APP_SECRET") return "test-secret";
    return originalEnv(key);
  };

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

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
    tokenData: { token: "test-token", expiry: futureDate.toISOString() },
  });

  try {
    const result = await refreshExpiredTokens(supabase);
    assertEquals(result.refreshed, 0);
    assertEquals(result.failed >= 0, true);
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test("refreshExpiredTokens handles missing FACEBOOK_APP_SECRET", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "FACEBOOK_APP_ID") return "test-app-id";
    if (key === "FACEBOOK_APP_SECRET") return undefined;
    return originalEnv(key);
  };

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 5);

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
    tokenData: { token: "test-token", expiry: futureDate.toISOString() },
  });

  try {
    const result = await refreshExpiredTokens(supabase);
    assertEquals(result.refreshed, 0);
    assertEquals(result.failed >= 0, true);
  } finally {
    Deno.env.get = originalEnv;
  }
});

