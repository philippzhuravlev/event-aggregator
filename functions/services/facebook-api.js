const axios = require('axios');

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
  const response = await axios.get(`${FB_BASE_URL}/oauth/access_token`, {
    params: { // the actual info we're pulling
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: code,
    },
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
  const response = await axios.get(`${FB_BASE_URL}/oauth/access_token`, {
    params: { // the actual info we're pulling
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  
  if (!response.data.access_token) {
    throw new Error('No long-lived token received from Facebook');
  }
  
  return response.data.access_token;
}

/**
 * Get all Facebook pages the user manages
 * @param {string} accessToken - User access token
 * @returns {Promise<Array>} Array of page objects with id, name, and access_token
 */
async function getUserPages(accessToken) {
  const response = await axios.get(`${FB_BASE_URL}/me/accounts`, {
    params: {
      access_token: accessToken,
      fields: 'id,name,access_token',
    },
  });
  
  return response.data.data || [];
}

/**
 * Get events for a specific Facebook page
 * @param {string} pageId - Facebook page ID
 * @param {string} accessToken - Page access token
 * @param {string} timeFilter - 'upcoming' or 'past' (default: 'upcoming')
 * @returns {Promise<Array>} Array of event objects
 */
async function getPageEvents(pageId, accessToken, timeFilter = 'upcoming') {
  const response = await axios.get(`${FB_BASE_URL}/${pageId}/events`, {
    params: {
      access_token: accessToken,
      time_filter: timeFilter,
      // Explicitly request cover{source} to ensure Facebook returns the image URL
      fields: 'id,name,description,start_time,end_time,place,cover{source}',
    },
  });
  
  return response.data.data || [];
}

module.exports = {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getUserPages,
  getPageEvents,
};
