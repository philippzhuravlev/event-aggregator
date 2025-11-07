/**
 * Shared constants for Node.js API handlers
 * Consolidated constants for Node.js API handlers (Vercel)
 * Mirrors the structure of supabase/functions/_shared/utils/constants-util.ts
 * for consistency across backend services
 */

import process from "node:process";

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

export const FACEBOOK = {
  API_VERSION: "v23.0",
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

export const FACEBOOK_ORIGIN = "https://facebook.com";

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  FACEBOOK_TOKEN_INVALID: 190,
  FACEBOOK_PERMISSION_DENIED: 10,
  FACEBOOK_RATE_LIMIT: 429,
} as const;

export const SERVER_ERROR_RANGE = {
  MIN: 500,
  MAX: 599,
} as const;

// ============================================================================
// HTTP STATUS CODES & HEADERS
// ============================================================================

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

// ============================================================================
// TOKEN REFRESH & EXPIRY CONFIGURATION
// ============================================================================

const TOKEN_ALERT_EMAIL = process.env.TOKEN_ALERT_EMAIL;

export const TOKEN_REFRESH = {
  WARNING_DAYS: 7,
  DEFAULT_EXPIRES_DAYS: 60,
  ALERT_EMAIL: TOKEN_ALERT_EMAIL,
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
  PAST_EVENTS_DAYS: 30,
  BATCH_SIZE: 100,
  MAX_CLEANUP_QUERY: 10000,
} as const;

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

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
// CORS CONFIGURATION
// ============================================================================

/**
 * Get dynamic CORS headers based on environment
 * Supports both local development and production
 */
export function getCORSHeaders(
  requestOrigin?: string,
): Record<string, string> {
  const allowedOrigin = requestOrigin ||
    process.env.WEB_APP_URL ||
    "https://event-aggregator-nine.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

// ============================================================================
// URLS & ALLOWED ORIGINS
// ============================================================================

const WEB_APP_URL = process.env.WEB_APP_URL || "http://localhost:3000";
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL ||
  "http://localhost:8080/oauth-callback";

export const URLS = {
  WEB_APP: WEB_APP_URL,
  OAUTH_CALLBACK: OAUTH_CALLBACK_URL,
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

const ENV = process.env.ENVIRONMENT || process.env.NODE_ENV || "development";

export const IS_PRODUCTION = ENV === "production";
export const IS_DEVELOPMENT = ENV === "development";
export const IS_TESTING = ENV === "test";
