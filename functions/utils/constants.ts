/**
 * Application-wide constants
 * This file centralizes all configuration values used across services, handlers, and utilities
 */

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

// App URLs - auto-detected based on where the code is running
// so all of this isProduction mess was because the facebook redirect URL was initially in a 
// firebase web app but sent it back as localhost which wasn't running. This fixes that.
// also note that there's process.env but you don't need to set anything in .env; 
// everything is auto-detected by firebase/google cloud functions. How amazing.
// !! is a slightly confusing js thing but it just converts a value to a boolean that "feels
// true or false", so !!null = false, !!"hello" = true, !!"" = false, !!0 = false, !!1 = true
export const FACEBOOK = {
  API_VERSION: '23.0',
  BASE_URL: 'https://graph.facebook.com',
  pageUrl: (pageId: string) => `https://www.facebook.com/${pageId}`,
  eventUrl: (eventId: string) => `https://facebook.com/events/${eventId}`,
  // API request configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  PAGINATION_LIMIT: 100,
} as const;

export const FACEBOOK_API = {
  FIELDS: {
    EVENT: 'id,name,description,start_time,end_time,place,cover,event_times',
    PAGE: 'id,name,picture',
  },
  GRAPH_ENDPOINT: 'https://graph.facebook.com/v23.0',
} as const;

export const FACEBOOK_ORIGIN = 'https://facebook.com';

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Facebook specific error codes
  FACEBOOK_TOKEN_INVALID: 190,           // Invalid OAuth Token
  FACEBOOK_PERMISSION_DENIED: 10,        // Permission denied
  FACEBOOK_RATE_LIMIT: 429,              // Rate limit exceeded
} as const;

// Trusted proxies for Express
// check out rate-limit.ts for explanation, but basically we only want to trust requests coming 
// from google/fb/firebase etc, not random proxies on the internet (cloudflare, heroku) that could
// be used to spoof (fake) IP addresses and bypass our rate limits
// "loopback" = localhost (127.0.0.1)
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

export const TOKEN_REFRESH = {
  // Token warning days before expiry
  WARNING_DAYS: 7,
  // Default token expiration (Facebook long-lived tokens expire in 60 days)
  DEFAULT_EXPIRES_DAYS: 60,
  // Token refresh schedule (runs every hour)
  SCHEDULE: '0 * * * *',
  // Timezone for cron job
  TIMEZONE: 'UTC',
  // Alert email for token expiry notifications
  ALERT_EMAIL: process.env.TOKEN_ALERT_EMAIL || 'philippzhuravlev@gmail.com',
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
  SCHEDULE: '0 */4 * * *',
  // Timezone for cron job
  TIMEZONE: 'UTC',
  // Batch size for event writes
  BATCH_SIZE: 100,
  // Maximum number of events to clean up in one query
  MAX_CLEANUP_QUERY: 10000,
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
// RATE LIMITING CONFIGURATION
// ============================================================================

// yk could very well just have been hardcoded as a string in the methods that use it (rate-limiter) 
// but this way it's more consistent; besides, hardcoding strings just feels wrong
export const RATE_LIMIT = {
  STANDARD: {
    // 100 requests per 15 minutes (900 seconds)
    WINDOW_MS: 900 * 1000,
    MAX_REQUESTS: 100,
  },
  
// Webhook Configuration
// so webhooks are a way for facebook to notify us when something changes, principally events, 
// so that we don't have to keep asking facebook "has anything changed?" (which is inefficient and
// could get us rate limited). Instead, facebook just tells us "hey something changed" and then we
// can go and fetch only the __changed__ data - how efficient !
  WEBHOOK: {
    // 1000 requests per minute for webhooks
    WINDOW_MS: 60 * 1000,
    MAX_REQUESTS: 1000,
  },
  OAUTH: {
    // 50 requests per 15 minutes for OAuth endpoints
    WINDOW_MS: 900 * 1000,
    MAX_REQUESTS: 50,
  },
} as const;

export const RATE_LIMITS = RATE_LIMIT; // Alias for backward compatibility

export const TRUSTED_PROXIES = [
  '127.0.0.1',
  '::1',
  // Add production proxy IPs here if needed
] as const;

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
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 10 * 1000,
} as const;

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'http://localhost:8080',
  process.env.WEB_APP_URL || 'http://localhost:3000',
  // Add production origins in environment variables
];

// ============================================================================
// DEPLOYMENT CONFIGURATION
// ============================================================================

export const region = 'europe-west1';

export const URLS = {
  WEB_APP: process.env.WEB_APP_URL || 'http://localhost:3000',
  OAUTH_CALLBACK: process.env.OAUTH_CALLBACK_URL || 'http://localhost:8080/oauth-callback',
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
export const IS_TESTING = process.env.NODE_ENV === 'test';
