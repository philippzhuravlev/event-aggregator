import axios, { AxiosError } from 'axios';
import { ERROR_CODES, FACEBOOK, FACEBOOK_API, EVENT_SYNC, SERVER_ERROR_RANGE } from '../utils/constants';
import { logger } from '../utils/logger';
import { FacebookEvent, FacebookPage, FacebookErrorResponse } from '../types';

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// Services should not be confused with "handlers" that do business logic

// The following services use "axios" which is a http tool that lets us pull from http
// endpoints. We're pulling from a facebook graph api link that lets us get info of interest

/**
 * Sleep utility for retry delays
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a token expiry error
 * @param error - Axios error object
 * @returns True if token is expired/invalid
 */
function isTokenExpiredError(error: AxiosError<FacebookErrorResponse>): boolean {
  if (error.response && error.response.data && error.response.data.error) {
    const fbError = error.response.data.error;
    return fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID;
  }
  return false;
}

/**
 * Check if error is retryable (rate limiting or server errors)
 * @param error - Axios error object
 * @returns True if request should be retried
 */
function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return false;
  const status = error.response.status;
  return status === ERROR_CODES.FACEBOOK_RATE_LIMIT || (status >= SERVER_ERROR_RANGE.MIN && status < SERVER_ERROR_RANGE.MAX);
}

/**
 * Wrapper for Facebook API calls with retry logic
 * @param apiCall - Async function that makes the API call
 * @param maxRetries - Maximum retry attempts
 * @returns API response
 */
async function withRetry<T>(apiCall: () => Promise<T>, maxRetries: number = FACEBOOK_API.MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      const axiosError = error as AxiosError<FacebookErrorResponse>;
      
      // Don't retry if token is expired or invalid - send out the token
      if (isTokenExpiredError(axiosError)) {
        const errorCode = axiosError.response && axiosError.response.data && axiosError.response.data.error ?
          axiosError.response.data.error.code :
          'unknown';
        logger.error('Facebook token expired or invalid', axiosError as Error, { errorCode });
        throw error;
      }
      
      // retry on rate limiting or server errors
      if (isRetryableError(axiosError) && attempt < maxRetries) {
        const delayMs = FACEBOOK_API.RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        const status = axiosError.response ? axiosError.response.status : 'unknown';
        logger.warn('Facebook API error - retrying with backoff', {
          status,
          delayMs,
          attempt,
          maxRetries,
        });
        await sleep(delayMs);
        continue;
      }
      
      // Non-retryable error or max retries exceeded
      throw error;
    }
  }
  throw new Error('Unreachable code'); // TypeScript needs this
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
 * Selfexplanatory: Gets auth code for short-lived user access token
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
  redirectUri: string
): Promise<string> {
  const response = await withRetry(async () => {
    return await axios.get(`${FACEBOOK.BASE_URL}/oauth/access_token`, {
      params: { // the actual info we're pulling
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code: code,
      },
    });
  });
  
  if (!response.data.access_token) {
    throw new Error('No access token received from Facebook');
  }
  
  return response.data.access_token;
}


/**
 * Exchange a short-lived user access token for a long-lived token (60 days). Simple as.
 * @param shortLivedToken - Short-lived user access token from initial OAuth
 * @param appId - Facebook App ID
 * @param appSecret - Facebook App Secret
 * @returns Long-lived access token (valid for ~60 days)
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string, 
  appId: string, 
  appSecret: string
): Promise<string> {
  const response = await withRetry(async () => {
    return await axios.get(`${FACEBOOK.BASE_URL}/oauth/access_token`, {
      params: { // the actual info we're pulling
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
  });
  
  if (!response.data.access_token) {
    throw new Error('No long-lived token received from Facebook');
  }
  
  return response.data.access_token;
}

/**
 * Get all Facebook pages the user manages (with pagination support)
 * @param accessToken - User access token
 * @returns Array of page objects with id, name, and access_token
 */
export async function getUserPages(accessToken: string): Promise<FacebookPage[]> {
  let allPages: FacebookPage[] = [];
  let nextUrl: string | null = `${FACEBOOK.BASE_URL}/me/accounts`;
  
  // Facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const response = await withRetry(async () => {
      return await axios.get(nextUrl!, {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token',
          limit: FACEBOOK_API.PAGINATION_LIMIT, // Max per page
        },
      });
    });
    
    const pages = response.data.data || [];
    allPages = allPages.concat(pages);
    
    // Check if there's a next page
    nextUrl = response.data.paging && response.data.paging.next ? response.data.paging.next : null;
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
  timeFilter: 'upcoming' | 'past' = 'upcoming'
): Promise<FacebookEvent[]> {
  let allEvents: FacebookEvent[] = [];
  let nextUrl: string | null = `${FACEBOOK.BASE_URL}/${pageId}/events`;
  
  // facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const response = await withRetry(async () => {
      return await axios.get(nextUrl!, {
        params: {
          access_token: accessToken,
          time_filter: timeFilter,
          // explicitly request cover{source} to ensure Facebook returns the image URL
          fields: 'id,name,description,start_time,end_time,place,cover{source}',
          limit: FACEBOOK_API.PAGINATION_LIMIT, // Max per page
        },
      });
    });
    
    const events = response.data.data || [];
    allEvents = allEvents.concat(events);
    
    // Check if there's a next page
    nextUrl = response.data.paging && response.data.paging.next ? response.data.paging.next : null;
  }
  
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
  daysBack: number = EVENT_SYNC.PAST_EVENTS_DAYS
): Promise<FacebookEvent[]> {
  // events **past** and **upcoming**
  const upcomingEvents = await getPageEvents(pageId, accessToken, 'upcoming');
  const pastEvents = await getPageEvents(pageId, accessToken, 'past');
  
  // filter **past** events to only include those within the specified time window (e.g., last 30 days)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffTime = cutoffDate.getTime();
  
  const recentPastEvents = pastEvents.filter(event => {
    if (!event.start_time) return false;
    const eventTime = new Date(event.start_time).getTime();
    return eventTime >= cutoffTime;
  });
  
  // combine and remove duplicate (in case an event appears in both lists)
  const allEvents = [...upcomingEvents, ...recentPastEvents];
  const uniqueEvents = Array.from(
    new Map(allEvents.map(event => [event.id, event])).values()
  );
  
  logger.debug('Retrieved events from Facebook API', {
    pageId,
    upcomingCount: upcomingEvents.length,
    recentPastCount: recentPastEvents.length,
    daysBack,
    totalUnique: uniqueEvents.length,
  });
  
  return uniqueEvents;
}