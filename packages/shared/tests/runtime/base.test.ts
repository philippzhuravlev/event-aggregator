import { describe, expect, it } from "vitest";
import {
  createBaseCorsHeaders,
  createCorsHeaders,
  createEventSyncConfig,
  createRuntimeOriginUtilities,
  createTokenExpiryConfig,
  createTokenRefreshConfig,
  createWebhookConfig,
  type EnvGetter,
  resolveAllowedOrigins,
  resolveCorsOrigin,
  resolveEnvironmentFlags,
  resolveEnvValue,
  resolveOAuthCallbackUrl,
  resolveWebAppUrl,
  stringToBoolean,
} from "../../src/runtime/base.ts";
import {
  EVENT_SYNC_DEFAULTS,
  EVENT_SYNC_SCHEDULE,
  TOKEN_REFRESH_DEFAULTS,
  TOKEN_REFRESH_SCHEDULE,
} from "../../src/config/functions-config.ts";
import {
  DEFAULT_ALLOWED_ORIGINS,
  URL_DEFAULTS,
} from "../../src/config/validation-config.ts";

const makeEnvGetter =
  (values: Record<string, string | undefined>): EnvGetter => (key) =>
    values[key];

describe("runtime/base string utilities", () => {
  it("coerces various truthy values to boolean true", () => {
    expect(stringToBoolean(true)).toBe(true);
    expect(stringToBoolean("TRUE")).toBe(true);
    expect(stringToBoolean("Yes")).toBe(true);
    expect(stringToBoolean("1")).toBe(true);
  });

  it("returns false for non-boolean-like values", () => {
    expect(stringToBoolean(false)).toBe(false);
    expect(stringToBoolean("no")).toBe(false);
    expect(stringToBoolean("")).toBe(false);
    expect(stringToBoolean(null)).toBe(false);
  });
});

describe("runtime/base environment helpers", () => {
  it("resolves env values with fallbacks", () => {
    const getEnv = makeEnvGetter({ FOO: "bar" });

    expect(resolveEnvValue(getEnv, "FOO", "fallback")).toBe("bar");
    expect(resolveEnvValue(getEnv, "MISSING", "fallback")).toBe("fallback");
    expect(resolveEnvValue(getEnv, "EMPTY")).toBeUndefined();
  });

  it("creates token refresh config with optional schedule and alert email", () => {
    const getEnv = makeEnvGetter({
      TOKEN_ALERT_EMAIL: "alerts@example.com",
      CUSTOM_ALERT: "custom@example.com",
    });

    const defaults = createTokenRefreshConfig(getEnv);
    expect(defaults).toMatchObject({
      ...TOKEN_REFRESH_DEFAULTS,
      ALERT_EMAIL: "alerts@example.com",
    });
    expect("SCHEDULE" in defaults).toBe(false);

    const withSchedule = createTokenRefreshConfig(getEnv, {
      includeSchedule: true,
      alertEmailEnvKey: "CUSTOM_ALERT",
      defaultAlertEmail: "fallback@example.com",
    });

    expect(withSchedule).toMatchObject({
      ...TOKEN_REFRESH_DEFAULTS,
      ...TOKEN_REFRESH_SCHEDULE,
      ALERT_EMAIL: "custom@example.com",
    });
  });

  it("derives token expiry config from refresh config", () => {
    const tokenRefresh = {
      WARNING_DAYS: 5,
      DEFAULT_EXPIRES_DAYS: 30,
      ALERT_EMAIL: "alerts@example.com",
    };

    expect(createTokenExpiryConfig(tokenRefresh)).toEqual({
      warningDays: 5,
      defaultExpiresDays: 30,
      alertEmail: "alerts@example.com",
    });
  });

  it("builds event sync config with optional schedule", () => {
    const baseConfig = createEventSyncConfig();
    expect(baseConfig).toEqual(EVENT_SYNC_DEFAULTS);

    const scheduledConfig = createEventSyncConfig({ includeSchedule: true });
    expect(scheduledConfig).toEqual({
      ...EVENT_SYNC_DEFAULTS,
      ...EVENT_SYNC_SCHEDULE,
    });
  });

  it("resolves web urls using environment overrides", () => {
    const getEnv = makeEnvGetter({
      WEB_APP_URL: "https://app.example.com",
      OAUTH_CALLBACK_URL: "https://app.example.com/oauth",
    });

    expect(resolveWebAppUrl(getEnv)).toBe("https://app.example.com");
    expect(resolveOAuthCallbackUrl(getEnv)).toBe(
      "https://app.example.com/oauth",
    );

    const missingEnv: EnvGetter = () => undefined;
    expect(resolveWebAppUrl(missingEnv, "https://fallback.example.com")).toBe(
      "https://fallback.example.com",
    );
    expect(resolveOAuthCallbackUrl(missingEnv)).toBe(
      URL_DEFAULTS.OAUTH_CALLBACK,
    );
  });

  it("collects allowed origins including defaults and resolved web app", () => {
    const getEnv = makeEnvGetter({
      WEB_APP_URL: "https://app.example.com",
    });

    const origins = resolveAllowedOrigins(getEnv);
    for (const origin of DEFAULT_ALLOWED_ORIGINS) {
      expect(origins).toContain(origin);
    }
    expect(origins).toContain("https://app.example.com");

    const overrideOrigins = resolveAllowedOrigins(getEnv, "https://override");
    expect(overrideOrigins).toContain("https://override");
  });

  it("resolves cors origin preferring env and fallbacks", () => {
    const getEnv = makeEnvGetter({
      WEB_APP_URL: "https://app.example.com",
    });
    expect(resolveCorsOrigin(getEnv)).toBe("https://app.example.com");

    const missingEnv: EnvGetter = () => undefined;
    expect(resolveCorsOrigin(missingEnv, "https://fallback")).toBe(
      "https://fallback",
    );
    expect(resolveCorsOrigin(missingEnv)).toBe(
      DEFAULT_ALLOWED_ORIGINS[DEFAULT_ALLOWED_ORIGINS.length - 1],
    );
  });

  it("creates cors headers for dynamic and wildcard origins", () => {
    expect(createCorsHeaders("https://app.example.com")).toEqual({
      "Access-Control-Allow-Origin": "https://app.example.com",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, X-Client-Info, Prefer",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    });

    expect(createBaseCorsHeaders()).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, X-Client-Info, Prefer",
      "Access-Control-Allow-Credentials": "true",
    });
  });

  it("resolves environment flags with priority and fallbacks", () => {
    const getEnv = makeEnvGetter({ ENVIRONMENT: "production" });
    expect(resolveEnvironmentFlags(getEnv)).toEqual({
      env: "production",
      isProduction: true,
      isDevelopment: false,
      isTesting: false,
    });

    const nodeEnvGetter = makeEnvGetter({ NODE_ENV: "test" });
    expect(resolveEnvironmentFlags(nodeEnvGetter)).toEqual({
      env: "test",
      isProduction: false,
      isDevelopment: false,
      isTesting: true,
    });

    const fallbackGetter: EnvGetter = () => undefined;
    expect(resolveEnvironmentFlags(fallbackGetter, { fallbackEnv: "staging" }))
      .toEqual({
        env: "staging",
        isProduction: false,
        isDevelopment: false,
        isTesting: false,
      });
  });

  it("creates webhook config honoring overrides", () => {
    const getEnv = makeEnvGetter({
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: "secret",
      CUSTOM_VERIFY: "custom",
    });

    expect(createWebhookConfig(getEnv)).toMatchObject({
      VERIFY_TOKEN: "secret",
      VERIFY_TOKEN_PARAM: "hub.verify_token",
      CHALLENGE_PARAM: "hub.challenge",
      MODE_PARAM: "hub.mode",
      MODE_SUBSCRIBE: "subscribe",
    });

    expect(
      createWebhookConfig(getEnv, {
        verifyTokenEnvKey: "CUSTOM_VERIFY",
        defaultVerifyToken: "fallback",
      }),
    ).toMatchObject({
      VERIFY_TOKEN: "custom",
    });
  });

  it("creates runtime origin utilities combining env and options", () => {
    const getEnv = makeEnvGetter({
      WEB_APP_URL: "https://env.example.com",
      VERCEL_URL: "env-project.vercel.app",
    });

    const utils = createRuntimeOriginUtilities(getEnv, {
      additionalHostnames: ["extra.example.com"],
      additionalOrigins: ["https://extra.example.com"],
    });

    expect(utils.isAllowedOrigin("https://env.example.com")).toBe(true);
    expect(utils.isAllowedOrigin("https://extra.example.com")).toBe(true);

    expect(utils.getAllowedOrigins()).toEqual(
      expect.arrayContaining([
        "https://env.example.com",
        "https://extra.example.com",
        "https://env-project.vercel.app",
      ]),
    );

    const overrideUtils = createRuntimeOriginUtilities(getEnv, {
      webAppUrl: "https://override.example.com",
      vercelUrl: "https://override.vercel.app",
    });

    expect(overrideUtils.getAllowedOrigins()).toEqual(
      expect.arrayContaining([
        "https://override.example.com",
        "https://override.vercel.app",
      ]),
    );
    expect(overrideUtils.isAllowedOrigin("https://env.example.com")).toBe(
      false,
    );
  });
});
