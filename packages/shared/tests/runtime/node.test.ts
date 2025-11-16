import { afterEach, describe, expect, it, vi } from "vitest";
import process from "node:process";

type MutableEnv = NodeJS.ProcessEnv & Record<string, string | undefined>;

const ORIGINAL_ENV = { ...process.env } as MutableEnv;

const resetEnv = () => {
  process.env = { ...ORIGINAL_ENV };
};

const loadNodeRuntime = async () => {
  vi.resetModules();
  return await import("../../src/runtime/node.ts");
};

describe("runtime/node", () => {
  afterEach(() => {
    resetEnv();
    vi.resetModules();
  });

  it("derives runtime values from process.env", async () => {
    resetEnv();
    process.env.WEB_APP_URL = "https://node-app.example.com";
    process.env.OAUTH_CALLBACK_URL = "https://node-app.example.com/oauth";
    process.env.TOKEN_ALERT_EMAIL = "alerts@example.com";
    process.env.VERCEL_URL = "node-app.vercel.app";

    const nodeRuntime = await loadNodeRuntime();

    expect(nodeRuntime.URLS).toEqual({
      WEB_APP: "https://node-app.example.com",
      OAUTH_CALLBACK: "https://node-app.example.com/oauth",
    });

    expect(nodeRuntime.TOKEN_REFRESH).toMatchObject({
      WARNING_DAYS: 7,
      DEFAULT_EXPIRES_DAYS: 60,
      ALERT_EMAIL: "alerts@example.com",
    });

    expect(nodeRuntime.ALLOWED_ORIGINS).toContain(
      "https://node-app.example.com",
    );

    expect(nodeRuntime.getAllowedOrigins()).toEqual(
      expect.arrayContaining([
        "https://node-app.example.com",
        "https://node-app.vercel.app",
      ]),
    );

    expect(nodeRuntime.isAllowedOrigin("https://node-app.example.com")).toBe(
      true,
    );

    expect(nodeRuntime.CORS_HEADERS).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, apikey, X-Client-Info, Prefer",
      "Access-Control-Allow-Credentials": "true",
    });

    const fallbackHeaders = nodeRuntime.getCORSHeaders();
    expect(fallbackHeaders["Access-Control-Allow-Origin"]).toBe(
      "https://node-app.example.com",
    );

    const explicitHeaders = nodeRuntime.getCORSHeaders(
      "https://other.example.com",
    );
    expect(explicitHeaders["Access-Control-Allow-Origin"]).toBe(
      "https://other.example.com",
    );
  });
});
