import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { FacebookWebhookPayload, WebhookVerificationQuery, WebhookProcessingResult, WebhookEventDetail } from '../types';
import { getPageToken, batchWriteEvents, getActivePages } from '../services/supabase-service';
import { getAllRelevantEvents } from '../services/facebook-api';
import { normalizeEvent } from '../utils/event-normalizer';
import { logger } from '../utils/logger';
import { sanitizeErrorMessage, createErrorResponse, createValidationErrorResponse } from '../utils/error-sanitizer';
import { validateQueryParams, validateBody } from '../middleware/validation-schemas';
import { webhookVerificationSchema, webhookPayloadSchema } from '../schemas/facebook-webhook.schema';
import { HTTP_STATUS } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

// What this handler does is that it receives real-time notifications from Facebook when events change
// instead of polling every 12 hours. This is done thru facebook's dedicated Facebook App Webhooks service.
// A webhook is just a fancy word for an HTTP endpoint that receives POST requests whenever something happens
// on a page we subscribed to (like event created/updated/deleted). What's sent is a "payload", just a json
// object with details about what changed. 

/**
 * Validate webhook payload structure
 * Ensures the payload conforms to expected Facebook webhook format
 * @param payload - Webhook payload to validate
 * @returns Validation result with errors if invalid
 */
export function validateWebhookPayload(payload: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  // Again, the webhook itself is a POST http endpoint request (sent automatically whenever
  // something __changes__); what's sent is a "payload", again just a object, this time a 
  // json with details about what changed. We need to validate that this payload is correct and not some
  // random stuff or actual malicious links. 
  // This method right here is later used by our "handler", the part that actually "does something"

  // Check if payload exists
  if (!payload || typeof payload !== 'object') {
    errors.push('Invalid payload: must be an object');
    return { isValid: false, errors };
  }

  // Check object type
  if (payload.object !== 'page') { // the payload must be of the type "page"
    errors.push('Invalid payload: object must be "page"');
  }

  // Check entry array
  // the "entry" is a specific function inside our helpful payload object
  // that's just an array of changes that happened
  if (!Array.isArray(payload.entry)) { 
    errors.push('Invalid payload: entry must be an array');
    return { isValid: false, errors };
  }

  // Validate each entry
  // Pretty straightforward. Because the payload is just an object, we can
  // for loop through each entr/field/method and validate it that way
  for (let i = 0; i < payload.entry.length; i++) {
    const entry = payload.entry[i];
    
    if (!entry.id || typeof entry.id !== 'string') {
      errors.push(`Invalid entry[${i}]: missing or invalid id`);
    }
    
    if (!Array.isArray(entry.changes)) {
      errors.push(`Invalid entry[${i}]: changes must be an array`);
      continue;
    }

    // validates only changes
    for (let j = 0; j < entry.changes.length; j++) {
      const change = entry.changes[j];
      
      if (!change.field || typeof change.field !== 'string') {
        errors.push(`Invalid entry[${i}].changes[${j}]: missing or invalid field`);
      }
      
      if (!change.value || typeof change.value !== 'object') {
        errors.push(`Invalid entry[${i}].changes[${j}]: missing or invalid value`);
        continue;
      }

      // validate only event changes
      if (change.field === 'events') {
        const value = change.value;
        
        if (!value.event_id || typeof value.event_id !== 'string') {
          errors.push(`Invalid entry[${i}].changes[${j}].value: missing or invalid event_id`);
        }
        
        if (!value.verb || !['create', 'update', 'delete'].includes(value.verb)) {
          errors.push(`Invalid entry[${i}].changes[${j}].value: invalid verb (must be create/update/delete)`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

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

  // verify that mode is 'subscribe' and token matches (trim both sides to avoid CRLF issues)
  // webhooks work by "subscribing" to events. Here, we verify that Facebook is indeed trying 
  // to subscribe and that the token matches what we expect (thru secret manager)
  const received = typeof token === 'string' ? token.trim() : String(token); // ? : is if else notation
  const expected = typeof verifyToken === 'string' ? verifyToken.trim() : String(verifyToken); // trim removes spaces/newlines
  // typeof is simple: it tells us what type a variable is, e.g. string, number, object, etc.
  // === is strict equality, meaning both value and type must match (unlike == which is more lenient)

  // "masked" is just a way to hide part of the token for security/logging purposes
  // => is an arrow function, a common JS shorthand for defining functions quickly and simply
  const masked = (s: string) => (s ? `${s.substring(0, 6)}...` : '');

  if (mode === 'subscribe' && received === expected) {
    logger.info('Webhook verification successful', {
      received: masked(received),
      expected: masked(expected),
    });
    return challenge || null;
  }

  logger.warn('Webhook verification failed', {
    mode,
    tokenMatch: received === expected,
    received: masked(received),
    expected: masked(expected),
  });
  return null;
}

/**
 * Handle a single event change from webhook
 * @param supabase - Supabase client
 * @param eventId - Facebook event ID
 * @param verb - Action type (create, update, delete)
 * @param pageId - Facebook page ID
 * @returns Processing result
 */
async function handleEventChange(
  supabase: SupabaseClient,
  eventId: string,
  verb: 'create' | 'update' | 'delete',
  pageId: string
): Promise<WebhookEventDetail> {

  try {
    // check if page is active in our system
    const pages = await getActivePages(supabase);
    const page = pages.find(p => p.id === pageId);
    if (!page || !page.data.active) {
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
      await supabase.from('events').delete().eq('id', eventId);
      logger.info('Event deleted via webhook', { eventId, pageId });
      return {
        eventId,
        verb,
        pageId,
        status: 'success',
      };
    }

    // Create/update - fetches fresh data from Facebook
    const accessToken = await getPageToken(supabase, pageId);
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
      await supabase.from('events').delete().eq('id', eventId);
      return {
        eventId,
        verb,
        pageId,
        status: 'success',
        reason: 'Event not found, removed from DB',
      };
    }

    // TODO: Add back image processing

    // use the normalize util to format the event
    const normalized = normalizeEvent(event, pageId, event.cover ? event.cover.source : null);
    await batchWriteEvents(supabase, [{ id: eventId, data: normalized }]);

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
    
    // Sanitize error message before storing in result
    const sanitizedReason = sanitizeErrorMessage(error.message || String(error));
    
    return {
      eventId,
      verb,
      pageId,
      status: 'failed',
      reason: sanitizedReason,
    };
  }
}

/**
 * Process webhook payload from Facebook
 * @param supabase - Supabase client
 * @param payload - Webhook payload with event changes
 * @returns Processing result summary
 */
export async function processWebhookPayload(
  supabase: SupabaseClient,
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
        supabase,
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
  res: Response,
  appSecret: string,
  verifyToken: string
): Promise<void> {
  const supabase = (req as any).supabase;
  // The method above this one was just for validating the payload and signature. 
  // This time, we're actually "doing something" - a handler - which uses the methods above

  // GET request - webhook verification
  if (req.method === 'GET') {
    // Validate query parameters with Zod
    // Once again, we use the node module Zod to validate the data. This is done with a "schema", which is like types
    // but instead of justdefining the type (string, number, boolean etc), it defines the structure of the data
    // itself, so we can be sure it fits nicely in our database and doesn't have missing fields etc.
    // The schema itself is defined in functions/schemas/facebook-webhook.schema.ts and is here parsed as a param,
    // a trick called "dependency injection" where we pass dependencies as params instead of hardcoding 5-10 params
    const validation = validateQueryParams(req as any, webhookVerificationSchema);
    
    if (!validation.success) {
      logger.warn('Invalid webhook verification parameters', {
        errors: validation.errors,
        query: req.query,
      });
      res.status(HTTP_STATUS.FORBIDDEN).json(
        createErrorResponse(new Error('Forbidden'), false, 'Invalid verification parameters')
        // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
        // this is going to also be the case below in POST request handling too
      );
      return;
    }

    const challenge = handleWebhookVerification(
      validation.data as WebhookVerificationQuery,
      verifyToken
    );

    if (challenge) {
      res.status(HTTP_STATUS.OK).send(challenge);
    } else {
      // Sanitized error response - don't reveal verification details
      res.status(HTTP_STATUS.FORBIDDEN).json(
        createErrorResponse(new Error('Forbidden'), false, 'Verification failed')
      );
    }
    return;
  }

  // POST request - webhook event
  if (req.method === 'POST') {
    // Step 1: Verify signature
    // crucial. A signature here is the "code" that facebook sends to verify that it's
    // indeed from facebook, and not somebody else. It's sent thru the http headers, 
    // which is a special part of the http system ("protocol") that usually contains metadata
    // about the request itself, like who sent it, when, etc. We're just using one of
    // those headers to verify the request is legit thru this signaature
    const signature = (req as any).headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as any).rawBody?.toString() || JSON.stringify((req as any).body);
    
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      logger.warn('Webhook signature verification failed', {
        hasSignature: !!signature,
        bodyLength: rawBody.length,
      });
      // here the error is reworked not to show any details for security; it's been "sanitized"
      res.status(HTTP_STATUS.FORBIDDEN).json(
        createErrorResponse(new Error('Forbidden'), false, 'Invalid signature')
      );
      return;
    }

    // Step 2: Validate payload structure with Zod
    // Again, we use Zod (see above in step 1), but this time for validating the actual "payload"
    // (also again, the json object sent by facebook w/ changes). Also in functions/schemas/...
    // ...facebook-webhook.schema.ts file
    const bodyValidation = validateBody(req as any, webhookPayloadSchema);
    if (!bodyValidation.success) {
      logger.warn('Invalid webhook payload structure', {
        errors: bodyValidation.errors, // the "body" part specifies that this is the payload
      });
      // here the error is reworked not to show any details for security
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createValidationErrorResponse(bodyValidation.errors, 'Invalid webhook payload')
      );
      return;
    }

    // Step 3: Process webhook
    try {
      const payload = bodyValidation.data as FacebookWebhookPayload;
      const result = await processWebhookPayload(supabase, payload);

      // Success response - minimal information given over to avoid leaking details
      res.status(HTTP_STATUS.OK).json({
        success: true,
        processed: result.processed,
        skipped: result.skipped,
      });
    } catch (error: any) {
      logger.error('Webhook processing error', error, {
        entryCount: req.body?.entry?.length || 0,
      });
      
      // here the error has again been reworked not to show any details for security
      const isDevelopment = process.env.NODE_ENV === 'development';
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(error, isDevelopment, 'Failed to process webhook')
      );
    }
    return;
  }

  // other methods not allowed like PUT, DELETE etc !    
  res.status(HTTP_STATUS.METHOD_NOT_ALLOWED).json(
    createErrorResponse(new Error('Method not allowed'), false, 'Only GET and POST methods are supported')
  );
}