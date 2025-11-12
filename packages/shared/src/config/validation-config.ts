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

