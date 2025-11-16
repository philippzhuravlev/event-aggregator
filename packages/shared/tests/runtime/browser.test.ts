import { describe, expect, it } from "vitest";
import { createBrowserRuntimeConfig } from "../../src/runtime/browser.ts";
import { API_TIMEOUT_MS } from "../../src/config/service-config.ts";
import { DEFAULT_PAGE_SIZE } from "../../src/config/functions-config.ts";

describe("runtime/browser createBrowserRuntimeConfig", () => {
  it("derives runtime flags and uses provided env overrides", () => {
    const config = createBrowserRuntimeConfig({
      MODE: "production",
      VITE_BACKEND_URL: "https://api.example.com",
      VITE_USE_SUPABASE: "true",
      VITE_USE_BACKEND_API: "false",
      VITE_TOKEN_ALERT_EMAIL: "alerts@example.com",
    });

    expect(config).toEqual({
      backendUrl: "https://api.example.com",
      useSupabase: true,
      useBackendApi: false,
      nodeEnv: "production",
      isDevelopment: false,
      isProduction: true,
      apiTimeoutMs: API_TIMEOUT_MS,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      tokenAlertEmail: "alerts@example.com",
      alertEmailEnvKey: "VITE_TOKEN_ALERT_EMAIL",
    });
  });

  it("falls back for missing values and handles boolean inputs", () => {
    const config = createBrowserRuntimeConfig(
      {
        NODE_ENV: "staging",
        VITE_BACKEND_URL: "   ",
        VITE_USE_SUPABASE: true,
        VITE_USE_BACKEND_API: "",
      },
      { fallbackBackendUrl: "https://fallback.example.com" },
    );

    expect(config.backendUrl).toBe("https://fallback.example.com");
    expect(config.useSupabase).toBe(true);
    expect(config.useBackendApi).toBe(false);
    expect(config.nodeEnv).toBe("staging");
    expect(config.isDevelopment).toBe(false);
    expect(config.isProduction).toBe(false);
    expect(config.tokenAlertEmail).toBe("");
  });
});



