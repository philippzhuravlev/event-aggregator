import { describe, expect, it } from "vitest";
import {
  buildAllowedOriginsList,
  createAllowedOriginChecker,
} from "../../src/utils/origin-util.ts";

describe("origin-util createAllowedOriginChecker", () => {
  it("allows known, preview, and localhost origins by default", () => {
    const isAllowed = createAllowedOriginChecker();

    expect(isAllowed("https://event-aggregator-nine.vercel.app")).toBe(true);
    expect(isAllowed("https://event-aggregator-preview.vercel.app")).toBe(true);
    expect(isAllowed("http://localhost:5173")).toBe(true);
  });

  it("supports additional hostnames and case-insensitive matching", () => {
    const isAllowed = createAllowedOriginChecker({
      additionalHostnames: ["custom.example.com"],
    });

    expect(isAllowed("https://CUSTOM.EXAMPLE.com")).toBe(true);
  });

  it("respects allowLocalhost option", () => {
    const isAllowed = createAllowedOriginChecker({
      allowLocalhost: false,
    });

    expect(isAllowed("http://localhost:3000")).toBe(false);
  });

  it("allows the configured webAppUrl host", () => {
    const isAllowed = createAllowedOriginChecker({
      webAppUrl: "https://app.event-aggregator.com",
    });

    expect(isAllowed("https://app.event-aggregator.com")).toBe(true);
  });

  it("rejects invalid origins", () => {
    const isAllowed = createAllowedOriginChecker();

    expect(isAllowed("not-a-valid-url")).toBe(false);
  });
});

describe("origin-util buildAllowedOriginsList", () => {
  it("builds a deduplicated list incorporating all options", () => {
    const origins = buildAllowedOriginsList({
      webAppUrl: "https://app.event-aggregator.com",
      vercelUrl: "event-aggregator.vercel.app",
      currentOrigin: "https://current.event-aggregator.com",
      includeLocalhost: false,
      additionalOrigins: ["https://additional.example.com"],
      knownOrigins: ["https://known.example.com"],
    });

    expect(origins).toEqual(
      expect.arrayContaining([
        "https://app.event-aggregator.com",
        "https://event-aggregator.vercel.app",
        "https://current.event-aggregator.com",
        "https://additional.example.com",
        "https://known.example.com",
      ]),
    );
    expect(origins).not.toContain("http://localhost:3000");
  });

  it("honors provided localhost origins when enabled", () => {
    const origins = buildAllowedOriginsList({
      includeLocalhost: true,
      localhostOrigins: ["http://localhost:9999"],
    });

    expect(origins).toContain("http://localhost:9999");
  });
});



