import {
  assertEquals,
  assertExists,
} from "std/assert/mod.ts";
import {
  shouldProcessEventType,
  isWebhookRateLimited,
  normalizeWebhookChange,
  processWebhookChanges,
} from "../../facebook-webhooks/helpers.ts";

Deno.test("shouldProcessEventType returns true for processed event types", () => {
  assertEquals(shouldProcessEventType("event.create"), true);
  assertEquals(shouldProcessEventType("event.update"), true);
  assertEquals(shouldProcessEventType("event.delete"), true);
  assertEquals(shouldProcessEventType("post.create"), true);
  assertEquals(shouldProcessEventType("post.update"), true);
  assertEquals(shouldProcessEventType("post.delete"), true);
});

Deno.test("shouldProcessEventType returns false for unprocessed event types", () => {
  assertEquals(shouldProcessEventType("page.update"), false);
  assertEquals(shouldProcessEventType("unknown.event"), false);
  assertEquals(shouldProcessEventType(""), false);
});

Deno.test("isWebhookRateLimited returns false for first request", () => {
  const pageId = "test-page-123";
  const result = isWebhookRateLimited(pageId);
  assertEquals(result, false);
});

Deno.test("isWebhookRateLimited returns true for rapid requests", () => {
  const pageId = "test-page-456";
  // First request should not be rate limited
  assertEquals(isWebhookRateLimited(pageId), false);
  // Second request immediately after should be rate limited
  assertEquals(isWebhookRateLimited(pageId), true);
});

Deno.test("normalizeWebhookChange handles create action", () => {
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "add",
      id: "event123",
      published: Math.floor(Date.now() / 1000),
    },
  });

  assertEquals(result.pageId, "123");
  assertEquals(result.action, "created");
  assertEquals(result.eventType, "event.create");
  assertEquals(result.eventId, "event123");
  assertExists(result.timestamp);
});

Deno.test("normalizeWebhookChange handles update action", () => {
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "edit",
      id: "event456",
      published: Math.floor(Date.now() / 1000),
    },
  });

  assertEquals(result.pageId, "123");
  assertEquals(result.action, "updated");
  assertEquals(result.eventType, "event.update");
  assertEquals(result.eventId, "event456");
});

Deno.test("normalizeWebhookChange handles delete action", () => {
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "remove",
      id: "event789",
      published: Math.floor(Date.now() / 1000),
    },
  });

  assertEquals(result.pageId, "123");
  assertEquals(result.action, "deleted");
  assertEquals(result.eventType, "event.delete");
  assertEquals(result.eventId, "event789");
});

Deno.test("normalizeWebhookChange extracts event ID from nested objects", () => {
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "add",
      event: { id: "nested-event-123" },
      published: Math.floor(Date.now() / 1000),
    },
  });

  assertEquals(result.eventId, "nested-event-123");
});

Deno.test("normalizeWebhookChange uses default timestamp when missing", () => {
  const before = Math.floor(Date.now() / 1000) * 1000; // Convert to seconds then back to ms
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "add",
      id: "event123",
    },
  });
  const after = Math.floor(Date.now() / 1000) * 1000;

  // The timestamp should be within the range (allowing for small timing differences)
  assertEquals(result.timestamp >= before - 1000, true);
  assertEquals(result.timestamp <= after + 1000, true);
});

Deno.test("normalizeWebhookChange handles unknown verb", () => {
  const result = normalizeWebhookChange("123", {
    field: "events",
    value: {
      verb: "unknown",
      id: "event123",
    },
  });

  assertEquals(result.action, "unknown");
  assertEquals(result.eventType, "events");
});

Deno.test("processWebhookChanges processes deleted events", async () => {
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { decrypted_secret: "test-token" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const changes = [
    {
      field: "events",
      value: {
        verb: "remove",
        id: "event123",
      },
    },
  ];

  const result = await processWebhookChanges("123", changes, mockSupabase);
  assertEquals(result.processed, 1);
  assertEquals(result.failed, 0);
});

Deno.test("processWebhookChanges skips unprocessed event types", async () => {
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { decrypted_secret: "test-token" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  // Use a field/verb combination that results in an unprocessed event type
  // "page" field with "unknown" verb will result in eventType="page" which is not processed
  const changes = [
    {
      field: "page",
      value: {
        verb: "unknown", // This will result in eventType="page" which is not in processedTypes
        id: "page123",
      },
    },
  ];

  const result = await processWebhookChanges("123", changes, mockSupabase);
  assertEquals(result.processed, 0);
  assertEquals(result.failed, 0);
});

Deno.test("processWebhookChanges handles missing event ID", async () => {
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { decrypted_secret: "test-token" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const changes = [
    {
      field: "events",
      value: {
        verb: "add",
        // No id field
      },
    },
  ];

  const result = await processWebhookChanges("123", changes, mockSupabase);
  assertEquals(result.processed, 0);
  assertEquals(result.failed, 1);
});

Deno.test("processWebhookChanges handles delete errors", async () => {
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { decrypted_secret: "test-token" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              error: { message: "Delete failed" },
            }),
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const changes = [
    {
      field: "events",
      value: {
        verb: "remove",
        id: "event123",
      },
    },
  ];

  const result = await processWebhookChanges("123", changes, mockSupabase);
  assertEquals(result.processed, 0);
  assertEquals(result.failed, 1);
});

Deno.test("processWebhookChanges handles processing errors", async () => {
  const mockSupabase: any = {
    from: (table: string) => {
      if (table === "vault.decrypted_secrets") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: { decrypted_secret: "test-token" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        delete: () => {
          throw new Error("Database error");
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const changes = [
    {
      field: "events",
      value: {
        verb: "remove",
        id: "event123",
      },
    },
  ];

  const result = await processWebhookChanges("123", changes, mockSupabase);
  assertEquals(result.failed, 1);
});

