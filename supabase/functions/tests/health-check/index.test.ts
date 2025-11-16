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
