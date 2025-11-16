import {
  assertEquals,
  assertExists,
  assertObjectMatch,
} from "std/assert/mod.ts";
import {
  createMailTransporter,
  sendEmail,
  sendAlertEmail,
  sendTokenRefreshFailedAlert,
  sendTokenExpiryWarning,
  sendEventSyncFailedAlert,
} from "../../../_shared/services/mail-service.ts";

function createMockEnv(env: Record<string, string | undefined> = {}) {
  const originalEnv = Deno.env.get;
  Deno.env.get = (key: string) => {
    if (key in env) {
      return env[key];
    }
    return originalEnv(key);
  };
  return () => {
    Deno.env.get = originalEnv;
  };
}

// Mock fetch globally
let mockFetchResponse: Response | null = null;
let mockFetchCalls: Request[] = [];

function setupMockFetch(response: Response) {
  mockFetchResponse = response;
  mockFetchCalls = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    mockFetchCalls.push(request);
    return mockFetchResponse!;
  };
}

function restoreFetch() {
  // @ts-ignore - restore original fetch
  delete globalThis.fetch;
  mockFetchResponse = null;
  mockFetchCalls = [];
}

Deno.test("createMailTransporter returns false when RESEND_API_KEY is missing", () => {
  const restoreEnv = createMockEnv({ RESEND_API_KEY: undefined });
  try {
    const result = createMailTransporter();
    assertEquals(result, false);
  } finally {
    restoreEnv();
  }
});

Deno.test("createMailTransporter returns false when RESEND_API_KEY has invalid format", () => {
  const restoreEnv = createMockEnv({ RESEND_API_KEY: "invalid-key" });
  try {
    const result = createMailTransporter();
    assertEquals(result, false);
  } finally {
    restoreEnv();
  }
});

Deno.test("createMailTransporter returns true when RESEND_API_KEY is valid", () => {
  const restoreEnv = createMockEnv({ RESEND_API_KEY: "re_valid_key_123" });
  try {
    const result = createMailTransporter();
    assertEquals(result, true);
  } finally {
    restoreEnv();
  }
});

Deno.test("sendEmail returns error when RESEND_API_KEY is missing", async () => {
  const restoreEnv = createMockEnv({ RESEND_API_KEY: undefined });
  try {
    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error, "Email service not configured");
  } finally {
    restoreEnv();
  }
});

Deno.test("sendEmail returns error when MAIL_FROM is missing", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: undefined,
  });
  try {
    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error, "Sender email not configured");
  } finally {
    restoreEnv();
  }
});

Deno.test("sendEmail sends email successfully", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test Subject",
      html: "<p>Test HTML</p>",
      text: "Test Text",
    });

    assertEquals(result.success, true);
    assertEquals(mockFetchCalls.length, 1);
    const request = mockFetchCalls[0];
    assertEquals(request.url, "https://api.resend.com/emails");
    assertEquals(request.method, "POST");

    const body = await request.json();
    assertObjectMatch(body, {
      from: "noreply@example.com",
      to: "test@example.com",
      subject: "Test Subject",
      html: "<p>Test HTML</p>",
      text: "Test Text",
    });

    const authHeader = request.headers.get("Authorization");
    assertEquals(authHeader, "Bearer re_valid_key");
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendEmail handles API error response", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
  });
  try {
    setupMockFetch(
      new Response("API Error", { status: 400 }),
    );

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error, "Email send failed: 400");
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendEmail handles network errors", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
  });
  try {
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };

    const result = await sendEmail({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });

    assertEquals(result.success, false);
    assertExists(result.error);
    assertEquals(result.error, "Network error");
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendAlertEmail formats and sends alert email", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    const result = await sendAlertEmail({
      to: "admin@example.com",
      subject: "Test Alert",
      alertType: "token_refresh_failed",
      text: "Test alert message",
      details: { pageId: "123", error: "Token expired" },
    });

    assertEquals(result.success, true);
    assertEquals(mockFetchCalls.length, 1);
    const request = mockFetchCalls[0];
    const body = await request.json();
    assertEquals(body.to, "admin@example.com");
    assertEquals(body.subject, "Test Alert");
    assertExists(body.html);
    // Check that HTML contains alert type label
    assertEquals(body.html.includes("Token Refresh Failed"), true);
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendTokenRefreshFailedAlert sends alert with correct format", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
    ALERT_EMAIL_TO: "alerts@example.com",
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    const result = await sendTokenRefreshFailedAlert("123", "Token expired");

    assertEquals(result.success, true);
    assertEquals(mockFetchCalls.length, 1);
    const request = mockFetchCalls[0];
    const body = await request.json();
    assertEquals(body.to, "alerts@example.com");
    assertEquals(body.subject, "Token Refresh Failed - Page 123");
    assertExists(body.html);
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendTokenRefreshFailedAlert uses default email when ALERT_EMAIL_TO is not set", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
    ALERT_EMAIL_TO: undefined,
    ADMIN_EMAIL: undefined,
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    const result = await sendTokenRefreshFailedAlert("123", "Token expired");

    assertEquals(result.success, true);
    const request = mockFetchCalls[0];
    const body = await request.json();
    assertEquals(body.to, "admin@eventagg.dev");
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendTokenExpiryWarning sends warning with correct format", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
    ALERT_EMAIL_TO: "alerts@example.com",
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    // 3 days = 3 * 24 * 60 * 60 seconds
    const expiresIn = 3 * 24 * 60 * 60;
    const result = await sendTokenExpiryWarning("123", expiresIn);

    assertEquals(result.success, true);
    assertEquals(mockFetchCalls.length, 1);
    const request = mockFetchCalls[0];
    const body = await request.json();
    assertEquals(body.to, "alerts@example.com");
    assertEquals(body.subject, "Token Expiry Warning - Page 123 expires in 3 days");
    assertExists(body.html);
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

Deno.test("sendEventSyncFailedAlert sends sync failure alert", async () => {
  const restoreEnv = createMockEnv({
    RESEND_API_KEY: "re_valid_key",
    MAIL_FROM: "noreply@example.com",
    ALERT_EMAIL_TO: "alerts@example.com",
  });
  try {
    setupMockFetch(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );

    const result = await sendEventSyncFailedAlert("Sync failed", {
      source: "facebook_webhook",
    });

    assertEquals(result.success, true);
    assertEquals(mockFetchCalls.length, 1);
    const request = mockFetchCalls[0];
    const body = await request.json();
    assertEquals(body.to, "alerts@example.com");
    assertEquals(body.subject, "Event Sync Failed");
    assertExists(body.html);
  } finally {
    restoreEnv();
    restoreFetch();
  }
});

