import { describe, expect, it } from "vitest";
import { buildRedirectUrl } from "./index";

describe("buildRedirectUrl", () => {
  const allowedOrigins = ["https://allowed.app"];

  it("returns null when state is missing", () => {
    const result = buildRedirectUrl(null, allowedOrigins, { code: "123" });
    expect(result).toBeNull();
  });

  it("returns null when origin is not allowed", () => {
    const result = buildRedirectUrl(
      "https://malicious.example.com/oauth",
      allowedOrigins,
      {},
    );
    expect(result).toBeNull();
  });

  it("returns a redirect URL with appended params when valid", () => {
    const result = buildRedirectUrl(
      "https://allowed.app/oauth/callback",
      allowedOrigins,
      { code: "abc123", status: "ok" },
    );

    expect(result).not.toBeNull();
    const redirectUrl = new URL(result ?? "");
    expect(redirectUrl.origin).toBe("https://allowed.app");
    expect(redirectUrl.pathname).toBe("/oauth/callback");
    expect(redirectUrl.searchParams.get("code")).toBe("abc123");
    expect(redirectUrl.searchParams.get("status")).toBe("ok");
  });
});

