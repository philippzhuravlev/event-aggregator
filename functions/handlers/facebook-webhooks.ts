import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import crypto from 'crypto';
import { FacebookWebhookPayload, WebhookVerificationQuery, WebhookProcessingResult, WebhookEventDetail } from '../types';
import { getPageToken } from '../services/secret-manager';
import { getAllRelevantEvents } from '../services/facebook-api';
import { batchWriteEvents } from '../services/firestore-service';
import { processEventCoverImage, initializeStorageBucket } from '../services/image-service';
import { normalizeEvent } from '../utils/event-normalizer';
import { logger } from '../utils/logger';

// NB: "Handlers" like execute business logic; they "do something", like
// // syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// What this handler does is that it receives real-time notifications from Facebook when events change
// instead of polling every 12 hours. This is done thru facebook's dedicated Facebook App Webhooks service

/**
 * Verify webhook signature to ensure request is from Facebook
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header
 * @param appSecret - Facebook App Secret
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(
  payload: string, 
  signature: string | undefined, 
  appSecret: string
): boolean {
  if (!signature) {
    logger.warn('Webhook request missing signature header');
    return false;
  }

  // facebook sends signature as "sha256=<hash>"
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    logger.warn('Invalid signature format', { signature });
    return false;
  }

  const expectedHash = signatureParts[1];
  
  // this is a way to verify that the payload is actually from facebook
  // so hackers cant change the payload to something else
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(payload);
  const calculatedHash = hmac.digest('hex');

  // check lengths match before comparison (timingSafeEqual requires same length)
  if (calculatedHash.length !== expectedHash.length) {
    logger.warn('Webhook signature length mismatch', {
      expectedLength: expectedHash.length,
      calculatedLength: calculatedHash.length,
    });
    return false;
  }

  // actual hash comparison
  const isValid = crypto.timingSafeEqual(
    Buffer.from(calculatedHash, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );

  if (!isValid) {
    logger.warn('Webhook signature verification failed', {
      expected: expectedHash.substring(0, 10) + '...',
      calculated: calculatedHash.substring(0, 10) + '...',
    });
  }

  return isValid;
}

/**
 * Handle webhook verification challenge from Facebook
 * Facebook sends a GET request with hub.mode, hub.challenge, and hub.verify_token
 * @param query - Request query parameters
 * @param verifyToken - Expected verify token (from config)
 * @returns Challenge string if valid, null otherwise
 */
export function handleWebhookVerification(
  query: WebhookVerificationQuery, 
  verifyToken: string
): string | null {
  const mode = query['hub.mode'];
  const challenge = query['hub.challenge'];
  const token = query['hub.verify_token'];

  logger.info('Webhook verification request received', {
    mode,
    hasChallenge: !!challenge,
    hasToken: !!token,
  });

  // verify that mode is 'subscribe' and token matches
  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('Webhook verification successful');
    return challenge || null;
  }

  logger.warn('Webhook verification failed', {
    mode,
    tokenMatch: token === verifyToken,
  });
  return null;
}

/**
 * Handle a single event change from webhook
 * @param eventId - Facebook event ID
 * @param verb - Action type (create, update, delete)
 * @param pageId - Facebook page ID
 * @returns Processing result
 */
async function handleEventChange(
  eventId: string,
  verb: 'create' | 'update' | 'delete',
  pageId: string
): Promise<WebhookEventDetail> {
  const db = admin.firestore();

  try {
    // check if page is active in our system
    const pageDoc = await db.collection('pages').doc(pageId).get();
    if (!pageDoc.exists || !pageDoc.data()?.active) {
      logger.debug('Webhook event for inactive page - skipping', { pageId, eventId });
      return {
        eventId,
        verb,
        pageId,
        status: 'skipped',
        reason: 'Page not active',
      };
    }

    // Do delete
    if (verb === 'delete') {
      await db.collection('events').doc(eventId).delete();
      logger.info('Event deleted via webhook', { eventId, pageId });
      return {
        eventId,
        verb,
        pageId,
        status: 'success',
      };
    }

    // Create/update - fetches fresh data from Facebook
    const accessToken = await getPageToken(pageId);
    if (!accessToken) {
      logger.error('No access token for page in webhook handler', null, { pageId, eventId });
      return {
        eventId,
        verb,
        pageId,
        status: 'failed',
        reason: 'No access token',
      };
    }

    // fetch updated event data from Facebook
    const events = await getAllRelevantEvents(pageId, accessToken, 30);
    const event = events.find(e => e.id === eventId);

    if (!event) {
      logger.warn('Event not found in Facebook API response', { eventId, pageId });
      // might have been deleted, remove from our DB
      await db.collection('events').doc(eventId).delete();
      return {
        eventId,
        verb,
        pageId,
        status: 'success',
        reason: 'Event not found, removed from DB',
      };
    }

    // do the cover image
    let storageBucket: any = null;
    try {
      storageBucket = initializeStorageBucket();
    } catch (error: any) {
      logger.warn('Storage bucket not available for webhook - using Facebook URL', { 
        error: error.message 
      });
    }

    // process the cover image
    let coverImageUrl: string | null = null;
    if (storageBucket && event.cover) {
      try {
        coverImageUrl = await processEventCoverImage(event, pageId, storageBucket);
      } catch (error: any) {
        logger.warn('Image processing failed in webhook - using Facebook URL', {
          eventId,
          error: error.message,
        });
        coverImageUrl = event.cover.source;
      }
    } else if (event.cover) {
      coverImageUrl = event.cover.source;
    }

    // use the normalize util to format the event
    const normalized = normalizeEvent(event, pageId, coverImageUrl);
    await batchWriteEvents(db, [{ id: eventId, data: normalized }]);

    logger.info('Event synced via webhook', { 
      eventId, 
      pageId, 
      verb,
      title: event.name 
    });

    return {
      eventId,
      verb,
      pageId,
      status: 'success',
    };
  } catch (error: any) {
    logger.error('Failed to process webhook event change', error, {
      eventId,
      verb,
      pageId,
    });
    return {
      eventId,
      verb,
      pageId,
      status: 'failed',
      reason: error.message,
    };
  }
}

/**
 * Process webhook payload from Facebook
 * @param payload - Webhook payload with event changes
 * @returns Processing result summary
 */
export async function processWebhookPayload(
  payload: FacebookWebhookPayload
): Promise<WebhookProcessingResult> {
  logger.info('Processing webhook payload', {
    object: payload.object,
    entries: payload.entry.length,
  });

  const result: WebhookProcessingResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  // verify this is a page indeed a webhook
  if (payload.object !== 'page') {
    logger.warn('Received non-page webhook', { object: payload.object });
    return result;
  }

  // process each entry (usually one per page)
  for (const entry of payload.entry) {
    const pageId = entry.id;

    // process each change in the entry
    for (const change of entry.changes) {
      // were only interested in event changes
      if (change.field !== 'events') {
        logger.debug('Skipping non-event change', { field: change.field });
        continue;
      }

      const value = change.value;
      if (!value.event_id || !value.verb) {
        logger.warn('Invalid webhook event value', { value });
        continue;
      }

      // process the event change
      const detail = await handleEventChange(
        value.event_id,
        value.verb,
        value.page_id || pageId
      );

      result.details.push(detail);

      if (detail.status === 'success') {
        result.processed++;
      } else if (detail.status === 'failed') {
        result.failed++;
      } else {
        result.skipped++;
      }
    }
  }

  logger.info('Webhook processing completed', result);
  return result;
}

/**
 * HTTP handler for Facebook webhook endpoint
 * GET - Webhook verification
 * POST - Webhook events
 * @param req - HTTP request
 * @param res - HTTP response
 * @param appSecret - Facebook App Secret
 * @param verifyToken - Webhook verify token
 */
export async function handleFacebookWebhook(
  req: Request,
  res: any,
  appSecret: string,
  verifyToken: string
): Promise<void> {
  // GET request - webhook verification
  if (req.method === 'GET') {
    const challenge = handleWebhookVerification(
      req.query as WebhookVerificationQuery,
      verifyToken
    );

    if (challenge) {
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: 'Verification failed' });
    }
    return;
  }

  // POST request - webhook event
  if (req.method === 'POST') {
    // verify signature
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);
    
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      logger.warn('Webhook signature verification failed');
      res.status(403).json({ error: 'Invalid signature' });
      return;
    }

    // process webhook
    try {
      const payload = req.body as FacebookWebhookPayload;
      const result = await processWebhookPayload(payload);

      res.status(200).json({
        success: true,
        result,
      });
    } catch (error: any) {
      logger.error('Webhook processing error', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
    return;
  }

  // other methods not allowed like PUT, DELETE etc !    
  res.status(405).json({ error: 'Method not allowed' });
}

