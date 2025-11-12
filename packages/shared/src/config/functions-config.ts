export const TOKEN_REFRESH_DEFAULTS = {
  WARNING_DAYS: 7,
  DEFAULT_EXPIRES_DAYS: 60,
} as const;

export const TOKEN_REFRESH_SCHEDULE = {
  SCHEDULE: "0 * * * *",
  TIMEZONE: "CET",
} as const;

export const EVENT_SYNC_DEFAULTS = {
  PAST_EVENTS_DAYS: 90,
  BATCH_SIZE: 100,
  MAX_CLEANUP_QUERY: 10_000,
} as const;

export const EVENT_SYNC_SCHEDULE = {
  SCHEDULE: "0 */4 * * *",
  TIMEZONE: "UTC",
} as const;

export const RATE_LIMITS = {
  SYNC_ENDPOINT: {
    capacity: 10,
    refillRate: 10 / (24 * 60 * 60 * 1000),
    windowMs: 24 * 60 * 60 * 1000,
  },
  TOKEN_REFRESH: {
    capacity: 24,
    refillRate: 24 / (24 * 60 * 60 * 1000),
    windowMs: 24 * 60 * 60 * 1000,
  },
} as const;

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_SEARCH_LENGTH: 200,
} as const;

export const TIME = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;

export const DEFAULT_PAGE_SIZE = 50;

