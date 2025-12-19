import { assertArrayIncludes, assertEquals, assertMatch } from "std/assert/mod.ts";

const runtimeModuleUrl = new URL(
  "../../../../../../packages/shared/src/runtime/deno.ts",
  import.meta.url,
).href;

const ORIGINAL_ENV_GET = Deno.env.get.bind(Deno.env);

function setMockEnv(values: Record<string, string | undefined>) {
  const calls: string[] = [];
  const getter = (key: string): string | undefined => {
    calls.push(key);
    return values[key];
  };
  (Deno.env as { get: typeof Deno.env.get }).get = getter;
  return { calls };
}

function resetEnv() {
  (Deno.env as { get: typeof Deno.env.get }).get = ORIGINAL_ENV_GET;
}

async function loadRuntime() {
  const cacheBuster = crypto.randomUUID();
  return await import(`${runtimeModuleUrl}?cache=${cacheBuster}`);
}

Deno.test("runtime exposes environment-aware configuration", async () => {
  try {
    const envValues = {
      WEB_APP_URL: "https://app.example.com",
      OAUTH_CALLBACK_URL: "https://app.example.com/oauth",
      TOKEN_ALERT_EMAIL: "alerts@example.com",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "verify-token",
      ENVIRONMENT: "production",
      VERCEL_URL: "my-app.vercel.app",
    };
    const mockEnv = setMockEnv(envValues);

    const runtime = await loadRuntime();

    assertArrayIncludes(mockEnv.calls, ["WEB_APP_URL"]);
    assertEquals(runtime.URLS.WEB_APP, "https://app.example.com");
    assertEquals(runtime.URLS.OAUTH_CALLBACK, "https://app.example.com/oauth");
    assertEquals(runtime.TOKEN_REFRESH.ALERT_EMAIL, "alerts@example.com");
    assertEquals(runtime.WEBHOOK.VERIFY_TOKEN, "verify-token");
    assertEquals(runtime.IS_PRODUCTION, true);
    assertEquals(runtime.IS_DEVELOPMENT, false);
    assertEquals(runtime.CORS_HEADERS["Access-Control-Allow-Origin"], "https://app.example.com");
    assertArrayIncludes(runtime.ALLOWED_ORIGINS, ["https://app.example.com"]);
    assertArrayIncludes(runtime.getAllowedOrigins(), ["https://my-app.vercel.app"]);
    assertEquals(runtime.isAllowedOrigin("https://app.example.com"), true);
  } finally {
    resetEnv();
  }
});

Deno.test("runtime falls back to defaults when environment variables missing", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.URLS.WEB_APP, "http://localhost:3000");
    assertEquals(runtime.URLS.OAUTH_CALLBACK, "http://localhost:8080/oauth-callback");
    assertEquals(runtime.TOKEN_REFRESH.SCHEDULE, "0 * * * *");
    assertEquals(runtime.EVENT_SYNC.SCHEDULE, "0 */4 * * *");
    assertEquals(runtime.WEBHOOK.VERIFY_TOKEN, "verify_me");
    assertEquals(runtime.IS_DEVELOPMENT, true);
    assertEquals(runtime.IS_PRODUCTION, false);
  } finally {
    resetEnv();
  }
});

Deno.test("runtime detects NODE_ENV and overrides allowed origins via overrides", async () => {
  try {
    setMockEnv({
      NODE_ENV: "test",
      WEB_APP_URL: "https://override.example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.IS_TESTING, true);
    assertEquals(runtime.CORS_HEADERS["Access-Control-Allow-Origin"], "https://override.example.com");

    const origins = runtime.getAllowedOrigins("https://preview.example.com");
    assertArrayIncludes(origins, ["https://preview.example.com"]);
    assertEquals(runtime.isAllowedOrigin("https://evil.example.com"), false);
  } finally {
    resetEnv();
  }
});

Deno.test("runtime exposes URL helpers for browser-less inputs", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "example.com",
      OAUTH_CALLBACK_URL: "example.com/oauth",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.URLS.WEB_APP, "example.com");
    assertEquals(runtime.URLS.OAUTH_CALLBACK, "example.com/oauth");
  } finally {
    resetEnv();
  }
});

Deno.test("runtime surfaces token expiry configuration derived from refresh config", async () => {
  try {
    setMockEnv({
      TOKEN_ALERT_EMAIL: "notify@example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.TOKEN_EXPIRY_CONFIG.alertEmail, "notify@example.com");
    assertEquals(runtime.TOKEN_EXPIRY_CONFIG.warningDays, 7);
    assertEquals(runtime.TOKEN_EXPIRY_CONFIG.defaultExpiresDays, 60);
  } finally {
    resetEnv();
  }
});

Deno.test("runtime creates deterministic request metadata utilities", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://app.example.com",
    });
    const runtime = await loadRuntime();

    assertMatch(runtime.CORS_HEADERS["Access-Control-Allow-Methods"], /GET/);
    assertEquals(typeof runtime.getAllowedOrigins, "function");
    assertEquals(typeof runtime.isAllowedOrigin, "function");
  } finally {
    resetEnv();
  }
});

Deno.test("isAllowedOrigin handles localhost and 127.0.0.1", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.isAllowedOrigin("http://localhost:3000"), true);
    assertEquals(runtime.isAllowedOrigin("http://127.0.0.1:3000"), true);
    assertEquals(runtime.isAllowedOrigin("http://localhost:8080"), true);
  } finally {
    resetEnv();
  }
});

Deno.test("isAllowedOrigin handles preview hostname patterns", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://app.example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(
      runtime.isAllowedOrigin("https://event-aggregator-preview.vercel.app"),
      true,
    );
    assertEquals(
      runtime.isAllowedOrigin("https://event-aggregator-nine.vercel.app"),
      true,
    );
    assertEquals(
      runtime.isAllowedOrigin("https://other-app.vercel.app"),
      false,
    );
  } finally {
    resetEnv();
  }
});

Deno.test("isAllowedOrigin handles invalid URLs", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.isAllowedOrigin("not-a-url"), false);
    assertEquals(runtime.isAllowedOrigin(""), false);
  } finally {
    resetEnv();
  }
});

Deno.test("getAllowedOrigins includes vercel URL with protocol", async () => {
  try {
    setMockEnv({
      VERCEL_URL: "https://my-app.vercel.app",
    });
    const runtime = await loadRuntime();

    const origins = runtime.getAllowedOrigins();
    assertArrayIncludes(origins, ["https://my-app.vercel.app"]);
  } finally {
    resetEnv();
  }
});

Deno.test("getAllowedOrigins adds https:// prefix to vercel URL without protocol", async () => {
  try {
    setMockEnv({
      VERCEL_URL: "my-app.vercel.app",
    });
    const runtime = await loadRuntime();

    const origins = runtime.getAllowedOrigins();
    assertArrayIncludes(origins, ["https://my-app.vercel.app"]);
  } finally {
    resetEnv();
  }
});

Deno.test("getAllowedOrigins includes currentOrigin parameter", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    const origins = runtime.getAllowedOrigins("https://custom.example.com");
    assertArrayIncludes(origins, ["https://custom.example.com"]);
  } finally {
    resetEnv();
  }
});

Deno.test("resolveCorsOrigin falls back to default when WEB_APP_URL not set", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    const defaultOrigin = runtime.DEFAULT_ALLOWED_ORIGINS[
      runtime.DEFAULT_ALLOWED_ORIGINS.length - 1
    ];
    assertEquals(
      runtime.CORS_HEADERS["Access-Control-Allow-Origin"],
      defaultOrigin,
    );
  } finally {
    resetEnv();
  }
});

Deno.test("resolveCorsOrigin uses WEB_APP_URL when set", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://custom.example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(
      runtime.CORS_HEADERS["Access-Control-Allow-Origin"],
      "https://custom.example.com",
    );
  } finally {
    resetEnv();
  }
});

Deno.test("resolveAllowedOrigins includes WEB_APP_URL in allowed origins", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://app.example.com",
    });
    const runtime = await loadRuntime();

    assertArrayIncludes(runtime.ALLOWED_ORIGINS, ["https://app.example.com"]);
  } finally {
    resetEnv();
  }
});

Deno.test("resolveAllowedOrigins includes default origins even when WEB_APP_URL is set", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://app.example.com",
    });
    const runtime = await loadRuntime();

    assertArrayIncludes(
      runtime.ALLOWED_ORIGINS,
      runtime.DEFAULT_ALLOWED_ORIGINS,
    );
  } finally {
    resetEnv();
  }
});

Deno.test("createTokenRefreshConfig includes schedule when includeSchedule is true", async () => {
  try {
    setMockEnv({
      TOKEN_ALERT_EMAIL: "alerts@example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.TOKEN_REFRESH.SCHEDULE, "0 * * * *");
    assertEquals(runtime.TOKEN_REFRESH.TIMEZONE, "CET");
  } finally {
    resetEnv();
  }
});

Deno.test("createEventSyncConfig includes schedule when includeSchedule is true", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.EVENT_SYNC.SCHEDULE, "0 */4 * * *");
    assertEquals(runtime.EVENT_SYNC.TIMEZONE, "UTC");
  } finally {
    resetEnv();
  }
});

Deno.test("resolveEnvironmentFlags uses ENVIRONMENT when set", async () => {
  try {
    setMockEnv({
      ENVIRONMENT: "production",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.IS_PRODUCTION, true);
    assertEquals(runtime.IS_DEVELOPMENT, false);
    assertEquals(runtime.IS_TESTING, false);
  } finally {
    resetEnv();
  }
});

Deno.test("resolveEnvironmentFlags falls back to NODE_ENV when ENVIRONMENT not set", async () => {
  try {
    setMockEnv({
      NODE_ENV: "production",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.IS_PRODUCTION, true);
    assertEquals(runtime.IS_DEVELOPMENT, false);
  } finally {
    resetEnv();
  }
});

Deno.test("resolveEnvironmentFlags defaults to development when neither ENVIRONMENT nor NODE_ENV set", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.IS_PRODUCTION, false);
    assertEquals(runtime.IS_DEVELOPMENT, true);
    assertEquals(runtime.IS_TESTING, false);
  } finally {
    resetEnv();
  }
});

Deno.test("createWebhookConfig uses default verify token when not set", async () => {
  try {
    setMockEnv({});
    const runtime = await loadRuntime();

    assertEquals(runtime.WEBHOOK.VERIFY_TOKEN, "verify_me");
  } finally {
    resetEnv();
  }
});

Deno.test("isAllowedOrigin handles webAppHostname matching", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "https://app.example.com",
    });
    const runtime = await loadRuntime();

    assertEquals(runtime.isAllowedOrigin("https://app.example.com"), true);
    assertEquals(runtime.isAllowedOrigin("https://other.example.com"), false);
  } finally {
    resetEnv();
  }
});

Deno.test("isAllowedOrigin handles invalid webAppUrl gracefully", async () => {
  try {
    setMockEnv({
      WEB_APP_URL: "not-a-valid-url",
    });
    const runtime = await loadRuntime();

    // Should still work with other allowed origins
    assertEquals(runtime.isAllowedOrigin("http://localhost:3000"), true);
  } finally {
    resetEnv();
  }
});

