const admin = require('firebase-admin');
const { exchangeCodeForToken, exchangeForLongLivedToken, getUserPages, getPageEvents } = require('../services/facebook-api');
const { storePageToken, getPageToken } = require('../services/secret-manager');
const { savePage, batchWriteEvents } = require('../services/firestore-service');

// App URLs
const APP_BASE_URL = 'https://dtuevent-8105b.web.app';
const CALLBACK_URL = 'https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback';

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
  try {
    const { code, error } = req.query; // again, a request object
    
    // error handling
    if (error) {
      console.error('Facebook OAuth error:', error);
      return res.redirect(`${APP_BASE_URL}/?error=oauth_failed`);
    }
    if (!code) {
      console.error('Missing authorization code');
      return res.redirect(`${APP_BASE_URL}/?error=missing_code`);
    }

    // 1: get code for short-lived token
    // uses firebook-api service in /functions/service
    const shortLivedToken = await exchangeCodeForToken(code, appId, appSecret, CALLBACK_URL);
    
    // 2: get code for long-lived token (60 days)
    // also uses firebook-api service also in /functions/service
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken, appId, appSecret);

    // 3: get user's pages with token
    // this is now done thru firestore-service service
    const pages = await getUserPages(longLivedToken);
    if (pages.length === 0) {
      return res.redirect(`${APP_BASE_URL}/?error=no_pages`);
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

    // step 5: Fetch and store events for each page
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
        const events = await getPageEvents(page.id, accessToken);
        
        // normalization before putting into Firestore
        for (const event of events) {
          const nowIso = new Date().toISOString();
          // extract place data if it exists
          const placeData = event.place ? {
            name: event.place.name,
            location: event.place.location,
          } : undefined;
          
          // drop undefined values (Firestore doesn't accept them)
          const normalized = Object.fromEntries(
            Object.entries({
              id: event.id,
              pageId: page.id,
              title: event.name,
              description: event.description,
              startTime: event.start_time,
              endTime: event.end_time,
              place: placeData,
              coverImageUrl: event.cover ? event.cover.source : undefined,
              eventURL: `https://facebook.com/events/${event.id}`,
              createdAt: nowIso,
              updatedAt: nowIso,
            }).filter(([, v]) => v !== undefined)
          );
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
    res.redirect(`${APP_BASE_URL}/?success=true&pages=${pages.length}&events=${totalEvents}`);

    // boilerplate catch statment
  } catch (error) {
    console.error('Facebook OAuth callback error:', error.message || error);
    res.redirect(`${APP_BASE_URL}/?error=callback_failed`);
  }
}

module.exports = { handleOAuthCallback };