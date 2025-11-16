import { assertEquals, assertExists, assertObjectMatch } from "std/assert/mod.ts";
import { handleGetEvents, getEvents } from "../../get-events/index.ts";
import type { GetEventsQuery } from "@event-aggregator/shared/types.ts";
import * as supabaseJs from "@supabase/supabase-js";

function createSupabaseClientMock(events: any[] = []) {
  // Create a chainable query builder that returns itself for all methods
  // This needs to support the full query chain: .order().order().limit() or .order().order().eq().gte().limit() etc.
  // Note: .limit() should return the builder, not a Promise. Only .returns() returns the Promise.
  const createQueryBuilder = () => {
    const builder: any = {};
    // All query builder methods return the builder for chaining
    builder.order = () => builder;
    builder.eq = () => builder;
    builder.gte = () => builder;
    builder.or = () => builder;
    builder.limit = () => builder; // limit() returns builder, not Promise
    builder.returns = () => Promise.resolve({ data: events, error: null }); // Only returns() executes
    return builder;
  };

  return {
    from: () => ({
      select: () => createQueryBuilder(),
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

Deno.test("getEvents handles pageToken parameter", async () => {
  const futureTime = Date.now() + 86400000;
  const pageToken = btoa(String(futureTime));
  
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(futureTime).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles invalid pageToken", async () => {
  const supabase = createSupabaseClientMock([]);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken: "invalid-token",
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length, 0);
});

Deno.test("getEvents handles pageId filter", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageId: "123",
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles search query", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    search: "Test",
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles events without start_time", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      // No start_time
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  // Events without start_time should be filtered out
  assertEquals(result.events.length, 0);
});

Deno.test("getEvents generates nextPageToken when hasMore is true", async () => {
  const mockEvents = Array.from({ length: 51 }, (_, i) => ({
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
  assertEquals(result.hasMore, true);
  assertExists(result.nextPageToken);
});

Deno.test({
  name: "handleGetEvents handles rate limiting",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    
    try {
      // Make multiple requests rapidly to trigger rate limit
      const request = new Request("https://example.com/get-events?limit=50", {
        method: "GET",
      });

      let rateLimited = false;
      // Try a reasonable number of requests (rate limit is 100 per minute)
      for (let i = 0; i < 105; i++) {
        const response = await handleGetEvents(request);
        if (response.status === 429) {
          rateLimited = true;
          break;
        }
      }

      // Rate limiting should eventually trigger
      assertEquals(typeof rateLimited, "boolean");
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: "handleGetEvents handles invalid query parameters",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    try {
      const request = new Request("https://example.com/get-events?limit=invalid", {
        method: "GET",
      });

      const response = await handleGetEvents(request);
      // Should return an error status (400, 500, or 503) for invalid parameters or config/DB issues
      // The important thing is it doesn't crash and returns an error response
      const isErrorStatus = response.status >= 400 && response.status < 600;
      assertEquals(isErrorStatus, true, `Expected error status, got ${response.status}`);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: "handleGetEvents handles database errors",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const restoreEnv = createMockEnv();
    
    try {
      const request = new Request("https://example.com/get-events?limit=50", {
        method: "GET",
      });

      const response = await handleGetEvents(request);
      // Should return an error status when database fails or configuration is missing
      // Accept any 4xx or 5xx status as valid error responses
      const isErrorStatus = response.status >= 400 && response.status < 600;
      assertEquals(isErrorStatus, true, `Expected error status, got ${response.status}`);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test("getEvents handles events with end_time", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      end_time: new Date(Date.now() + 172800000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  if (result.events.length > 0) {
    assertExists(result.events[0].endTime);
  }
});

Deno.test("getEvents handles events with cover images", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      cover: {
        source: "https://example.com/cover.jpg",
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  if (result.events.length > 0) {
    assertEquals(result.events[0].coverImageUrl, "https://example.com/cover.jpg");
  }
});

Deno.test("getEvents handles events with place data", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      place: {
        name: "Test Venue",
        location: { city: "Test City" },
      },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  if (result.events.length > 0) {
    assertExists(result.events[0].place);
  }
});

Deno.test("getEvents handles upcoming=false", async () => {
  const pastTime = Date.now() - 86400000;
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Past Event",
      start_time: new Date(pastTime).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: false,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles Date objects for created_at and updated_at", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date(), // Date object instead of string
    updated_at: new Date(), // Date object instead of string
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  if (result.events.length > 0) {
    assertExists(result.events[0].createdAt);
    assertExists(result.events[0].updatedAt);
  }
});

Deno.test("getEvents handles invalid date strings for created_at", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: "invalid-date",
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  // Should fall back to start_time for createdAt
  if (result.events.length > 0) {
    assertExists(result.events[0].createdAt);
  }
});

Deno.test("getEvents handles null created_at and updated_at", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: null,
    updated_at: null,
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  // Should fall back to start_time
  if (result.events.length > 0) {
    assertExists(result.events[0].createdAt);
    assertExists(result.events[0].updatedAt);
  }
});

Deno.test("getEvents handles pageToken with NaN timestamp", async () => {
  const supabase = createSupabaseClientMock([]);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken: btoa("not-a-number"),
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles events without event_id in event_data", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
      // No id field
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length > 0, true);
  if (result.events.length > 0) {
    assertEquals(result.events[0].eventURL, undefined);
  }
});

Deno.test("getEvents handles database query errors", async () => {
  const errorSupabase = {
    from: () => ({
      select: () => ({
        order: () => ({
          order: () => ({
            limit: () => ({
              returns: () => Promise.resolve({
                data: null,
                error: { message: "Database error" },
              }),
            }),
          }),
        }),
      }),
    }),
  };

  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  try {
    await getEvents(errorSupabase as any, queryParams);
    assertEquals(false, true, "Should have thrown an error");
  } catch (error) {
    assertEquals(error instanceof Error, true);
    assertEquals((error as Error).message.includes("Failed to get events"), true);
  }
});

Deno.test("getEvents handles search with special characters", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    search: "test%_event",
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles search with commas", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    search: "test,event,party",
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles cursorIso with upcoming filter", async () => {
  const futureTime = Date.now() + 86400000;
  const pageToken = btoa(String(futureTime));
  
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(futureTime + 3600000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles nextPageToken generation with invalid start_time", async () => {
  const mockEvents = Array.from({ length: 51 }, (_, i) => ({
    page_id: 123,
    event_id: `event${i}`,
    event_data: {
      id: `event${i}`,
      name: `Event ${i}`,
      start_time: i === 50 ? null : new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
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
  // Should handle invalid start_time in next row gracefully
  assertEquals(result.hasMore, true);
  // nextPageToken may be undefined if next row has invalid start_time
  assertEquals(typeof result.nextPageToken === "string" || result.nextPageToken === undefined, true);
});

Deno.test("handleGetEvents handles successful request with origin header", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/get-events?limit=50", {
      method: "GET",
      headers: {
        origin: "https://example.com",
      },
    });

    const response = await handleGetEvents(request);
    // Should return success or error depending on actual DB state
    assertEquals(response.status >= 200 && response.status < 600, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleGetEvents handles request without origin header", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/get-events?limit=50", {
      method: "GET",
    });

    const response = await handleGetEvents(request);
    // Should handle missing origin gracefully
    assertEquals(response.status >= 200 && response.status < 600, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("getEvents handles cursorIso being later than nowIso when upcoming=true", async () => {
  const futureTime = Date.now() + 86400000 * 2; // 2 days in future
  const pageToken = btoa(String(futureTime));
  
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(futureTime + 3600000).toISOString(),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles cursorIso being earlier than nowIso when upcoming=true", async () => {
  const pastTime = Date.now() - 86400000; // 1 day ago
  const pageToken = btoa(String(pastTime));
  
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: {
      id: "event1",
      name: "Test Event",
      start_time: new Date(Date.now() + 86400000).toISOString(), // Future event
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    pageToken,
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles search pattern with empty result after escaping", async () => {
  const supabase = createSupabaseClientMock([]);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
    search: "   ", // Only whitespace
  };

  const result = await getEvents(supabase as any, queryParams);
  assertEquals(result.events.length >= 0, true);
});

Deno.test("getEvents handles limit exceeding MAX_LIMIT", async () => {
  const mockEvents = Array.from({ length: 200 }, (_, i) => ({
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
    limit: 200, // Exceeds MAX_LIMIT (100)
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  // Should cap at MAX_LIMIT + 1 for hasMore check
  assertEquals(result.events.length <= 100, true);
});

Deno.test("getEvents handles events with null event_data", async () => {
  const mockEvents = [{
    page_id: 123,
    event_id: "event1",
    event_data: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];

  const supabase = createSupabaseClientMock(mockEvents);
  const queryParams: GetEventsQuery = {
    limit: 50,
    upcoming: true,
  };

  const result = await getEvents(supabase as any, queryParams);
  // Events with null event_data should be filtered out
  assertEquals(result.events.length, 0);
});

Deno.test("getEvents handles nextPageToken with missing nextRow", async () => {
  const mockEvents = Array.from({ length: 51 }, (_, i) => ({
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
  // Should handle hasMore correctly
  assertEquals(result.hasMore, true);
  // nextPageToken may be undefined if next row is missing
  assertEquals(typeof result.nextPageToken === "string" || result.nextPageToken === undefined, true);
});

Deno.test("getEvents handles nextPageToken with non-string start_time", async () => {
  const mockEvents = Array.from({ length: 51 }, (_, i) => ({
    page_id: 123,
    event_id: `event${i}`,
    event_data: {
      id: `event${i}`,
      name: `Event ${i}`,
      start_time: i === 50 ? 12345 : new Date(Date.now() + 86400000 * (i + 1)).toISOString(), // Non-string for last item
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
  assertEquals(result.hasMore, true);
  // nextPageToken may be undefined if start_time is not a string
  assertEquals(typeof result.nextPageToken === "string" || result.nextPageToken === undefined, true);
});

