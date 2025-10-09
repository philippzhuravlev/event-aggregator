const axios = require('axios');
const { ERROR_CODES } = require('../utils/constants');

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// Services should not be confused with "handlers" that do business logic

// The following services use "axios" which is a http tool that lets us pull from http
// endpoints. We're pulling from a facebook graph api link that lets us get info of interest

// Constants
const FB_API_VERSION = 'v23.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay for exponential backoff

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a token expiry error
 * @param {Error} error - Axios error object
 * @returns {boolean} True if token is expired/invalid
 */
function isTokenExpiredError(error) {
  if (error.response && error.response.data && error.response.data.error) {
    const fbError = error.response.data.error;
    return fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID;
  }
  return false;
}

/**
 * Check if error is retryable (rate limiting or server errors)
 * @param {Error} error - Axios error object
 * @returns {boolean} True if request should be retried
 */
function isRetryableError(error) {
  if (!error.response) return false;
  const status = error.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Wrapper for Facebook API calls with retry logic
 * @param {Function} apiCall - Async function that makes the API call
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise} API response
 */
async function withRetry(apiCall, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      // Don't retry if token is expired or invalid - send out the token
      if (isTokenExpiredError(error)) {
        console.error('Facebook token expired or invalid (error 190)');
        throw error;
      }
      
      // retry on rate limiting or server errors
      if (isRetryableError(error) && attempt < maxRetries) {
        const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        console.warn(`Facebook API error (${error.response.status}), retrying in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
        await sleep(delayMs);
        continue;
      }
      
      // Non-retryable error or max retries exceeded
      throw error;
    }
  }
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
 * @param {string} code - Authorization code from OAuth callback
 * @param {string} appId - Facebook App ID
 * @param {string} appSecret - Facebook App Secret
 * @param {string} redirectUri - OAuth redirect URI
 * @returns {Promise<string>} Short-lived access token
 */
async function exchangeCodeForToken(code, appId, appSecret, redirectUri) {
  const response = await withRetry(async () => {
    return await axios.get(`${FB_BASE_URL}/oauth/access_token`, {
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
 * @param {string} shortLivedToken - Short-lived user access token from initial OAuth
 * @param {string} appId - Facebook App ID
 * @param {string} appSecret - Facebook App Secret
 * @returns {Promise<string>} Long-lived access token (valid for ~60 days)
 */
async function exchangeForLongLivedToken(shortLivedToken, appId, appSecret) {
  const response = await withRetry(async () => {
    return await axios.get(`${FB_BASE_URL}/oauth/access_token`, {
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
 * @param {string} accessToken - User access token
 * @returns {Promise<Array>} Array of page objects with id, name, and access_token
 */
async function getUserPages(accessToken) {
  let allPages = [];
  let nextUrl = `${FB_BASE_URL}/me/accounts`;
  
  // Facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const response = await withRetry(async () => {
      return await axios.get(nextUrl, {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token',
          limit: 100, // Max per page
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
 * @param {string} pageId - Facebook page ID
 * @param {string} accessToken - Page access token
 * @param {string} timeFilter - 'upcoming' or 'past' (default: 'upcoming')
 * @returns {Promise<Array>} Array of event objects
 */
async function getPageEvents(pageId, accessToken, timeFilter = 'upcoming') {
  let allEvents = [];
  let nextUrl = `${FB_BASE_URL}/${pageId}/events`;
  
  // facebook actually splits up results, so we need to follow the "next" reference
  while (nextUrl) {
    const response = await withRetry(async () => {
      return await axios.get(nextUrl, {
        params: {
          access_token: accessToken,
          time_filter: timeFilter,
          // explicitly request cover{source} to ensure Facebook returns the image URL
          fields: 'id,name,description,start_time,end_time,place,cover{source}',
          limit: 100, // Max per page
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
 * @param {string} pageId - Facebook page ID
 * @param {string} accessToken - Page access token
 * @param {number} daysBack - How many days back to fetch past events (default: 30)
 * @returns {Promise<Array>} Combined array of upcoming and recent past events, deduplicated
 */
async function getAllRelevantEvents(pageId, accessToken, daysBack = 30) {
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
  
  console.log(`Found ${upcomingEvents.length} upcoming and ${recentPastEvents.length} recent past events (last ${daysBack} days)`);
  
  return uniqueEvents;
}

module.exports = {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  getPageEvents,
  getAllRelevantEvents,
};
