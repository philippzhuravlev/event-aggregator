import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  EVENT_SYNC_DEFAULTS,
  EVENT_SYNC_SCHEDULE,
  PAGINATION,
  RATE_LIMITS,
  TIME,
  TOKEN_REFRESH_DEFAULTS,
  TOKEN_REFRESH_SCHEDULE,
} from "../../src/config/functions-config.ts";

describe("functions config", () => {
  it("exposes token refresh defaults", () => {
    expect(TOKEN_REFRESH_DEFAULTS).toEqual({
      WARNING_DAYS: 7,
      DEFAULT_EXPIRES_DAYS: 60,
    });
    expect(TOKEN_REFRESH_SCHEDULE).toEqual({
      SCHEDULE: "0 * * * *",
      TIMEZONE: "CET",
    });
  });

  it("defines event sync defaults and schedule", () => {
    expect(EVENT_SYNC_DEFAULTS).toMatchObject({
      PAST_EVENTS_DAYS: 90,
      BATCH_SIZE: 100,
      MAX_CLEANUP_QUERY: 10_000,
    });
    expect(EVENT_SYNC_SCHEDULE).toEqual({
      SCHEDULE: "0 */4 * * *",
      TIMEZONE: "UTC",
    });
  });

  it("keeps pagination constants in sync with default page size", () => {
    expect(PAGINATION).toMatchObject({
      DEFAULT_LIMIT: DEFAULT_PAGE_SIZE,
      MAX_LIMIT: 100,
      MIN_LIMIT: 1,
      MAX_SEARCH_LENGTH: 200,
    });
  });

  it("derives rate limit refill rates from window duration", () => {
    const dayMs = TIME.MS_PER_DAY;
    expect(RATE_LIMITS.SYNC_ENDPOINT).toEqual({
      capacity: 10,
      refillRate: 10 / dayMs,
      windowMs: dayMs,
    });
    expect(RATE_LIMITS.TOKEN_REFRESH).toEqual({
      capacity: 24,
      refillRate: 24 / dayMs,
      windowMs: dayMs,
    });
  });

  it("sets canonical time conversions", () => {
    expect(TIME).toEqual({
      MS_PER_SECOND: 1_000,
      MS_PER_MINUTE: 60_000,
      MS_PER_HOUR: 3_600_000,
      MS_PER_DAY: 86_400_000,
    });
  });
});



