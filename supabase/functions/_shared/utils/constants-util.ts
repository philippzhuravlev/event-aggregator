/**
 * Application-wide constants for Supabase Edge Functions (Deno)
 * This file centralizes all configuration values used across services, handlers, and utilities
 */

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// So this util is just a list of constants - quite convenient to have them all in one place
// rather than scattered around the codebase. It also makes it easier to change them
// later on, e.g. if Facebook changes their API version or if we want to adjust sync
// frequency or error codes etc etc you get the idea

// Deno is essentially a JS/TS "upgraded" version of Node.js which is more secure. No compiling
// from TS to JS needed, etc etc. It's used for Supabase Edge Functions, where the "edge" means
// that it's not running from one computer center, but distributed across many locations worldwide.
// also its "serverless", meaning we don't have to manage servers etc - Supabase does that for us

// In Deno/Edge Functions, environment variables work the same way but are accessed via Deno.env

// ============================================================================
// FACEBOOK API CONFIGURATION
// ============================================================================

// So this is a util, a helper function that is neither "what to do" (handler) nor
// "how to connect to an external service" (service). It just does pure logic that
// either makes sense to compartmentalize or is used in multiple places.

// So this util is just a list of constants - quite convenient to have them all in one place
// rather than scattered around the codebase. It also makes it easier to change them
// later on, e.g. if Facebook changes their API version or if we want to adjust sync
// frequency or error codes etc etc you get the idea

// Deno is essentially a JS/TS "upgraded" version of Node.js which is more secure. No compiling
// from TS to JS needed, etc etc. It's used for Supabase Edge Functions, where the "edge" means
// that it's not running from one computer center, but distributed across many locations worldwide.
// also its "serverless", meaning we don't have to manage servers etc - Supabase does that for us

// In Deno/Edge Functions, environment variables work the same way but are accessed via Deno.env
export const FACEBOOK = {
  API_VERSION: "v23.0", // can be upgraded to current v24.0 version
  BASE_URL: "https://graph.facebook.com",
  pageUrl: (pageId: string) => `https://www.facebook.com/${pageId}`,
  eventUrl: (eventId: string) => `https://facebook.com/events/${eventId}`,
  // API request configuration
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

export const FACEBOOK_ORIGIN = "https://facebook.com"; // overkill but consistent

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Facebook specific error codes
  FACEBOOK_TOKEN_INVALID: 190, // Invalid OAuth Token
  FACEBOOK_PERMISSION_DENIED: 10, // Permission denied
  FACEBOOK_RATE_LIMIT: 429, // Rate limit exceeded
} as const;

// Server error range for retry logic
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
  TOO_MANY_REQUESTS: 429,
  RATE_LIMIT: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================================
// TOKEN REFRESH & EXPIRY CONFIGURATION
// ============================================================================

// In Deno Edge Functions, environment variables are accessed via Deno.env.get()
const TOKEN_ALERT_EMAIL = Deno.env.get("TOKEN_ALERT_EMAIL");

export const TOKEN_REFRESH = {
  WARNING_DAYS: 7, // Token warning days before expiry
  DEFAULT_EXPIRES_DAYS: 60, // Default token expiration (Facebook long-lived tokens expire in 60 days)
  SCHEDULE: "0 * * * *", // Token refresh schedule (runs every hour)
  TIMEZONE: "CET", // Timezone for cron job
  ALERT_EMAIL: TOKEN_ALERT_EMAIL, // Alert email for token expiry notifications
} as const;

export const TOKEN_EXPIRY_CONFIG = {
  warningDays: TOKEN_REFRESH.WARNING_DAYS,
  defaultExpiresDays: TOKEN_REFRESH.DEFAULT_EXPIRES_DAYS,
  alertEmail: TOKEN_REFRESH.ALERT_EMAIL,
} as const;

// ============================================================================
// EVENT SYNC CONFIGURATION
// ============================================================================

export const EVENT_SYNC = {
  // Number of past days to sync events for
  PAST_EVENTS_DAYS: 30,
  // Sync schedule (runs every 4 hours)
  SCHEDULE: "0 */4 * * *",
  // Timezone for cron job
  TIMEZONE: "UTC",
  // Batch size for event writes
  BATCH_SIZE: 100,
  // Maximum number of events to clean up in one query
  MAX_CLEANUP_QUERY: 10000,
} as const;

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

export const RATE_LIMITS = {
  // Sync endpoint: 10 calls per day per token
  SYNC_ENDPOINT: {
    capacity: 10,
    refillRate: 10 / (24 * 60 * 60 * 1000), // 10 tokens per day
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  // Token refresh: max 24 refreshes per day per page (roughly 1 per hour)
  TOKEN_REFRESH: {
    capacity: 24,
    refillRate: 24 / (24 * 60 * 60 * 1000), // 24 tokens per day
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
  },
} as const;

// ============================================================================
// WEBHOOK CONFIGURATION
// ============================================================================

export const WEBHOOK = {
  VERIFY_TOKEN: Deno.env.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN") || "verify_me",
  VERIFY_TOKEN_PARAM: "hub.verify_token",
  CHALLENGE_PARAM: "hub.challenge",
  MODE_PARAM: "hub.mode",
  MODE_SUBSCRIBE: "subscribe",
} as const;

// ============================================================================
// PAGINATION CONFIGURATION
// ============================================================================

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
  MAX_SEARCH_LENGTH: 200,
} as const;

// ============================================================================
// TIME CONSTANTS
// ============================================================================

export const TIME = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;

// ============================================================================
// IMAGE SERVICE CONFIGURATION
// ============================================================================

export const IMAGE_SERVICE = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30 * 1000, // 30 seconds
  CACHE_MAX_AGE: 31 * 24 * 60 * 60, // 31 days
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 10 * 1000,
} as const;

// ============================================================================
// HTTP HEADERS
// ============================================================================

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

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

// CORS is Cross-Origin Resource Sharing - a security feature in browsers
// that restricts web pages from making requests to a different domain than
// the one that served the web page. Basically, there's a principle called
// "same-origin policy" that prevents malicious websites from accessing
// sensitive data from another site without permission; a malicious actor
// could exploit this by making requests to the API from their own domain.
// CORS is a way for servers to tell browsers "hey, it's okay to share resources
// with this other domain".

// Build dynamic CORS headers based on environment
const corsOrigin = Deno.env.get("WEB_APP_URL") || "https://event-aggregator-nine.vercel.app";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

// ============================================================================
// URLS
// ============================================================================

const WEB_APP_URL = Deno.env.get("WEB_APP_URL") || "http://localhost:3000";
const OAUTH_CALLBACK_URL = Deno.env.get("OAUTH_CALLBACK_URL") ||
  "http://localhost:8080/oauth-callback";

export const URLS = {
  WEB_APP: WEB_APP_URL,
  OAUTH_CALLBACK: OAUTH_CALLBACK_URL,
} as const;

// ============================================================================
// ALLOWED ORIGINS (For OAuth & CORS)
// ============================================================================

export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://event-aggregator-nine.vercel.app",
  WEB_APP_URL,
] as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

const ENV = Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") ||
  "development";

export const IS_PRODUCTION = ENV === "production";
export const IS_DEVELOPMENT = ENV === "development";
export const IS_TESTING = ENV === "test";
