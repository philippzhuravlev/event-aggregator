import { Request, Response } from 'express';
import { exchangeCodeForToken, exchangeForLongLivedToken, getUserPages, getAllRelevantEvents } from '../services/facebook-api';
import { storePageToken, getPageToken, savePage, batchWriteEvents } from '../services/supabase-service';
import { normalizeEvent } from '../utils/event-normalizer';
import { logger } from '../utils/logger';
import { verifyStateHmac } from '../utils/oauth';
import { oauthCallbackQuerySchema } from '../schemas/oauth-callback.schema';
import { URLS, ERROR_CODES } from '../utils/constants';
import type { EventBatchItem } from '../types';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

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
 * 6. Puts page metadata in Supabase
 * 7. helpfully places data directly
 * @param req - HTTP request object (contains .query with Facebook's response)
 * @param res - HTTP response object (use .redirect() to send user back)
 * @param appId - Facebook App ID (from secrets)
 * @param appSecret - Facebook App Secret (from secrets)
 */
export async function handleOAuthCallback(
  req: Request, 
  res: Response, 
  appId: string, 
  appSecret: string
): Promise<void> {
  const supabase = (req as any).supabase;
  // Here, we use a Node module called Zod which lets us define so-called "schemas"; they're kind of like
  // "types" in that they're blueprints for data, but schemas relate not the data's type (string, number, 
  // boolean etc) but also its structure, so it'll fit nicely in our database and not have missing fields etc.
  // The schema itself is defined in functions/schemas/oauth-callback.schema.ts. 

  const parsed = oauthCallbackQuerySchema.safeParse(req.query);
  const { code, error, state } = parsed.success
    ? parsed.data
    : { // falling back to raw values if parsing fails; this is mostly for testing
        code: (req.query && (req.query.code as string)) || undefined,
        error: (req.query && (req.query.error as string)) || undefined,
        state: (req.query && (req.query.state as string)) || undefined,
      };
  
  // this entire section is about figuring out which url "prefix" (localhost, dtuevent.dk etc)
  // is used and then redirect back to that
  let redirectBase = URLS.WEB_APP;
  try {
    // state parameters ("state" below) are used to maintain state between the request and 
    // callback so it doesnt get hijacked or messed up along the way
    if (state) { // = if state param is present
      try {
        // Here, we do HMAC verification. What is that? Well HMAC (Hash-based Message Authentication Code) is
        // what you do to a state param to make sure that it hasn't been tampered with - it's a security thing.
        // Basically, the way it works is that you take the state param, hash it with a secret key (our app secret),
        // and then compare that hash to the one sent along with the state param. Actually quite simple, but with a 
        // scary name, as per usual in programming and security.

        // The general format of our HMAC-ified state param is:
        // state = ncode(original_state) + '|' + hmac_signature
        // where original_state is the actual state data (like redirect URL), and hmac_signature is the HMAC hash
        // we generated in the first place using our Facebook App secret ("appSecret"). The '|' is just a separator.
        let payload = state;
        if (state.includes('|')) {
          const [encodedPayload, sig] = state.split('|', 2); // Separate
          // verify signature using appSecret; if invalid, reject
          const ok = verifyStateHmac(encodedPayload, sig, appSecret);
          if (!ok) {
            logger.warn('OAuth state HMAC verification failed', { state });
            res.redirect(`${redirectBase}/?error=invalid_state`);
            return;
          }
          // else:
          payload = encodedPayload;
        }

        const decodedState = decodeURIComponent(payload);
        const stateUrl = new URL(decodedState);
        redirectBase = stateUrl.origin;
        logger.debug('Using redirect URL from state parameter', { redirectBase });
      } catch (err: any) {
        logger.warn('Failed to parse state parameter as URL', { state, error: err?.message });
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
    // uses supabase-api service in /functions/service
    const shortLivedToken = await exchangeCodeForToken(code, appId, appSecret, URLS.OAUTH_CALLBACK);
    
    // 2: get code for long-lived token (60 days)
    // also uses supabase-api service also in /functions/service
    const longLivedToken = await exchangeForLongLivedToken(shortLivedToken, appId, appSecret);

    // 3: get user's pages with token
    // this is now done thru supabase-api service
    const pages = await getUserPages(longLivedToken);
    if (pages.length === 0) {
      res.redirect(`${redirectBase}/?error=no_pages`);
      return;
    }

        // Step 4: Store page tokens in Secret Manager and metadata in Supabase
        for (const page of pages) {
          // store page also thru our supabase-api service
          await storePageToken(supabase, page.id, page.access_token);

          // save page metadata to supabase also thru supabase-api service
          await savePage(supabase, page.id, {
            name: page.name,
          });
        }
    // step 5: TODO: Add back image processing

    // step 6: Fetch and store events for each page
    let totalEvents = 0;
    const eventData: EventBatchItem[] = [];

    for (const page of pages) {
      try {
        // get token thru secret-manager service in /functions/service
        const accessToken = await getPageToken(supabase, page.id);
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
              logger.error('Token expired during OAuth - skip page sync', eventError, {
                pageId: page.id,
                pageName: page.name,
                facebookErrorCode: fbError.code,
              });
              // Skip to next page when token is invalid
              continue;
            }
          }
          // Re-throw if it's not a token error
          throw eventError;
        }

        // normalization before putting into Supabase
        for (const event of events) {
          // Use centralized normalizer for consistent schema
          const normalized = normalizeEvent(event, page.id, event.cover ? event.cover.source : null);

          eventData.push({
            id: event.id,
            data: normalized,
          });
          totalEvents++;
        }
      }
      catch (eventError: any) {
        logger.error('Failed to fetch events for page during OAuth', eventError, {
          pageId: page.id,
          pageName: page.name,
        });
      }
    }

    if (eventData.length > 0) {
      await batchWriteEvents(supabase, eventData);
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