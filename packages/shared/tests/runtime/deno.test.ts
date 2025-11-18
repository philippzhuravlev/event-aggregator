import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

interface MockDenoEnv {
  get: (key: string) => string | undefined;
}

type MockDeno = { env: MockDenoEnv };

const ORIGINAL_DENO = (globalThis as Record<string, unknown>).Deno;

const setMockDeno = (values: Record<string, string | undefined>) => {
  const mockEnv: MockDenoEnv = {
    get: vi.fn((key) => values[key]),
  };
  (globalThis as Record<string, unknown>).Deno = { env: mockEnv };
  return mockEnv;
};

const resetDeno = () => {
  if (ORIGINAL_DENO === undefined) {
    delete (globalThis as Record<string, unknown>).Deno;
  } else {
    (globalThis as Record<string, unknown>).Deno = ORIGINAL_DENO;
  }
};

const loadDenoRuntime = async () => {
  vi.resetModules();
  return await import("../../src/runtime/deno.ts");
};

describe("runtime/deno", () => {
  afterEach(() => {
    resetDeno();
    vi.resetModules();
  });

  it("reads configuration from Deno.env", async () => {
    const envValues = {
      WEB_APP_URL: "https://deno-app.example.com",
      OAUTH_CALLBACK_URL: "https://deno-app.example.com/oauth",
      TOKEN_ALERT_EMAIL: "deno-alerts@example.com",
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "verify-deno",
      ENVIRONMENT: "production",
      VERCEL_URL: "deno-app.vercel.app",
    };
    const mockEnv = setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(mockEnv.get).toHaveBeenCalledWith("WEB_APP_URL");
    expect(denoRuntime.URLS).toEqual({
      WEB_APP: "https://deno-app.example.com",
      OAUTH_CALLBACK: "https://deno-app.example.com/oauth",
    });

    expect(denoRuntime.TOKEN_REFRESH).toMatchObject({
      WARNING_DAYS: 7,
      DEFAULT_EXPIRES_DAYS: 60,
      ALERT_EMAIL: "deno-alerts@example.com",
      SCHEDULE: "0 * * * *",
      TIMEZONE: "CET",
    });

    expect(denoRuntime.WEBHOOK).toMatchObject({
      VERIFY_TOKEN: "verify-deno",
    });

    expect(denoRuntime.IS_PRODUCTION).toBe(true);
    expect(denoRuntime.IS_DEVELOPMENT).toBe(false);
    expect(denoRuntime.IS_TESTING).toBe(false);

    expect(denoRuntime.CORS_HEADERS["Access-Control-Allow-Origin"]).toBe(
      "https://deno-app.example.com",
    );

    expect(denoRuntime.getAllowedOrigins()).toEqual(
      expect.arrayContaining([
        "https://deno-app.example.com",
        "https://deno-app.vercel.app",
      ]),
    );

    expect(
      denoRuntime.getAllowedOrigins("https://override.example.com"),
    ).toEqual(expect.arrayContaining(["https://override.example.com"]));

    expect(denoRuntime.isAllowedOrigin("https://deno-app.example.com")).toBe(
      true,
    );
  });

  it("handles development environment", async () => {
    const envValues = {
      ENVIRONMENT: "development",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.IS_PRODUCTION).toBe(false);
    expect(denoRuntime.IS_DEVELOPMENT).toBe(true);
    expect(denoRuntime.IS_TESTING).toBe(false);
  });

  it("handles test environment", async () => {
    const envValues = {
      ENVIRONMENT: "test",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.IS_PRODUCTION).toBe(false);
    expect(denoRuntime.IS_DEVELOPMENT).toBe(false);
    expect(denoRuntime.IS_TESTING).toBe(true);
  });

  it("falls back to NODE_ENV when ENVIRONMENT is not set", async () => {
    const envValues = {
      NODE_ENV: "production",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.IS_PRODUCTION).toBe(true);
    expect(denoRuntime.IS_DEVELOPMENT).toBe(false);
  });

  it("uses default environment when neither ENVIRONMENT nor NODE_ENV is set", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.IS_PRODUCTION).toBe(false);
    expect(denoRuntime.IS_DEVELOPMENT).toBe(true);
  });

  it("uses default URLs when environment variables are not set", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.URLS.WEB_APP).toBe("http://localhost:3000");
    expect(denoRuntime.URLS.OAUTH_CALLBACK).toBe(
      "http://localhost:8080/oauth-callback",
    );
  });

  it("uses default TOKEN_ALERT_EMAIL when not set", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.TOKEN_REFRESH.ALERT_EMAIL).toBeUndefined();
  });

  it("uses default FACEBOOK_WEBHOOK_VERIFY_TOKEN when not set", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.WEBHOOK.VERIFY_TOKEN).toBe("verify_me");
  });

  it("includes EVENT_SYNC schedule when configured", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.EVENT_SYNC.SCHEDULE).toBeDefined();
    expect(denoRuntime.EVENT_SYNC.TIMEZONE).toBeDefined();
  });

  it("includes TOKEN_REFRESH schedule when configured", async () => {
    setMockDeno({});

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.TOKEN_REFRESH.SCHEDULE).toBeDefined();
    expect(denoRuntime.TOKEN_REFRESH.TIMEZONE).toBeDefined();
  });

  it("handles VERCEL_URL for allowed origins", async () => {
    const envValues = {
      VERCEL_URL: "my-app.vercel.app",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    const origins = denoRuntime.getAllowedOrigins();
    expect(origins).toEqual(
      expect.arrayContaining(["https://my-app.vercel.app"]),
    );
  });

  it("handles WEB_APP_URL without protocol", async () => {
    const envValues = {
      WEB_APP_URL: "example.com",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.URLS.WEB_APP).toBe("example.com");
  });

  it("handles OAUTH_CALLBACK_URL without protocol", async () => {
    const envValues = {
      OAUTH_CALLBACK_URL: "example.com/oauth",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.URLS.OAUTH_CALLBACK).toBe("example.com/oauth");
  });

  it("handles isAllowedOrigin with disallowed origin", async () => {
    const envValues = {
      WEB_APP_URL: "https://allowed.example.com",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.isAllowedOrigin("https://evil.example.com")).toBe(
      false,
    );
  });

  it("handles getAllowedOrigins with override", async () => {
    const envValues = {
      WEB_APP_URL: "https://app.example.com",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    const origins = denoRuntime.getAllowedOrigins("https://override.com");
    expect(origins).toEqual(expect.arrayContaining(["https://override.com"]));
  });

  it("handles TOKEN_EXPIRY_CONFIG", async () => {
    const envValues = {
      TOKEN_ALERT_EMAIL: "test@example.com",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.TOKEN_EXPIRY_CONFIG).toBeDefined();
    expect(denoRuntime.TOKEN_EXPIRY_CONFIG.warningDays).toBe(7);
    expect(denoRuntime.TOKEN_EXPIRY_CONFIG.defaultExpiresDays).toBe(60);
    expect(denoRuntime.TOKEN_EXPIRY_CONFIG.alertEmail).toBe("test@example.com");
  });

  it("handles CORS_HEADERS with custom origin", async () => {
    const envValues = {
      WEB_APP_URL: "https://custom.example.com",
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    expect(denoRuntime.CORS_HEADERS["Access-Control-Allow-Origin"]).toBe(
      "https://custom.example.com",
    );
    expect(denoRuntime.CORS_HEADERS["Access-Control-Allow-Methods"]).toBe(
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    expect(denoRuntime.CORS_HEADERS["Access-Control-Allow-Headers"]).toBe(
      "Content-Type, Authorization, apikey, X-Client-Info, Prefer",
    );
    expect(denoRuntime.CORS_HEADERS["Access-Control-Allow-Credentials"]).toBe(
      "true",
    );
    expect(denoRuntime.CORS_HEADERS["Vary"]).toBe("Origin");
  });

  it("handles empty VERCEL_URL", async () => {
    const envValues = {
      WEB_APP_URL: "https://app.example.com",
      VERCEL_URL: undefined,
    };
    setMockDeno(envValues);

    const denoRuntime = await loadDenoRuntime();

    const origins = denoRuntime.getAllowedOrigins();
    // Should not include VERCEL_URL in origins when undefined
    expect(origins).toEqual(expect.arrayContaining(["https://app.example.com"]));
  });
});


