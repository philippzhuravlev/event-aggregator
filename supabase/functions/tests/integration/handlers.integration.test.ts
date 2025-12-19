import { assertEquals, assertExists, assertRejects } from "std/assert/mod.ts";
import { handleGetEvents } from "../../get-events/index.ts";
import { handleCleanupEvents } from "../../cleanup-events/index.ts";
import { handleHealthCheck } from "../../health-check/index.ts";
import { handleSyncEvents } from "../../sync-events/index.ts";
import { handleTokenRefresh } from "../../token-refresh/index.ts";
import { handleWebhook } from "../../facebook-webhooks/index.ts";
import { WEBHOOK } from "../../../../packages/shared/src/runtime/deno.ts";
import {
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "../../_shared/services/supabase-service.ts";

function setEnvVars(vars: Record<string, string>) {
  const previousEntries = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(vars)) {
    previousEntries.set(key, Deno.env.get(key));
    Deno.env.set(key, value);
  }

  return () => {
    for (const [key, value] of previousEntries.entries()) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  };
}

type MockEventRow = Record<string, unknown>;

function createGetEventsSupabaseMock(rows: MockEventRow[]) {
  type MockBuilder = {
    order: () => MockBuilder;
    limit: () => MockBuilder;
    eq: () => MockBuilder;
    gte: () => MockBuilder;
    or: () => MockBuilder;
    returns: () => Promise<{ data: MockEventRow[]; error: null }>;
  };
  const builder = {} as MockBuilder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.eq = () => builder;
  builder.gte = () => builder;
  builder.or = () => builder;
  builder.returns = () => Promise.resolve({ data: rows, error: null });

  return {
    from: () => ({
      select: () => builder,
    }),
  };
}

function createCleanupSupabaseMock(eventsDeleted: number) {
  return {
    from: () => ({
      select: (_columns: string, options?: Record<string, unknown>) => {
        if (options?.head === true) {
          return {
            lt: () => Promise.resolve({ count: eventsDeleted, error: null }),
          };
        }

        return {
          lt: () => Promise.resolve({ data: [], error: null }),
        };
      },
      delete: () => ({
        lt: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

function createHealthSupabaseMock(
  pages: Array<{
    page_id: number;
    token_expiry: string;
    token_status: string;
  }>,
) {
  return {
    from: (table: string) => {
      if (table !== "pages") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: (columns?: string) => {
          if (columns === "id") {
            return {
              limit: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
            };
          }

          return {
            eq: () => Promise.resolve({ data: pages, error: null }),
          };
        },
      };
    },
  };
}

Deno.test("integration: handleGetEvents returns transformed rows", async () => {
  const futureStart = new Date(Date.now() + 86_400_000).toISOString();
  const mockRows = [{
    page_id: 42,
    event_id: "evt_1",
    event_data: {
      id: "evt_1",
      name: "Integration Event",
      start_time: futureStart,
      description: "Synthetic event",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const mockClient = createGetEventsSupabaseMock(mockRows);
  const restoreEnv = setEnvVars({
    SUPABASE_URL: "https://test.supabase.local",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });
  // deno-lint-ignore no-explicit-any
  setSupabaseClientFactory(() => mockClient as any);

  try {
    const request = new Request("https://example.com/get-events?limit=10", {
      method: "GET",
    });

    const response = await handleGetEvents(request);
    assertEquals(response.status, 200);
    const payload = await response.json();

    assertEquals(payload.success, true);
    assertExists(payload.data);
    assertEquals(Array.isArray(payload.data.events), true);
    assertEquals(payload.data.events[0].pageId, "42");
    assertEquals(payload.data.events[0].title, "Integration Event");
  } finally {
    resetSupabaseClientFactory();
    restoreEnv();
  }
});

Deno.test("integration: handleCleanupEvents honors dryRun parameter", async () => {
  const mockClient = createCleanupSupabaseMock(3);
  const restoreEnv = setEnvVars({
    SUPABASE_URL: "https://test.supabase.local",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });
  // deno-lint-ignore no-explicit-any
  setSupabaseClientFactory(() => mockClient as any);

  try {
    const request = new Request(
      "https://example.com/cleanup-events?daysToKeep=30&dryRun=true",
      { method: "POST" },
    );

    const response = await handleCleanupEvents(request);
    assertEquals(response.status, 200);

    const payload = await response.json();
    assertEquals(payload.success, true);
    assertEquals(payload.data.dryRun, true);
    assertEquals(payload.data.eventsDeleted, 3);
  } finally {
    resetSupabaseClientFactory();
    restoreEnv();
  }
});

Deno.test("integration: handleHealthCheck reports healthy status", async () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const mockClient = createHealthSupabaseMock([{
    page_id: 123,
    token_expiry: future,
    token_status: "active",
  }]);
  const restoreEnv = setEnvVars({
    SUPABASE_URL: "https://test.supabase.local",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  });
  // deno-lint-ignore no-explicit-any
  setSupabaseClientFactory(() => mockClient as any);

  try {
    const request = new Request("https://example.com/health-check", {
      method: "GET",
    });

    const response = await handleHealthCheck(request);
    assertEquals(response.status, 200);

    const payload = await response.json();
    assertEquals(payload.success, true);
    assertEquals(payload.data.overall.status, "healthy");
    assertEquals(payload.data.tokens.totalPages, 1);
  } finally {
    resetSupabaseClientFactory();
    restoreEnv();
  }
});

Deno.test("integration: handleSyncEvents returns 401 without auth", async () => {
  const restoreEnv = setEnvVars({
    SUPABASE_URL: "https://test.supabase.local",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SYNC_TOKEN: "expected-token",
  });

  try {
    const request = new Request("https://example.com/sync-events", {
      method: "POST",
    });

    const response = await handleSyncEvents(request);
    assertEquals(response.status, 401);
  } finally {
    restoreEnv();
  }
});

Deno.test("integration: handleSyncEvents returns 500 when Supabase config missing", async () => {
  const restoreEnv = setEnvVars({
    SYNC_TOKEN: "expected-token",
  });

  try {
    const request = new Request("https://example.com/sync-events", {
      method: "POST",
      headers: {
        authorization: "Bearer expected-token",
      },
    });

    const response = await handleSyncEvents(request);
    assertEquals(response.status, 500);
  } finally {
    restoreEnv();
  }
});

Deno.test("integration: handleTokenRefresh rejects non-POST methods", async () => {
  const request = new Request("https://example.com/token-refresh", {
    method: "GET",
  });

  const response = await handleTokenRefresh(request);
  assertEquals(response.status, 405);
});

Deno.test("integration: handleTokenRefresh returns 500 when config missing", async () => {
  const request = new Request("https://example.com/token-refresh", {
    method: "POST",
  });

  const response = await handleTokenRefresh(request);
  assertEquals(response.status, 500);
});

Deno.test("integration: handleFacebookWebhook rejects unsupported methods", async () => {
  const request = new Request("https://example.com/facebook-webhook", {
    method: "PUT",
  });

  const response = await handleWebhook(request);
  assertEquals(response.status, 405);
});

Deno.test("integration: handleFacebookWebhook POST rejects when config missing", async () => {
  const request = new Request("https://example.com/facebook-webhook", {
    method: "POST",
  });

  await assertRejects(
    () => handleWebhook(request),
    Error,
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
});

Deno.test("integration: handleFacebookWebhook GET returns challenge when token valid", async () => {
  const url =
    `https://example.com/facebook-webhook?hub.mode=subscribe&hub.challenge=abc123&${WEBHOOK.VERIFY_TOKEN_PARAM}=${WEBHOOK.VERIFY_TOKEN}`;
  const request = new Request(url, { method: "GET" });

  const response = await handleWebhook(request);
  assertEquals(response.status, 200);
  const payload = await response.json();
  assertEquals(payload.success, true);
  assertEquals(payload.data.challenge, "abc123");
});

Deno.test("integration: handleFacebookWebhook GET rejects invalid token", async () => {
  const url =
    `https://example.com/facebook-webhook?hub.mode=subscribe&hub.challenge=abc123&${WEBHOOK.VERIFY_TOKEN_PARAM}=wrong`;
  const request = new Request(url, { method: "GET" });

  const response = await handleWebhook(request);
  assertEquals(response.status, 403);
});
