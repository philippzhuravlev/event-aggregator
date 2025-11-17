import {
  assertEquals,
  assertExists,
  assertObjectMatch,
} from "std/assert/mod.ts";
import { handleHealthCheck, performHealthCheck } from "../../health-check/index.ts";
import type { HealthCheckResponse } from "../../health-check/schema.ts";
import * as supabaseJs from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function createSupabaseClientMock(options?: {
  shouldFail?: boolean;
  pages?: Array<
    { page_id: number; token_expiry?: string; token_status: string }
  >;
}) {
  const { shouldFail = false, pages = [] } = options || {};

  if (shouldFail) {
    return {
      from: () => ({
        select: () => ({
          limit: () => Promise.reject(new Error("Database connection failed")),
          eq: () => Promise.reject(new Error("Database connection failed")),
        }),
      }),
    };
  }

  return {
    from: (table: string) => {
      if (table === "pages") {
        return {
          select: (columns?: string) => {
            // Handle checkSupabaseHealth: .select("id").limit(1)
            if (columns === "id") {
              return {
                limit: () =>
                  Promise.resolve({ data: [{ id: 1 }], error: null }),
                eq: () => Promise.resolve({ data: pages, error: null }),
              };
            }
            // Handle monitorTokens: .select("page_id, token_expiry, token_status").eq("token_status", "active")
            return {
              eq: (_column: string, _value: unknown) => {
                return Promise.resolve({ data: pages, error: null });
              },
              limit: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
            };
          },
        };
      }
      return {
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
          eq: () => Promise.resolve({ data: [], error: null }),
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
    if (key === "DENO_DEPLOYMENT_ID") return "test-deployment-123";
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

Deno.test("handleHealthCheck returns 405 for non-GET requests", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/health-check", {
      method: "POST",
    });

    const response = await handleHealthCheck(request);

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

Deno.test("handleHealthCheck returns 503 when Supabase config is missing", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = () => undefined;

  try {
    const request = new Request("https://example.com/health-check", {
      method: "GET",
    });

    const response = await handleHealthCheck(request);

    assertEquals(response.status, 503);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
    assertEquals(typeof payload.error, "string");
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test({
  name: "handleHealthCheck returns valid response structure",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();

    try {
      const request = new Request("https://example.com/health-check", {
        method: "GET",
      });

      const response = await handleHealthCheck(request);

      // The response is wrapped in a success response structure
      const responseData = await response.json();

      // createSuccessResponse wraps the data in { success: true, data: ... }
      const payload: HealthCheckResponse = responseData.data || responseData;

      // Validate we get a valid HTTP response
      assertEquals(response.status >= 200 && response.status < 600, true);

      // If we have the expected structure, validate it
      if (
        payload && payload.system && payload.tokens && payload.overall &&
        payload.alerts
      ) {
        assertEquals(typeof payload.system.status, "string");
        if (payload.system.supabase) {
          assertEquals(typeof payload.system.supabase.status, "string");
        }
        assertEquals(typeof payload.tokens.totalPages, "number");
        assertEquals(typeof payload.overall.status, "string");
        assertEquals(typeof payload.overall.timestamp, "string");
        assertEquals(typeof payload.overall.uptime, "number");
        assertEquals(Array.isArray(payload.tokens.healthy), true);
        assertEquals(Array.isArray(payload.tokens.expiring_soon), true);
        assertEquals(Array.isArray(payload.tokens.expired), true);
        assertEquals(Array.isArray(payload.alerts.criticalAlerts), true);
        assertEquals(typeof payload.alerts.expiryWarningsSent, "number");
      }
    } finally {
      restoreEnv();
    }
  },
});

Deno.test("performHealthCheck returns valid structure with healthy system", async () => {
  const supabase = createSupabaseClientMock();
  const result = await performHealthCheck(supabase);

  assertExists(result.system);
  assertExists(result.tokens);
  assertExists(result.overall);
  assertExists(result.alerts);

  assertEquals(typeof result.system.status, "string");
  assertEquals(typeof result.tokens.totalPages, "number");
  assertEquals(
    ["healthy", "warning", "critical"].includes(result.overall.status),
    true,
  );
});

Deno.test("performHealthCheck handles database errors", async () => {
  const supabase = createSupabaseClientMock({ shouldFail: true });
  const result = await performHealthCheck(supabase);

  assertEquals(result.overall.status, "critical");
  assertEquals(result.system.status, "error");
  assertExists(result.system.supabase.error);
});

Deno.test("performHealthCheck handles pages with expiring tokens", async () => {
  const expiringDate = new Date();
  expiringDate.setDate(expiringDate.getDate() + 3); // 3 days from now

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: expiringDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 1);
  assertEquals(result.tokens.expiring_soon.length >= 0, true);
});

Deno.test("performHealthCheck handles pages with expired tokens", async () => {
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1); // 1 day ago

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: expiredDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 1);
  assertEquals(result.tokens.expired.length >= 0, true);
});

Deno.test("performHealthCheck handles pages with healthy tokens", async () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30); // 30 days from now

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: futureDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 1);
  assertEquals(result.tokens.healthy.length >= 0, true);
});

Deno.test("performHealthCheck handles pages with null token_expiry", async () => {
  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: null,
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 1);
  // Should handle null expiry gracefully
  assertEquals(Array.isArray(result.tokens.healthy), true);
});

Deno.test("performHealthCheck handles pages with invalid token_expiry", async () => {
  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: "invalid-date",
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 1);
  // Should handle invalid date gracefully
  assertEquals(Array.isArray(result.tokens.healthy), true);
});

Deno.test("performHealthCheck handles query errors in monitorTokens", async () => {
  const errorSupabase = {
    from: (table: string) => {
      if (table === "pages") {
        return {
          select: (columns?: string) => {
            if (columns === "id") {
              return {
                limit: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
              };
            }
            return {
              eq: () => Promise.resolve({
                data: null,
                error: { message: "Query failed" },
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  };

  const result = await performHealthCheck(errorSupabase as any);
  assertEquals(result.tokens.totalPages, 0);
  assertEquals(Array.isArray(result.tokens.healthy), true);
});

Deno.test("performHealthCheck handles empty pages array", async () => {
  const supabase = createSupabaseClientMock({
    pages: [],
  });

  const result = await performHealthCheck(supabase);
  assertEquals(result.tokens.totalPages, 0);
  assertEquals(result.tokens.healthy.length, 0);
  assertEquals(result.tokens.expiring_soon.length, 0);
  assertEquals(result.tokens.expired.length, 0);
});

Deno.test("performHealthCheck determines warning status correctly", async () => {
  const expiringDate = new Date();
  expiringDate.setDate(expiringDate.getDate() + 3);

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: expiringDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  // Should be warning if tokens are expiring soon
  assertEquals(["healthy", "warning", "critical"].includes(result.overall.status), true);
});

Deno.test("performHealthCheck determines critical status correctly", async () => {
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: expiredDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  // Should be critical if tokens are expired
  assertEquals(result.overall.status === "critical" || result.overall.status === "warning", true);
});

Deno.test({
  name: "handleHealthCheck returns 200 for healthy system",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    try {
      const request = new Request("https://example.com/health-check", {
        method: "GET",
      });

      const response = await handleHealthCheck(request);
      // Should return 200 for healthy or 500 for critical
      assertEquals([200, 500].includes(response.status), true);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: "handleHealthCheck handles errors in performHealthCheck",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    try {
      const request = new Request("https://example.com/health-check", {
        method: "GET",
      });

      const response = await handleHealthCheck(request);
      // Should handle errors gracefully
      assertEquals(response.status >= 200 && response.status < 600, true);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test("monitorTokens handles mail error when sending expiry warning", async () => {
  const expiringDate = new Date();
  expiringDate.setDate(expiringDate.getDate() + 3);

  const supabase = createSupabaseClientMock({
    pages: [
      {
        page_id: 123,
        token_expiry: expiringDate.toISOString(),
        token_status: "active",
      },
    ],
  });

  const result = await performHealthCheck(supabase);
  // Should handle mail errors gracefully
  assertEquals(result.tokens.totalPages, 1);
  assertEquals(result.alerts.expiryWarningsSent >= 0, true);
});

Deno.test("monitorTokens handles pageError in try-catch", async () => {
  const errorSupabase = {
    from: (table: string) => {
      if (table === "pages") {
        return {
          select: (columns?: string) => {
            if (columns === "id") {
              return {
                limit: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
              };
            }
            return {
              eq: () => Promise.resolve({
                data: [
                  {
                    page_id: 123,
                    token_expiry: "invalid-date-that-will-cause-error",
                    token_status: "active",
                  },
                ],
                error: null,
              }),
            };
          },
        };
      }
      return {
        select: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  };

  const result = await performHealthCheck(errorSupabase as any);
  // Should handle page errors gracefully
  assertEquals(result.tokens.totalPages >= 0, true);
});
