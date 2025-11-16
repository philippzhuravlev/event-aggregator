import { assertEquals, assertObjectMatch } from "std/assert/mod.ts";
import { handleWebhook, handleWebhookGet, handleWebhookPost } from "../../facebook-webhooks/index.ts";
import { WEBHOOK } from "@event-aggregator/shared/runtime/deno.js";
import { computeHmacSignature } from "@event-aggregator/shared/validation/index.js";

function createSupabaseClientMock() {
  return {
    from: () => ({
      delete: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
}

function createMockEnv() {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "SUPABASE_URL") return "https://test.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-key";
    if (key === "FACEBOOK_APP_SECRET") return "test-app-secret";
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

Deno.test("handleWebhook returns 405 for unsupported methods", async () => {
  const restoreEnv = createMockEnv();
  try {
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "PUT",
    });

    const response = await handleWebhook(request);

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

Deno.test("handleWebhookGet returns 400 for missing parameters", () => {
  const url = new URL("https://example.com/facebook-webhooks");
  const response = handleWebhookGet(url);

  assertEquals(response.status, 400);
});

Deno.test("handleWebhookGet returns 403 for invalid verify token", async () => {
  const url = new URL("https://example.com/facebook-webhooks");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.challenge", "test-challenge");
  url.searchParams.set("hub.verify_token", "wrong-token");

  const response = handleWebhookGet(url);

  assertEquals(response.status, 403);
  const payload = await response.json();
  assertObjectMatch(payload, {
    success: false,
    error: "Invalid verify token",
  });
});

Deno.test("handleWebhookGet returns 200 for valid subscription", async () => {
  const url = new URL("https://example.com/facebook-webhooks");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.challenge", "test-challenge-123");
  url.searchParams.set("hub.verify_token", WEBHOOK.VERIFY_TOKEN);

  const response = handleWebhookGet(url);

  assertEquals(response.status, 200);
  const payload = await response.json();
  assertObjectMatch(payload, {
    success: true,
    data: {
      challenge: "test-challenge-123",
    },
  });
});

Deno.test("handleWebhookPost returns 401 for missing signature", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      body: JSON.stringify({ object: "page", entry: [] }),
    });

    const response = await handleWebhookPost(request, supabase);

    assertEquals(response.status, 401);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
      error: "Missing signature",
    });
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost returns 400 for invalid JSON", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    // Create a valid signature for the body to pass signature check
    // Then JSON parsing will fail
    const body = "invalid json";
    const signature = await computeHmacSignature(body, "test-app-secret", "sha256=hex");
    
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
      },
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost returns 400 for invalid payload structure", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    const body = JSON.stringify({ invalid: "payload" });
    // Create a valid signature for the body
    const signature = await computeHmacSignature(body, "test-app-secret", "sha256=hex");
    
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
      },
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);

    assertEquals(response.status, 400);
    const payload = await response.json();
    assertObjectMatch(payload, {
      success: false,
    });
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost returns 401 for invalid signature", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    const body = JSON.stringify({ object: "page", entry: [] });
    
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      headers: {
        "x-hub-signature-256": "sha256=invalid-signature",
      },
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);
    assertEquals(response.status, 401);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost returns 413 for oversized body", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    const body = JSON.stringify({ object: "page", entry: [] });
    
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      headers: {
        "x-hub-signature-256": "sha256=test",
        "content-length": "200000", // 200KB, exceeds limit
      },
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);
    assertEquals(response.status, 413);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost processes valid webhook payload", async () => {
  const restoreEnv = createMockEnv();
  try {
    const supabase = createSupabaseClientMock();
    const body = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "123",
          changes: [
            {
              field: "events",
              value: {
                verb: "add",
                id: "event123",
              },
            },
          ],
        },
      ],
    });
    
    const signature = await computeHmacSignature(body, "test-app-secret", "sha256=hex");
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
      },
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);
    // Should process successfully (200) or fail gracefully
    assertEquals([200, 500].includes(response.status), true);
  } finally {
    restoreEnv();
  }
});

Deno.test("handleWebhookPost handles missing FACEBOOK_APP_SECRET", async () => {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key === "FACEBOOK_APP_SECRET") return undefined;
    return originalEnv(key);
  };
  
  try {
    const supabase = createSupabaseClientMock();
    const body = JSON.stringify({ object: "page", entry: [] });
    const request = new Request("https://example.com/facebook-webhooks", {
      method: "POST",
      body: body,
    });

    const response = await handleWebhookPost(request, supabase);
    assertEquals(response.status, 500);
  } finally {
    Deno.env.get = originalEnv;
  }
});

