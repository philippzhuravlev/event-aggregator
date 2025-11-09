/// <reference lib="dom" />
import {
  ERROR_CODES,
  EVENT_SYNC,
  FACEBOOK,
  SERVER_ERROR_RANGE,
} from "../utils/constants-util";
import {
  FacebookErrorResponse,
  FacebookEvent,
  FacebookPage,
  PaginatedEventResponse,
  PaginatedPageResponse,
} from "../types";
import { logger } from "./logger-service";

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, Supabase and
// secrets manager. The term could also mean like an internal service, e.g.
// authentication or handling tokens, but here we've outsourced it to supabase/meta
// Services should not be confused with "handlers" that do business logic

// Deno is the "upgraded" version of Node.js by the same original author, Ryan Dahl. It's
// more secure, has first-class TS support, and is used for Supabase Edge Functions.
// Edge functions are serverless functions (i.e. functions that run in the cloud) and
// distributed worldwide rather than from a single data center. In Deno/Edge Functions,
// environment variables are accessed via Deno.env. Also, we don't use Node.js' built-in
// axios or fetch - Deno has its own global fetch implementation

/**
 * Sleep utility for retry delays
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is a token expiry error
 * @param status - HTTP status code
 * @param data - Response data
 * @returns True if token is expired/invalid
 */
function isTokenExpiredError(
  status: number,
  data: FacebookErrorResponse,
): boolean {
  if (data?.error) {
    return data.error.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID;
  }
  return status === 401; // Unauthorized
}

/**
 * Check if error is retryable (rate limiting or server errors)
 * @param status - HTTP status code
 * @returns True if request should be retried
 */
function isRetryableError(status: number): boolean {
  return status === ERROR_CODES.FACEBOOK_RATE_LIMIT ||
    (status >= SERVER_ERROR_RANGE.MIN && status < SERVER_ERROR_RANGE.MAX);
}

/**
 * Wrapper for Facebook API calls with retry logic using fetch
 * @param apiCall - Async function that makes the API call
 * @param maxRetries - Maximum retry attempts
 * @returns API response as JSON
 */
async function withRetry<T>(
  apiCall: () => Promise<Response>,
  maxRetries: number = FACEBOOK.MAX_RETRIES,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await apiCall();

      if (!response.ok) {
        const data = await response.json() as FacebookErrorResponse;

        // Don't retry if token is expired or invalid - throw immediately
        if (isTokenExpiredError(response.status, data)) {
          const errorCode = data?.error?.code || "unknown";
          logger.error("Facebook token expired or invalid", null, {
            errorCode,
            status: response.status,
          });
          throw new Error(`Facebook token invalid (${errorCode})`);
        }

        // Retry on rate limiting or server errors
        if (isRetryableError(response.status) && attempt < maxRetries) {
          const delayMs = FACEBOOK.RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn("Facebook API error - retrying with backoff", {
            status: response.status,
            delayMs,
            attempt,
            maxRetries,
          });
          await sleep(delayMs);
          continue;
        }

        // Non-retryable error or max retries exceeded
        throw new Error(
          `Facebook API error: ${response.status} - ${
            data?.error?.message || "Unknown error"
          }`,
        );
      }

      return await response.json() as T;
    } catch (error) {
      // If it's not a Response error, might be a network error
      if (
        attempt < maxRetries &&
        !(error instanceof Error && error.message.includes("token"))
      ) {
        const delayMs = FACEBOOK.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn("Facebook API request failed - retrying", {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          maxRetries,
        });
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable code"); // TypeScript needs this
}

// Unique params used across Facebook API calls:
// client_id: Facebook App ID
// client_secret: Facebook App Secret
// redirect_uri: Facebook sends users after OAuth
// code: One-time authorization code from OAuth (transported thru URL)
// grant_type: Token exchange type (e.g., 'fb_exchange_token')
// fb_exchange_token: Short-lived token to trade in
// access_token: Bearer token for API access
// time_filter: 'upcoming' or 'past' for events
// fields: Comma-separated list of data fields to return

/**
 * Gets auth code for short-lived user access token
 * @param code - Authorization code from OAuth callback
 * @param appId - Facebook App ID
 * @param appSecret - Facebook App Secret
 * @param redirectUri - OAuth redirect URI
 * @returns Short-lived access token
 */
export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string,
): Promise<string> {
  // this is the URI params format built into js
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code: code,
  });

  const data = await withRetry<{ access_token: string }>(async () => {
    return await fetch(`${FACEBOOK.BASE_URL}/oauth/access_token?${params}`);
  });

  if (!data.access_token) {
    throw new Error("No access token received from Facebook");
  }

  return data.access_token;
}

/**
 * Exchange a short-lived user access token for a long-lived token (60 days)
 * @param shortLivedToken - Short-lived user access token from initial OAuth
 * @param appId - Facebook App ID
 * @param appSecret - Facebook App Secret
 * @returns Long-lived access token (valid for ~60 days)
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const data = await withRetry<{ access_token: string }>(async () => {
    return await fetch(`${FACEBOOK.BASE_URL}/oauth/access_token?${params}`);
  });

  if (!data.access_token) {
    throw new Error("No long-lived token received from Facebook");
  }

  return data.access_token;
}

/**
 * Get all Facebook pages the user manages (with pagination support)
 * @param accessToken - User access token
 * @returns Array of page objects with id, name, and access_token
 */
export async function getUserPages(
  accessToken: string,
): Promise<FacebookPage[]> {
  let allPages: FacebookPage[] = [];
  let nextUrl: string | null = `${FACEBOOK.BASE_URL}/me/accounts`;

  // Facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,access_token",
      limit: String(FACEBOOK.PAGINATION_LIMIT),
    });

    const currentUrl: string = nextUrl.includes("?")
      ? nextUrl
      : `${nextUrl}?${params}`;

    const response = await withRetry<PaginatedPageResponse>(async () => {
      return await fetch(currentUrl);
    });

    const pages = response.data || [];
    allPages = allPages.concat(pages);

    // Check if there's a next page
    nextUrl = response.paging?.next || null;
  }

  return allPages;
}

/**
 * Get events for a specific Facebook page (with pagination support)
 * @param pageId - Facebook page ID
 * @param accessToken - Page access token
 * @param timeFilter - 'upcoming' or 'past' (default: 'upcoming')
 * @returns Array of event objects
 */
export async function getPageEvents(
  pageId: string,
  accessToken: string,
  timeFilter: "upcoming" | "past" = "upcoming",
): Promise<FacebookEvent[]> {
  let allEvents: FacebookEvent[] = [];
  let nextUrl: string | null = `${FACEBOOK.BASE_URL}/${pageId}/events`;

  logger.info(`Fetching ${timeFilter} events for page ${pageId}`);

  // Facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const params = new URLSearchParams({
      access_token: accessToken,
      time_filter: timeFilter,
      // explicitly request cover{source} to ensure Facebook returns the image URL
      fields: "id,name,description,start_time,end_time,place,cover{source}",
      limit: String(FACEBOOK.PAGINATION_LIMIT),
    });

    const currentUrl: string = nextUrl.includes("?")
      ? nextUrl
      : `${nextUrl}?${params}`;

    try {
      const response = await withRetry<PaginatedEventResponse>(async () => {
        return await fetch(currentUrl);
      });

      const events = response.data || [];
      logger.info(`Got ${events.length} ${timeFilter} events for page ${pageId} in this batch`);
      allEvents = allEvents.concat(events);

      // Check if there's a next page
      nextUrl = response.paging?.next || null;
    } catch (error) {
      logger.error(`Error fetching ${timeFilter} events for page ${pageId}`, error);
      nextUrl = null; // Stop pagination on error
    }
  }

  logger.info(`Total ${timeFilter} events for page ${pageId}: ${allEvents.length}`);
  return allEvents;
}

/**
 * Get all relevant events for a page: upcoming events + recent past events (last 30 days)
 * @param pageId - Facebook page ID
 * @param accessToken - Page access token
 * @param daysBack - How many days back to fetch past events (default: 30)
 * @returns Combined array of upcoming and recent past events, deduplicated
 */
export async function getAllRelevantEvents(
  pageId: string,
  accessToken: string,
  daysBack: number = EVENT_SYNC.PAST_EVENTS_DAYS,
): Promise<FacebookEvent[]> {
  logger.info(`Getting all relevant events for page ${pageId} (lookback: ${daysBack} days)`);
  
  // Get events: past and upcoming
  const upcomingEvents = await getPageEvents(pageId, accessToken, "upcoming");
  const pastEvents = await getPageEvents(pageId, accessToken, "past");

  // Filter past events to only include those within the specified time window (e.g., last 30 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTime = cutoffDate.getTime();

  const recentPastEvents = pastEvents.filter((event) => {
    if (!event.start_time) return false;
    const eventTime = new Date(event.start_time).getTime();
    return eventTime >= cutoffTime;
  });

  logger.info(`Filtered ${pastEvents.length} past events down to ${recentPastEvents.length} recent ones`);

  // Combine and remove duplicates (in case an event appears in both lists)
  const allEvents = [...upcomingEvents, ...recentPastEvents];
  const uniqueEvents = Array.from(
    new Map(allEvents.map((event) => [event.id, event])).values(),
  );

  logger.info("Retrieved events from Facebook API", {
    pageId,
    upcomingCount: upcomingEvents.length,
    recentPastCount: recentPastEvents.length,
    daysBack,
    totalUnique: uniqueEvents.length,
  });

  return uniqueEvents;
}
