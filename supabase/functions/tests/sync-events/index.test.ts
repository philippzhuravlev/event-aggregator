import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import type { NormalizedEvent } from "@event-aggregator/shared/types.ts";
import {
  handleSyncEvents,
  resetSyncEventsDeps,
  setSyncEventsDeps,
  syncAllPageEvents,
} from "../../sync-events/index.ts";
import {
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "../../_shared/services/supabase-service.ts";

type EnvOverrides = Record<string, string | undefined>;

function withMockEnv(
  overrides: EnvOverrides,
  fn: () => Promise<void> | void,
) {
  const originalEnvGet = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key];
    }
    return originalEnvGet(key);
  };

  return Promise.resolve(fn()).finally(() => {
    Deno.env.get = originalEnvGet;
  });
}

function makeNormalizedEvent(pageId: number, suffix: string): NormalizedEvent {
  return {
    event_id: `${pageId}-${suffix}`,
    page_id: pageId,
    event_data: {
      id: `${pageId}-${suffix}`,
      name: `Event ${pageId}-${suffix}`,
      start_time: "2025-01-01T00:00:00.000Z",
    },
  };
}

const baseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SYNC_TOKEN: "sync-secret",
};

const basePage = {
  page_id: 123,
  page_name: "Test Page",
  token_status: "active",
  page_access_token_id: 1,
};

Deno.test("handleSyncEvents returns 405 for non-POST requests", async () => {
  await withMockEnv(baseEnv, async () => {
    const response = await handleSyncEvents(
      new Request("https://example.com/sync-events", { method: "GET" }),
    );
    assertEquals(response.status, 405);
    assertObjectMatch(await response.json(), {
      success: false,
      error: "Method not allowed",
    });
  });
});

Deno.test("handleSyncEvents handles OPTIONS for CORS", async () => {
  await withMockEnv(baseEnv, async () => {
    const response = await handleSyncEvents(
      new Request("https://example.com/sync-events", { method: "OPTIONS" }),
    );
    assertEquals(response.status, 204);
  });
});

Deno.test("handleSyncEvents returns 401 when authorization missing", async () => {
  await withMockEnv(baseEnv, async () => {
    const response = await handleSyncEvents(
      new Request("https://example.com/sync-events", { method: "POST" }),
    );
    assertEquals(response.status, 401);
    assertObjectMatch(await response.json(), {
      success: false,
      error: "Unauthorized",
    });
  });
});

Deno.test("handleSyncEvents returns 500 when SYNC_TOKEN missing", async () => {
  await withMockEnv(
    {
      SUPABASE_URL: baseEnv.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: baseEnv.SUPABASE_SERVICE_ROLE_KEY,
    },
    async () => {
      const response = await handleSyncEvents(
        new Request("https://example.com/sync-events", {
          method: "POST",
          headers: { authorization: "Bearer anything" },
        }),
      );
      assertEquals(response.status, 500);
      assertObjectMatch(await response.json(), {
        success: false,
        error: "Server configuration error",
      });
    },
  );
});

Deno.test("handleSyncEvents returns 500 when Supabase config missing", async () => {
  await withMockEnv(
    { SYNC_TOKEN: baseEnv.SYNC_TOKEN },
    async () => {
      const response = await handleSyncEvents(
        new Request("https://example.com/sync-events", {
          method: "POST",
          headers: { authorization: "Bearer sync-secret" },
        }),
      );
      assertEquals(response.status, 500);
    },
  );
});

Deno.test("handleSyncEvents returns success body when sync succeeds", async () => {
  await withMockEnv(baseEnv, async () => {
    resetSyncEventsDeps();
    setSyncEventsDeps({
      getActivePages: async () => [basePage] as any[],
      syncSinglePage: async () => ({
        events: [makeNormalizedEvent(basePage.page_id, "a")],
        pageId: String(basePage.page_id),
        error: null,
      }),
      batchWriteEvents: async () => 1,
    });

    setSupabaseClientFactory(() => ({}) as any);

    try {
      const response = await handleSyncEvents(
        new Request("https://example.com/sync-events", {
          method: "POST",
          headers: { authorization: "Bearer sync-secret" },
        }),
      );

      assertEquals(response.status, 200);
      const payload = await response.json();
      assertEquals(payload.success, true);
      assertEquals(payload.data.pagesProcessed, 1);
      assertEquals(payload.data.eventsAdded, 1);
    } finally {
      resetSyncEventsDeps();
      resetSupabaseClientFactory();
    }
  });
});

Deno.test("syncAllPageEvents aggregates multi-page results", async () => {
  resetSyncEventsDeps();
  const capturedEvents: NormalizedEvent[] = [];
  const pages = [
    basePage,
    { ...basePage, page_id: 456, page_name: "Second Page" },
  ];

  setSyncEventsDeps({
    getActivePages: async () => pages as any[],
    syncSinglePage: async (page) => ({
      events: [makeNormalizedEvent(Number(page.page_id), "evt")],
      pageId: String(page.page_id),
      error: page.page_id === 456 ? "failed" : null,
    }),
    batchWriteEvents: async (_supabase, events) => {
      capturedEvents.push(...events);
      return events.length;
    },
  });

  try {
    const result = await syncAllPageEvents({} as any);
    assertEquals(result.success, true);
    assertEquals(result.pagesProcessed, 2);
    assertEquals(result.eventsAdded, 2);
    assertEquals(result.errors.length, 1);
    assertEquals(capturedEvents.length, 2);
  } finally {
    resetSyncEventsDeps();
  }
});

Deno.test("syncAllPageEvents skips batch writes when no events", async () => {
  resetSyncEventsDeps();
  let batchWriteCalled = false;

  setSyncEventsDeps({
    getActivePages: async () => [basePage] as any[],
    syncSinglePage: async () => ({
      events: [],
      pageId: "123",
      error: null,
    }),
    batchWriteEvents: async () => {
      batchWriteCalled = true;
      return 0;
    },
  });

  try {
    const result = await syncAllPageEvents({} as any);
    assertEquals(result.success, true);
    assertEquals(result.eventsAdded, 0);
    assertEquals(batchWriteCalled, false);
  } finally {
    resetSyncEventsDeps();
  }
});

Deno.test("syncAllPageEvents returns early when no active pages", async () => {
  resetSyncEventsDeps();
  setSyncEventsDeps({
    getActivePages: async () => [],
  });

  try {
    const result = await syncAllPageEvents({} as any);
    assertEquals(result.pagesProcessed, 0);
    assertEquals(result.eventsAdded, 0);
    assertEquals(result.errors.length, 0);
  } finally {
    resetSyncEventsDeps();
  }
});
