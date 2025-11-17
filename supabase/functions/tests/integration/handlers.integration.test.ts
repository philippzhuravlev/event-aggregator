import { assertEquals, assertExists } from "std/assert/mod.ts";
import { handleGetEvents } from "../../get-events/index.ts";
import { handleCleanupEvents } from "../../cleanup-events/index.ts";
import { handleHealthCheck } from "../../health-check/index.ts";
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

function createGetEventsSupabaseMock(rows: any[]) {
  const builder: any = {
    order: () => builder,
    limit: () => builder,
    eq: () => builder,
    gte: () => builder,
    or: () => builder,
    returns: () => Promise.resolve({ data: rows, error: null }),
  };

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
