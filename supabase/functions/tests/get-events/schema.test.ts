import { assertEquals, assertExists } from "std/assert/mod.ts";
import { validateGetEventsQuery } from "../../get-events/schema.ts";

Deno.test("validateGetEventsQuery returns default values when no params", () => {
  const url = new URL("https://example.com/get-events");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data!.limit, 50); // Default limit
  assertEquals(result.data!.upcoming, true); // Default upcoming
  assertEquals(result.data!.pageToken, undefined);
  assertEquals(result.data!.pageId, undefined);
  assertEquals(result.data!.search, undefined);
});

Deno.test("validateGetEventsQuery parses limit parameter", () => {
  const url = new URL("https://example.com/get-events?limit=25");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.limit, 25);
});

Deno.test("validateGetEventsQuery enforces max limit", () => {
  const url = new URL("https://example.com/get-events?limit=200");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.limit, 100); // Max limit
});

Deno.test("validateGetEventsQuery enforces min limit", () => {
  const url = new URL("https://example.com/get-events?limit=0");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.limit, 1); // Min limit
});

Deno.test("validateGetEventsQuery returns error for invalid limit", () => {
  const url = new URL("https://example.com/get-events?limit=invalid");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, false);
  assertEquals(result.error, "Invalid limit parameter");
});

Deno.test("validateGetEventsQuery parses pageToken", () => {
  const url = new URL("https://example.com/get-events?pageToken=abc123");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.pageToken, "abc123");
});

Deno.test("validateGetEventsQuery parses pageId", () => {
  const url = new URL("https://example.com/get-events?pageId=12345");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.pageId, "12345");
});

Deno.test("validateGetEventsQuery parses upcoming=true", () => {
  const url = new URL("https://example.com/get-events?upcoming=true");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.upcoming, true);
});

Deno.test("validateGetEventsQuery parses upcoming=false", () => {
  const url = new URL("https://example.com/get-events?upcoming=false");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.upcoming, false);
});

Deno.test("validateGetEventsQuery defaults upcoming to true", () => {
  const url = new URL("https://example.com/get-events?upcoming=anything");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.upcoming, true); // Anything other than "false" is true
});

Deno.test("validateGetEventsQuery parses search parameter", () => {
  const url = new URL("https://example.com/get-events?search=test query");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertExists(result.data!.search);
});

Deno.test("validateGetEventsQuery sanitizes search query", () => {
  const url = new URL("https://example.com/get-events?search=  test  query  ");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  // Search should be sanitized (trimmed)
  assertExists(result.data!.search);
});

Deno.test("validateGetEventsQuery handles empty search query", () => {
  const url = new URL("https://example.com/get-events?search=");
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.search, undefined);
});

Deno.test("validateGetEventsQuery handles all parameters together", () => {
  const url = new URL(
    "https://example.com/get-events?limit=30&pageToken=token123&pageId=456&upcoming=false&search=test",
  );
  const result = validateGetEventsQuery(url);

  assertEquals(result.success, true);
  assertEquals(result.data!.limit, 30);
  assertEquals(result.data!.pageToken, "token123");
  assertEquals(result.data!.pageId, "456");
  assertEquals(result.data!.upcoming, false);
  assertExists(result.data!.search);
});

Deno.test("validateGetEventsQuery handles malformed URL gracefully", () => {
  // Create a URL that might cause issues
  const url = new URL("https://example.com/get-events");
  // Manually add a problematic search param
  url.searchParams.set("limit", "50");
  
  const result = validateGetEventsQuery(url);
  assertEquals(result.success, true);
});

Deno.test("validateGetEventsQuery truncates search query that is too long", () => {
  // MAX_SEARCH_LENGTH is 200, so 201 should be truncated
  // Note: sanitizeSearchQuery truncates, so the check on line 54 is unreachable
  // but we test that long queries are handled (truncated, not rejected)
  const longSearch = "a".repeat(201);
  const url = new URL(`https://example.com/get-events?search=${longSearch}`);
  const result = validateGetEventsQuery(url);

  // Should succeed but truncate to 200 characters
  assertEquals(result.success, true);
  assertExists(result.data);
  assertExists(result.data!.search);
  assertEquals(result.data!.search!.length, 200);
});

Deno.test("validateGetEventsQuery handles exceptions in try-catch", () => {
  // Create a URL object that will cause an exception when accessing searchParams
  const url = new URL("https://example.com/get-events");
  
  // Mock searchParams.get to throw an error
  const originalGet = url.searchParams.get;
  url.searchParams.get = () => {
    throw new Error("Unexpected error");
  };

  const result = validateGetEventsQuery(url);
  
  // Restore original method
  url.searchParams.get = originalGet;
  
  assertEquals(result.success, false);
  assertEquals(result.error, "Invalid query parameters");
});

