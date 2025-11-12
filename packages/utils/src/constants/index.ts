export const FACEBOOK = {
  API_VERSION: "v23.0",
  BASE_URL: "https://graph.facebook.com",
  pageUrl: (pageId: string) => `https://www.facebook.com/${pageId}`,
  eventUrl: (eventId: string) => `https://facebook.com/events/${eventId}`,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  PAGINATION_LIMIT: 100,
} as const;

export const FACEBOOK_API = {
  FIELDS: {
    EVENT: "id,name,description,start_time,end_time,place,cover,event_times",
    PAGE: "id,name,picture",
  },
  GRAPH_ENDPOINT: `https://${FACEBOOK.BASE_URL}/${FACEBOOK.API_VERSION}`,
} as const;

export const FACEBOOK_ORIGIN = "https://facebook.com" as const;

export const ERROR_CODES = {
  FACEBOOK_TOKEN_INVALID: 190,
  FACEBOOK_PERMISSION_DENIED: 10,
  FACEBOOK_RATE_LIMIT: 429,
} as const;

export const SERVER_ERROR_RANGE = {
  MIN: 500,
  MAX: 599,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  METHOD_NOT_ALLOWED: 405,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  RATE_LIMIT: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

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
  MAX_CLEANUP_QUERY: 10000,
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

export const IMAGE_SERVICE = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30 * 1000,
  CACHE_MAX_AGE: 31 * 24 * 60 * 60,
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 10 * 1000,
} as const;

export const HTTP_HEADERS = {
  CONTENT_TYPE: "content-type",
  CONTENT_LENGTH: "content-length",
  AUTHORIZATION: "authorization",
  ORIGIN: "origin",
  REFERER: "referer",
  USER_AGENT: "user-agent",
  X_FORWARDED_FOR: "x-forwarded-for",
  CF_CONNECTING_IP: "cf-connecting-ip",
  X_HUB_SIGNATURE_256: "x-hub-signature-256",
} as const;

export const CONTENT_TYPES = {
  APPLICATION_JSON: "application/json",
  APPLICATION_X_WWW_FORM_URLENCODED: "application/x-www-form-urlencoded",
  MULTIPART_FORM_DATA: "multipart/form-data",
} as const;

export const REQUEST_SIZE_LIMITS = {
  SMALL: 1024 * 10,
  MEDIUM: 1024 * 100,
  LARGE: 1024 * 1024,
  EXTRA_LARGE: 10 * 1024 * 1024,
} as const;

export const URL_DEFAULTS = {
  WEB_APP: "http://localhost:3000",
  OAUTH_CALLBACK: "http://localhost:8080/oauth-callback",
} as const;

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://event-aggregator-nine.vercel.app",
] as const;

export const DEFAULT_PAGE_SIZE = 50;
export const API_TIMEOUT_MS = 10000;

