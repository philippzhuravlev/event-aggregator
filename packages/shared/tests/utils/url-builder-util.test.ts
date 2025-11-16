import { describe, expect, it } from "vitest";
import { createOriginUtilities } from "../../src/utils/url-builder-util.ts";

describe("url-builder-util createOriginUtilities", () => {
  it("exposes an isAllowedOrigin helper wired to options", () => {
    const { isAllowedOrigin } = createOriginUtilities({
      additionalHostnames: ["api.event-aggregator.com"],
    });

    expect(isAllowedOrigin("https://api.event-aggregator.com")).toBe(true);
    expect(isAllowedOrigin("https://unknown.example.com")).toBe(false);
  });

  it("shares allowed origins with optional override", () => {
    const utilities = createOriginUtilities({
      currentOrigin: "https://dashboard.event-aggregator.com",
      additionalOrigins: ["https://shared.example.com"],
    });

    const defaultOrigins = utilities.getAllowedOrigins();
    const overriddenOrigins = utilities.getAllowedOrigins(
      "https://override.example.com",
    );

    expect(defaultOrigins).toEqual(
      expect.arrayContaining([
        "https://dashboard.event-aggregator.com",
        "https://shared.example.com",
      ]),
    );
    expect(overriddenOrigins).toEqual(
      expect.arrayContaining([
        "https://override.example.com",
        "https://shared.example.com",
      ]),
    );
    expect(overriddenOrigins).not.toContain(
      "https://dashboard.event-aggregator.com",
    );
  });

  it("respects allowLocalhost option when creating checker", () => {
    const { isAllowedOrigin } = createOriginUtilities({
      allowLocalhost: false,
    });

    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
  });
});



