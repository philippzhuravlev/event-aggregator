import { assertEquals, assertExists, assertObjectMatch } from "std/assert/mod.ts";
import { handleGetEvents, getEvents } from "./index.ts";
import type { GetEventsQuery } from "@event-aggregator/shared/types.ts";

function createSupabaseClientMock(events: any[] = []) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => ({
            eq: () => ({
              gte: () => ({
                or: () => ({
                  limit: () => Promise.resolve({ data: events, error: null }),
                }),
                limit: () => Promise.resolve({ data: events, error: null }),
              }),
              limit: () => Promise.resolve({ data: events, error: null }),
            }),
            gte: () => ({
              or: () => ({
                limit: () => Promise.resolve({ data: events, error: null }),
              }),
              limit: () => Promise.resolve({ data: events, error: null }),
            }),
            or: () => ({
              limit: () => Promise.resolve({ data: events, error: null }),
            }),
            limit: () => Promise.resolve({ data: events, error: null }),
          }),
        }),
      }),
    }),
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

Deno.test("handleGetEvents returns 405 for non-GET requests", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/get-events", {
      method: "POST",
    });

    const response = await handleGetEvents(request);

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

Deno.test("handleGetEvents handles OPTIONS for CORS", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/get-events", {
      method: "OPTIONS",
      headers: { origin: "https://example.com" },
    });

    const response = await handleGetEvents(request);

    assertEquals(response.status, 204);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleGetEvents returns 500 when Supabase config is missing", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = () => undefined;
  
  try {
    const request = new Request("https://example.com/get-events", {
      method: "GET",
    });

    const response = await handleGetEvents(request);

    assertEquals(response.status, 500);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
  } finally {
    Deno.env.get = originalEnv;
  }
});

Deno.test("getEvents returns valid structure with empty results", async () => {
  const supabase = createSupabaseClientMock([]);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);

  assertExists(result.events);
  assertExists(result.hasMore);
  assertExists(result.totalReturned);
  assertEquals(Array.isArray(result.events), true);
  assertEquals(typeof result.hasMore, "boolean");
  assertEquals(typeof result.totalReturned, "number");
  assertEquals(result.events.length, 0);
  assertEquals(result.hasMore, false);
});

Deno.test("getEvents handles events with valid data", async () => {
  const mockEvents = [
    {
      page_id: 123,
      event_id: "event1",
      event_data: {
        id: "event1",
        name: "Test Event",
        start_time: new Date(Date.now() + 86400000).toISOString(),
        description: "Test description",
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);

  assertEquals(result.events.length > 0, true);
  assertEquals(result.totalReturned, result.events.length);
});

Deno.test("getEvents respects limit parameter", async () => {
  const mockEvents = Array.from({ length: 60 }, (_, i) => ({
    page_id: 123,
    event_id: `event${i}`,
    event_data: {
      id: `event${i}`,
      name: `Event ${i}`,
      start_time: new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);

  // Should return limit + 1 to check for hasMore
  assertEquals(result.events.length <= 50, true);
});

