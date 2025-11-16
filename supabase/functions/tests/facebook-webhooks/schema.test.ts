import { assertEquals, assertExists } from "std/assert/mod.ts";
import {
  validateWebhookSubscription,
  validateWebhookPayload,
  extractPageIdFromEntry,
  hasEventChanges,
  extractEventChanges,
} from "../../facebook-webhooks/schema.ts";

Deno.test("validateWebhookSubscription returns error for missing mode", () => {
  const url = new URL("https://example.com/webhook");
  url.searchParams.set("hub.challenge", "test");
  url.searchParams.set("hub.verify_token", "token");

  const result = validateWebhookSubscription(url);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing required webhook validation parameters");
});

Deno.test("validateWebhookSubscription returns error for missing challenge", () => {
  const url = new URL("https://example.com/webhook");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", "token");

  const result = validateWebhookSubscription(url);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing required webhook validation parameters");
});

Deno.test("validateWebhookSubscription returns error for missing token", () => {
  const url = new URL("https://example.com/webhook");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.challenge", "test");

  const result = validateWebhookSubscription(url);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing required webhook validation parameters");
});

Deno.test("validateWebhookSubscription returns error for invalid mode", () => {
  const url = new URL("https://example.com/webhook");
  url.searchParams.set("hub.mode", "unsubscribe");
  url.searchParams.set("hub.challenge", "test");
  url.searchParams.set("hub.verify_token", "token");

  const result = validateWebhookSubscription(url);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid hub.mode");
});

Deno.test("validateWebhookSubscription returns valid for correct parameters", () => {
  const url = new URL("https://example.com/webhook");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.challenge", "challenge-123");
  url.searchParams.set("hub.verify_token", "token");

  const result = validateWebhookSubscription(url);

  assertEquals(result.valid, true);
  assertEquals(result.challenge, "challenge-123");
  assertEquals(result.error, undefined);
});

Deno.test("validateWebhookPayload returns error for null body", () => {
  const result = validateWebhookPayload(null);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid request body");
});

Deno.test("validateWebhookPayload returns error for non-object body", () => {
  const result = validateWebhookPayload("string");

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid request body");
});

Deno.test("validateWebhookPayload returns error for missing object field", () => {
  const result = validateWebhookPayload({ entry: [] });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing 'object' field");
});

Deno.test("validateWebhookPayload returns error for invalid object value", () => {
  const result = validateWebhookPayload({ object: "invalid", entry: [] });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid 'object' value - must be 'page' or 'user'");
});

Deno.test("validateWebhookPayload returns error for missing entry array", () => {
  const result = validateWebhookPayload({ object: "page" });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing or invalid 'entry' array");
});

Deno.test("validateWebhookPayload returns error for non-array entry", () => {
  const result = validateWebhookPayload({ object: "page", entry: "not-array" });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Missing or invalid 'entry' array");
});

Deno.test("validateWebhookPayload returns error for invalid entry object", () => {
  const result = validateWebhookPayload({
    object: "page",
    entry: [null],
  });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid entry in array");
});

Deno.test("validateWebhookPayload returns error for entry missing id", () => {
  const result = validateWebhookPayload({
    object: "page",
    entry: [{ time: 1234567890 }],
  });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Entry missing required 'id' field");
});

Deno.test("validateWebhookPayload returns error for entry id not string", () => {
  const result = validateWebhookPayload({
    object: "page",
    entry: [{ id: 123, time: 1234567890 }],
  });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Entry 'id' must be a string");
});

Deno.test("validateWebhookPayload returns error for entry time not number", () => {
  const result = validateWebhookPayload({
    object: "page",
    entry: [{ id: "123", time: "not-a-number" }],
  });

  assertEquals(result.valid, false);
  assertEquals(result.error, "Entry 'time' must be a number if present");
});

Deno.test("validateWebhookPayload accepts valid page payload", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "page-123",
        time: 1234567890,
      },
    ],
  };

  const result = validateWebhookPayload(payload);

  assertEquals(result.valid, true);
  assertExists(result.data);
  assertEquals(result.data!.object, "page");
  assertEquals(result.data!.entry.length, 1);
});

Deno.test("validateWebhookPayload accepts valid user payload", () => {
  const payload = {
    object: "user",
    entry: [
      {
        id: "user-123",
        time: 1234567890,
      },
    ],
  };

  const result = validateWebhookPayload(payload);

  assertEquals(result.valid, true);
  assertExists(result.data);
  assertEquals(result.data!.object, "user");
});

Deno.test("validateWebhookPayload accepts entry without time", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "page-123",
      },
    ],
  };

  const result = validateWebhookPayload(payload);

  assertEquals(result.valid, true);
  assertExists(result.data);
});

Deno.test("validateWebhookPayload handles multiple entries", () => {
  const payload = {
    object: "page",
    entry: [
      { id: "page-1", time: 1234567890 },
      { id: "page-2", time: 1234567891 },
    ],
  };

  const result = validateWebhookPayload(payload);

  assertEquals(result.valid, true);
  assertExists(result.data);
  assertEquals(result.data!.entry.length, 2);
});

Deno.test("validateWebhookPayload handles validation errors gracefully", () => {
  // Create a payload that will throw an error during validation
  const payload = {
    object: "page",
    entry: [
      {
        get id() {
          throw new Error("Test error");
        },
      },
    ],
  };

  const result = validateWebhookPayload(payload);

  assertEquals(result.valid, false);
  assertEquals(result.error, "Test error");
});

Deno.test("extractPageIdFromEntry extracts page ID", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
  };

  const pageId = extractPageIdFromEntry(entry);

  assertEquals(pageId, "page-123");
});

Deno.test("hasEventChanges returns false for no changes", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
  };

  const result = hasEventChanges(entry);

  assertEquals(result, false);
});

Deno.test("hasEventChanges returns false for empty changes array", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: [],
  };

  const result = hasEventChanges(entry);

  assertEquals(result, false);
});

Deno.test("hasEventChanges returns true for non-empty changes array", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: [
      {
        field: "events",
        value: { id: "event-123" },
      },
    ],
  };

  const result = hasEventChanges(entry);

  assertEquals(result, true);
});

Deno.test("hasEventChanges returns false for non-array changes", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: "not-an-array",
  };

  const result = hasEventChanges(entry);

  assertEquals(result, false);
});

Deno.test("extractEventChanges returns empty array for no changes", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
  };

  const result = extractEventChanges(entry);

  assertEquals(result, []);
});

Deno.test("extractEventChanges returns empty array for non-array changes", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: "not-an-array",
  };

  const result = extractEventChanges(entry);

  assertEquals(result, []);
});

Deno.test("extractEventChanges filters for events field only", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: [
      {
        field: "events",
        value: { id: "event-123" },
      },
      {
        field: "feed",
        value: { id: "post-123" },
      },
    ],
  };

  const result = extractEventChanges(entry);

  assertEquals(result.length, 1);
  assertEquals(result[0].field, "events");
});

Deno.test("extractEventChanges handles null value", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: [
      {
        field: "events",
        value: null,
      },
    ],
  };

  const result = extractEventChanges(entry);

  assertEquals(result.length, 1);
  assertEquals(result[0].field, "events");
  assertEquals(result[0].value, {});
});

Deno.test("extractEventChanges extracts multiple event changes", () => {
  const entry = {
    id: "page-123",
    time: 1234567890,
    changes: [
      {
        field: "events",
        value: { id: "event-1" },
      },
      {
        field: "events",
        value: { id: "event-2" },
      },
    ],
  };

  const result = extractEventChanges(entry);

  assertEquals(result.length, 2);
  assertEquals(result[0].value.id, "event-1");
  assertEquals(result[1].value.id, "event-2");
});

