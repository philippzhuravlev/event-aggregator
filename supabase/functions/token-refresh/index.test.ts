import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleTokenRefresh, refreshExpiredTokens } from "./index.ts";

function createSupabaseClientMock() {
  const queryResult = Promise.resolve({ data: [], error: null });
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => queryResult,
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
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

Deno.test("handleTokenRefresh returns 405 for non-POST requests", async () => {
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
});

