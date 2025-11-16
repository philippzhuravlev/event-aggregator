import { describe, expect, it } from "vitest";
import {
  API_TIMEOUT_MS,
  FACEBOOK,
  FACEBOOK_API,
  FACEBOOK_ORIGIN,
  IMAGE_SERVICE,
} from "../../src/config/service-config.ts";

describe("service config", () => {
  it("builds facebook urls with provided identifiers", () => {
    expect(FACEBOOK.pageUrl("dtu.events")).toBe(
      "https://www.facebook.com/dtu.events",
    );
    expect(FACEBOOK.eventUrl("12345")).toBe(
      "https://facebook.com/events/12345",
    );
  });

  it("exposes facebook api defaults", () => {
    expect(FACEBOOK).toMatchObject({
      API_VERSION: "v23.0",
      BASE_URL: "https://graph.facebook.com",
      MAX_RETRIES: 3,
      RETRY_DELAY_MS: 1_000,
      PAGINATION_LIMIT: 100,
    });
  });

  it("keeps graph endpoint in sync with api version", () => {
    expect(FACEBOOK_API.GRAPH_ENDPOINT).toBe(
      `https://${FACEBOOK.BASE_URL}/${FACEBOOK.API_VERSION}`,
    );
  });

  it("defines sane defaults for image service", () => {
    expect(IMAGE_SERVICE.ALLOWED_EXTENSIONS).toEqual([
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
    ]);
    expect(IMAGE_SERVICE).toMatchObject({
      MAX_RETRIES: 3,
      TIMEOUT_MS: 30_000,
      CACHE_MAX_AGE: 31 * 24 * 60 * 60,
      BACKOFF_BASE_MS: 1_000,
      BACKOFF_MAX_MS: 10_000,
    });
  });

  it("exports shared api constants", () => {
    expect(API_TIMEOUT_MS).toBe(10_000);
    expect(FACEBOOK_ORIGIN).toBe("https://facebook.com");
  });
});
