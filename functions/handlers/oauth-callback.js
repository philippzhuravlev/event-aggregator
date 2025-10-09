const admin = require('firebase-admin');
const { exchangeCodeForToken, exchangeForLongLivedToken, getUserPages, getPageEvents } = require('../services/facebook-api');
const { storePageToken, getPageToken } = require('../services/secret-manager');
const { savePage, batchWriteEvents } = require('../services/firestore-service');
const { processEventCoverImage, initializeStorageBucket } = require('../services/image-service');
const { normalizeEvent } = require('../utils/event-normalizer');
const { URLS, ERROR_CODES } = require('../utils/constants');

// NB: "Handlers" execute business logic. "Services" connect something
// an existing service, e.g. facebook or google secrets manager
// here we use a lot of dedicated service scripts from our facebook service 
// in /functions/services

/**
 * Does the OAuth callback from Facebook after a user agrees to page access. It does:
 * 1. Gets code from Facebook
 * 2. Exchanges code for short-lived token
 * 3. Exchanges short-lived token for long-lived token (60 days)
 * 4. Gets user's Facebook Pages with token
 * 5. Puts page tokens securely in Secret Manager
 * 6. Puts page metadata in Firestore
 * 7. helpfully places data directly
 * @param {Object} req - HTTP request object (contains .query with Facebook's response)
 * @param {Object} res - HTTP response object (use .redirect() to send user back)
 * @param {string} appId - Facebook App ID (from secrets)
 * @param {string} appSecret - Facebook App Secret (from secrets)
 */
async function handleOAuthCallback(req, res, appId, appSecret) {
  // this entire section is about figuring out which url "prefix" (localhost, dtuevent.dk etc)
  // is used and then redirect back to that
  let redirectBase = URLS.WEB_APP;
  try {
    const { code, error, state } = req.query; // again, a request object
    // state parameters ("state" below) are used to maintain state between the request and 
    // callback so it doesnt get hijacked or messed up along the way
    if (state) {
      try {
        const decodedState = decodeURIComponent(state);
        const stateUrl = new URL(decodedState);
        redirectBase = stateUrl.origin;
        console.log('Using redirect URL from state parameter:', redirectBase);
      } catch (e) {
        console.warn('Failed to parse state parameter as URL:', state);
      }
    } else if (req.headers.referer) {
      // Fall back to referer header
      try {
        const refererUrl = new URL(req.headers.referer);
        redirectBase = refererUrl.origin;
        console.log('Using redirect URL from referer header:', redirectBase);
      } catch (e) {
        console.warn('Failed to parse referer header:', req.headers.referer);
      }
    }
    
    // error handling
    if (error) {
      console.error('Facebook OAuth error:', error);
      return res.redirect(`${redirectBase}/?error=oauth_failed`);
    }
    if (!code) {
      console.error('Missing authorization code');
      return res.redirect(`${redirectBase}/?error=missing_code`);
    }

    // 1: get code for short-lived token
    // uses firebook-api service in /functions/service
    const shortLivedToken = await exchangeCodeForToken(code, appId, appSecret, URLS.OAUTH_CALLBACK);
    
    // 2: get code for long-lived token (60 days)
    // also uses firebook-api service also in /functions/service
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken, appId, appSecret);

    // 3: get user's pages with token
    // this is now done thru firestore-service service
    const pages = await getUserPages(longLivedToken);
    if (pages.length === 0) {
      return res.redirect(`${redirectBase}/?error=no_pages`);
    }

    // Step 4: Store page tokens in Secret Manager and metadata in Firestore
    const db = admin.firestore(); // 'firebase-admin' 

    for (const page of pages) {
      // store page also thru our firestore-service service
      await storePageToken(page.id, page.access_token);
      
      // save page metadata to firestore also thru firebase service
      await savePage(db, page.id, {
        name: page.name,
      });
    }

    // step 5: Initialize storage bucket for image processing
    let storageBucket = null;
    try {
      storageBucket = initializeStorageBucket();
      console.log('Storage bucket initialized for OAuth event image processing');
    } catch (error) {
      console.warn('Storage bucket not available during OAuth; will use original Facebook URLs:', error.message);
    }

    // step 6: Fetch and store events for each page
    let totalEvents = 0;
    const eventData = [];

    for (const page of pages) {
      try {
        // get token thru secret-manager service in /functions/service
        const accessToken = await getPageToken(page.id);
        if (!accessToken) {
          console.warn(`Could not retrieve token for page ${page.id}`);
          continue;
        }
        // get events this time thru facebook-api
        let events;
        try {
          events = await getPageEvents(page.id, accessToken);
        } catch (eventError) {
          // Check if it's a token expiry error (Facebook error code 190)
          if (eventError.response && eventError.response.data && eventError.response.data.error) {
            const fbError = eventError.response.data.error;
            if (fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
              console.error(`Token expired for page ${page.name} (${page.id}) during OAuth. Marking as inactive.`);
              // Mark the page as inactive so it won't be synced until re-authorized
              await savePage(db, page.id, { active: false });
              continue; // Skip to next page
            }
          }
          // Re-throw if it's not a token error
          throw eventError;
        }
        
        // normalization before putting into Firestore
        for (const event of events) {
          // process cover image using the image service util inside /utils/ to connect between facebook and firestore
          let coverImageUrl = null;
          if (storageBucket) {
            try {
              coverImageUrl = await processEventCoverImage(event, page.id, storageBucket);
            } catch (error) {
              console.warn(`Image processing failed for event ${event.id} during OAuth:`, error.message);
              // Fallback to original Facebook URL
              coverImageUrl = event.cover ? event.cover.source : undefined;
            }
          } else {
            // No storage available, use original URL
            coverImageUrl = event.cover ? event.cover.source : undefined;
          }

          // Use centralized normalizer for consistent schema
          const normalized = normalizeEvent(event, page.id, coverImageUrl);

          eventData.push({
            id: event.id,
            data: normalized,
          });
          totalEvents++;
        }
      } catch (eventError) {
        console.warn(`Failed to fetch events for page ${page.id}:`, eventError.message);
      }
    }

    if (eventData.length > 0) {
      await batchWriteEvents(db, eventData);
      console.log(`Success. Stored ${totalEvents} events in Firestore`);
    }

    // redirect back upon success
    res.redirect(`${redirectBase}/?success=true&pages=${pages.length}&events=${totalEvents}`);

    // boilerplate catch statment
  } catch (error) {
    console.error('Facebook OAuth callback error:', error.message || error);
    // Use the same redirectBase if it was determined earlier, otherwise fallback
    const fallbackRedirect = redirectBase || URLS.WEB_APP;
    res.redirect(`${fallbackRedirect}/?error=callback_failed`);
  }
}

module.exports = { handleOAuthCallback };