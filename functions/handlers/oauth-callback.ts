import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { exchangeCodeForToken, exchangeForLongLivedToken, getUserPages, getAllRelevantEvents } from '../services/facebook-api';
import { storePageToken, getPageToken } from '../services/secret-manager';
import { savePage, batchWriteEvents } from '../services/firestore-service';
import { processEventCoverImage, initializeStorageBucket } from '../services/image-service';
import { normalizeEvent } from '../utils/event-normalizer';
import { URLS, ERROR_CODES } from '../utils/constants';
import { logger } from '../utils/logger';
import { EventBatchItem } from '../types';

// NB: "Handlers" like execute business logic; they "do something", like
// // syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// So handlers "do something", in this case handle the oauth callback from facebook;
// what this actually means is that you click "connect to facebook" on the web app, which
// redirects you to facebook's page where you click "allow" to give access to your pages;
// the process of reading facebook's link (response) is callback

/**
 * Does the OAuth callback from Facebook after a user agrees to page access. It does:
 * 1. Gets code from Facebook
 * 2. Exchanges code for short-lived token
 * 3. Exchanges short-lived token for long-lived token (60 days)
 * 4. Gets user's Facebook Pages with token
 * 5. Puts page tokens securely in Secret Manager
 * 6. Puts page metadata in Firestore
 * 7. helpfully places data directly
 * @param req - HTTP request object (contains .query with Facebook's response)
 * @param res - HTTP response object (use .redirect() to send user back)
 * @param appId - Facebook App ID (from secrets)
 * @param appSecret - Facebook App Secret (from secrets)
 */
export async function handleOAuthCallback(
  req: Request, 
  res: any, 
  appId: string, 
  appSecret: string
): Promise<void> {
  // this entire section is about figuring out which url "prefix" (localhost, dtuevent.dk etc)
  // is used and then redirect back to that
  let redirectBase = URLS.WEB_APP;
  try {
    const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
    // state parameters ("state" below) are used to maintain state between the request and 
    // callback so it doesnt get hijacked or messed up along the way
    if (state) {
      try {
        const decodedState = decodeURIComponent(state);
        const stateUrl = new URL(decodedState);
        redirectBase = stateUrl.origin;
        logger.debug('Using redirect URL from state parameter', { redirectBase });
      } catch (e: any) {
        logger.warn('Failed to parse state parameter as URL', { state, error: e.message });
      }
    } else if (req.headers.referer) {
      // Fall back to referer header
      try {
        const refererUrl = new URL(req.headers.referer);
        redirectBase = refererUrl.origin;
        logger.debug('Using redirect URL from referer header', { redirectBase });
      } catch (e: any) {
        logger.warn('Failed to parse referer header', { referer: req.headers.referer, error: e?.message });
      }
    }
    
    // error handling
    if (error) {
      logger.error('Facebook OAuth error from callback', null, { 
        facebookError: error,
        redirectBase 
      });
      res.redirect(`${redirectBase}/?error=oauth_failed`);
      return;
    }
    if (!code) {
      logger.error('Missing authorization code in OAuth callback', null, { redirectBase });
      res.redirect(`${redirectBase}/?error=missing_code`);
      return;
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
      res.redirect(`${redirectBase}/?error=no_pages`);
      return;
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
    let storageBucket: any = null;
    try {
      storageBucket = initializeStorageBucket();
      logger.info('Storage bucket initialized for OAuth event image processing');
    } catch (error: any) {
      logger.warn('Storage bucket not available during OAuth - using Facebook URLs', { 
        error: error.message 
      });
    }

    // step 6: Fetch and store events for each page
    let totalEvents = 0;
    const eventData: EventBatchItem[] = [];

    for (const page of pages) {
      try {
        // get token thru secret-manager service in /functions/service
        const accessToken = await getPageToken(page.id);
        if (!accessToken) {
          logger.warn('Could not retrieve token for page during OAuth', {
            pageId: page.id,
            pageName: page.name,
          });
          continue;
        }
        // get events this time thru facebook-api (upcoming + last 30 days)
        let events;
        try {
          events = await getAllRelevantEvents(page.id, accessToken, 30);
        } catch (eventError: any) {
          // Check if it's a token expiry error (Facebook error code 190)
          if (eventError.response && eventError.response.data && eventError.response.data.error) {
            const fbError = eventError.response.data.error;
            if (fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
              logger.error('Token expired during OAuth - marking page inactive', eventError, {
                pageId: page.id,
                pageName: page.name,
                facebookErrorCode: fbError.code,
              });
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
          let coverImageUrl: string | null = null;
          if (storageBucket) {
            try {
              coverImageUrl = await processEventCoverImage(event, page.id, storageBucket);
            } catch (error: any) {
              logger.warn('Image processing failed during OAuth - using Facebook URL', {
                eventId: event.id,
                pageId: page.id,
                error: error.message,
              });
              // Fallback to original Facebook URL
              coverImageUrl = event.cover ? event.cover.source : null;
            }
          } else {
            // No storage available, use original URL
            coverImageUrl = event.cover ? event.cover.source : null;
          }

          // Use centralized normalizer for consistent schema
          const normalized = normalizeEvent(event, page.id, coverImageUrl);

          eventData.push({
            id: event.id,
            data: normalized,
          });
          totalEvents++;
        }
      } catch (eventError: any) {
        logger.error('Failed to fetch events for page during OAuth', eventError, {
          pageId: page.id,
          pageName: page.name,
        });
      }
    }

    if (eventData.length > 0) {
      await batchWriteEvents(db, eventData);
      logger.info('OAuth callback completed - events stored', {
        totalEvents,
        totalPages: pages.length,
      });
    }

    // redirect back upon success
    logger.info('OAuth flow completed successfully', {
      pages: pages.length,
      events: totalEvents,
      redirectBase,
    });
    res.redirect(`${redirectBase}/?success=true&pages=${pages.length}&events=${totalEvents}`);

    // boilerplate catch statment
  } catch (error: any) {
    logger.error('Facebook OAuth callback failed', error, { redirectBase });
    // Use the same redirectBase if it was determined earlier, otherwise fallback
    const fallbackRedirect = redirectBase || URLS.WEB_APP;
    res.redirect(`${fallbackRedirect}/?error=callback_failed`);
  }
}

