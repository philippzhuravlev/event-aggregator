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
    EVENT:
      "id,name,description,start_time,end_time,place,cover,event_times",
    PAGE: "id,name,picture",
  },
  GRAPH_ENDPOINT: `https://${FACEBOOK.BASE_URL}/${FACEBOOK.API_VERSION}`,
} as const;

export const FACEBOOK_ORIGIN = "https://facebook.com" as const;

export const IMAGE_SERVICE = {
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30 * 1000,
  CACHE_MAX_AGE: 31 * 24 * 60 * 60,
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  BACKOFF_BASE_MS: 1000,
  BACKOFF_MAX_MS: 10 * 1000,
} as const;

export const API_TIMEOUT_MS = 10_000;

