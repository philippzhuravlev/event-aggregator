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

  it("uses MODE when NODE_ENV is not provided", () => {
    const config = createBrowserRuntimeConfig({
      MODE: "development",
    });

    expect(config.nodeEnv).toBe("development");
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
  });

  it("uses NODE_ENV when both MODE and NODE_ENV are provided", () => {
    const config = createBrowserRuntimeConfig({
      MODE: "development",
      NODE_ENV: "production",
    });

    expect(config.nodeEnv).toBe("production");
    expect(config.isDevelopment).toBe(false);
    expect(config.isProduction).toBe(true);
  });

  it("defaults to development when neither MODE nor NODE_ENV is provided", () => {
    const config = createBrowserRuntimeConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
  });

  it("uses default backend URL when VITE_BACKEND_URL is not provided", () => {
    const config = createBrowserRuntimeConfig({});

    expect(config.backendUrl).toBe("/api");
  });

  it("uses fallback backend URL when VITE_BACKEND_URL is empty and fallback is provided", () => {
    const config = createBrowserRuntimeConfig(
      { VITE_BACKEND_URL: "" },
      { fallbackBackendUrl: "https://custom-fallback.com" },
    );

    expect(config.backendUrl).toBe("https://custom-fallback.com");
  });

  it("handles VITE_USE_SUPABASE as boolean", () => {
    const config1 = createBrowserRuntimeConfig({
      VITE_USE_SUPABASE: false,
    });
    expect(config1.useSupabase).toBe(false);

    const config2 = createBrowserRuntimeConfig({
      VITE_USE_SUPABASE: true,
    });
    expect(config2.useSupabase).toBe(true);
  });

  it("handles VITE_USE_BACKEND_API as boolean", () => {
    const config1 = createBrowserRuntimeConfig({
      VITE_USE_BACKEND_API: false,
    });
    expect(config1.useBackendApi).toBe(false);

    const config2 = createBrowserRuntimeConfig({
      VITE_USE_BACKEND_API: true,
    });
    expect(config2.useBackendApi).toBe(true);
  });

  it("handles empty VITE_TOKEN_ALERT_EMAIL", () => {
    const config = createBrowserRuntimeConfig({
      VITE_TOKEN_ALERT_EMAIL: "",
    });

    expect(config.tokenAlertEmail).toBe("");
  });

  it("handles missing VITE_TOKEN_ALERT_EMAIL", () => {
    const config = createBrowserRuntimeConfig({});

    expect(config.tokenAlertEmail).toBe("");
  });
});



