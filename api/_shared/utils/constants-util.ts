/**
 * Shared constants for Node.js API handlers
 */

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// So this util is just a list of constants - quite convenient to have them all in one place
// rather than scattered around the codebase. It also makes it easier to change them
// later on, e.g. if Facebook changes their API version or if we want to adjust sync
// frequency or error codes etc etc you get the idea

export const FACEBOOK = {
  MAX_RETRIES: 3,
  RATE_LIMIT: 429,
  TOKEN_INVALID: 190,
  BASE_URL: "https://graph.facebook.com/v18.0",
  PAGINATION_LIMIT: 100,
  RETRY_DELAY_MS: 1000,
};

export const ERROR_CODES = {
  FACEBOOK_TOKEN_INVALID: 190,
  FACEBOOK_RATE_LIMIT: 429,
};

export const SERVER_ERROR_RANGE = {
  MIN: 500,
  MAX: 600,
};

export const EVENT_SYNC = {
  BATCH_SIZE: 100,
  MAX_EVENTS_PER_PAGE: 1000,
  PAST_EVENTS_DAYS: 30,
};

export const RATE_LIMITS = {
  SYNC_ENDPOINT: {
    capacity: 10,
    windowMs: 86400000, // 24 hours
  },
  TOKEN_REFRESH: {
    capacity: 24, // 24 refreshes per day
    windowMs: 86400000, // 24 hours
  },
};

export const TOKEN_REFRESH = {
  WARNING_DAYS: 7,
  DEFAULT_EXPIRES_DAYS: 60,
};

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MAX_SEARCH_LENGTH: 200,
};

export const WEBHOOK = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 5000,
};

export const SIZE_LIMITS = {
  MAX_BODY_SIZE: 1024 * 1024, // 1 MB
};

export const TOKEN_EXPIRY_CONFIG = {
  WARNING_DAYS: 7,
  DEFAULT_EXPIRES_DAYS: 60,
};

// ============================================================================
// VALIDATION CONSTANTS - RATE LIMITING
// ============================================================================

export const RATE_LIMITER_DEFAULTS = {
  MAX_REQUESTS: 100,
  WINDOW_MS: 60000, // 1 minute
  TOKEN_CAPACITY: 10,
  TOKEN_REFILL_RATE: 1, // tokens per second
  BRUTE_FORCE_MAX_ATTEMPTS: 5,
  BRUTE_FORCE_LOCKOUT_MS: 900000, // 15 minutes
};

// ============================================================================
// VALIDATION CONSTANTS - REQUEST
// ============================================================================

export const COMMON_CONTENT_TYPES = {
  JSON: "application/json",
  FORM: "application/x-www-form-urlencoded",
  FORM_DATA: "multipart/form-data",
  TEXT: "text/plain",
  HTML: "text/html",
  XML: "application/xml",
  OCTET_STREAM: "application/octet-stream",
};

export const REQUEST_SIZE_LIMITS = {
  SMALL: 1 * 1024, // 1 KB
  MEDIUM: 10 * 1024, // 10 KB
  LARGE: 100 * 1024, // 100 KB
  VERY_LARGE: 1 * 1024 * 1024, // 1 MB
  HUGE: 10 * 1024 * 1024, // 10 MB
};

// ============================================================================
// VALIDATION CONSTANTS - RESPONSE
// ============================================================================

export const HTTP_STATUS = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,

  // 4xx Client Error
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Error
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const RESPONSE_PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_SEARCH_LENGTH: 200,
} as const;

export const CORS_HEADERS = {
  ALLOW_ORIGIN: "Access-Control-Allow-Origin",
  ALLOW_METHODS: "Access-Control-Allow-Methods",
  ALLOW_HEADERS: "Access-Control-Allow-Headers",
  MAX_AGE: "Access-Control-Max-Age",
  ALLOW_CREDENTIALS: "Access-Control-Allow-Credentials",
} as const;
