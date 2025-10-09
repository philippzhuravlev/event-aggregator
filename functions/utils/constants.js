// So this is a util, a helper function that is neither "what to do" (handler) nor 
// "how to connect to an external service" (service). It just does pure logic that 
// either makes sense to compartmentalize or is used in multiple places.

// So this util is just a list of constants - quite convenient to have them all in one place
// rather than scattered around the codebase. It also makes it easier to change them
// later on, e.g. if Facebook changes their API version or if we want to adjust sync
// frequency or error codes etc etc you get the idea

// Facebook API
const FACEBOOK = {
  API_VERSION: 'v23.0',
  BASE_URL: 'https://graph.facebook.com/v23.0',
  pageUrl: (pageId) => `https://facebook.com/${pageId}`,
  eventUrl: (eventId) => `https://facebook.com/events/${eventId}`,
};

// App URLs (environment-specific)
// so we're hardcoding the URLs here, but this is a fallback in case the env vars aren't set.
// the urls aren't super secret but it's good practice to keep them in env vars anyway
const URLS = {
  WEB_APP: process.env.WEB_APP_URL || 'https://dtuevent-8105b.web.app',
  OAUTH_CALLBACK: process.env.OAUTH_CALLBACK_URL || 'https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback',
};

// Image Service from Facebook
const IMAGE_SERVICE = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000, // 30 seconds
  CACHE_MAX_AGE: 31536000, // 1 year in seconds
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  BACKOFF_BASE_MS: 1000, // Base delay for exponential backoff (1 second)
  BACKOFF_MAX_MS: 10000, // Maximum delay for exponential backoff (10 seconds)
};

// Sync 
const SYNC = {
  SCHEDULE: 'every 12 hours',
  TIMEZONE: 'Etc/UTC',
};

// Firestore limits
const FIRESTORE = {
  MAX_BATCH_SIZE: 500, // i.e the max operations per batch write
};

// Error codes
const ERROR_CODES = {
  FACEBOOK_TOKEN_INVALID: 190, // Facebook's error code for invalid/expired token
  FACEBOOK_PERMISSION_DENIED: 200,
  FACEBOOK_RATE_LIMIT: 429,
};

module.exports = {
  FACEBOOK,
  URLS,
  IMAGE_SERVICE,
  SYNC,
  FIRESTORE,
  ERROR_CODES,
};
