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
});


