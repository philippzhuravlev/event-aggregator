import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAllRelevantEvents } from '../services/facebook-api';
import { getPageToken, checkTokenExpiry, markTokenExpired, getActivePages, batchWriteEvents } from '../services/supabase-service';
import { normalizeEvent } from '../utils/event-normalizer';
import { ERROR_CODES, TOKEN_REFRESH, EVENT_SYNC, HTTP_STATUS } from '../utils/constants';
import { logger } from '../utils/logger';
import { EventBatchItem, SyncResult, ExpiringToken } from '../types';
import { createErrorResponse } from '../utils/error-sanitizer';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

// Syncing events means getting events from facebook and putting them
// into our supabase database. We have two ways of doing this: manually
// via an http endpoint (handleManualSync) or automatically via a cron
// job (handleScheduledSync). Both use the same underlying function
// syncAllPageEvents which does the actual work, which also includes 
// processing event cover images and normalizing event data - could have
// been split into separate functions honestly

/**
 * Sync events, simple as. We have a manual and cron version
 */
export async function syncAllPageEvents(supabase: SupabaseClient): Promise<SyncResult> { 
  
  // Get all active pages from Supabase
  const pages = await getActivePages(supabase);

  if (pages.length === 0) {
    logger.info('No active pages to sync');
    return { syncedPages: 0, syncedEvents: 0, expiringTokens: 0, expiringTokenDetails: [] };
  }
  
  // Storage bucket is supabase way of passing data thru objects, often images. It's quite
  // similar to e.g. http req res objects, supabase's snapshots or really any object that
  // has methods and properties. If it fails, we just use the original facebook url
  // instead of downloading and reuploading it to our own storage bucket
  // TODO: Add back image processing

  let totalEvents = 0;
  const eventData: EventBatchItem[] = [];
  const expiringTokens: ExpiringToken[] = [];

  // Sync all pages in parallel using Promise.all. That's the excellent utility
  // of Promise in JS/TS
  const syncResults = await Promise.all(
    pages.map(async (page) => {
      try {
        // 1. In this try-catch, first we check if token is expiring soon 
        // (so within 7 days)
        const tokenStatus = await checkTokenExpiry(supabase, page.id, TOKEN_REFRESH.WARNING_DAYS);
        if (tokenStatus.isExpiring) {
          logger.warn('Token expiring soon', {
            pageId: page.id,
            pageName: page.name,
            daysUntilExpiry: tokenStatus.daysUntilExpiry,
            expiresAt: tokenStatus.expiresAt ? tokenStatus.expiresAt.toISOString() : null,
          });
          // ...and if we can do it:
          expiringTokens.push({
            pageId: page.id,
            pageName: page.name,
            daysUntilExpiry: tokenStatus.daysUntilExpiry,
            expiresAt: tokenStatus.expiresAt,
          });
        }

        // 2. Then, we get access token from Secret Manager (thru the secret manager service)
        const accessToken = await getPageToken(supabase, page.id); // in secret-manager service
        if (!accessToken) {
          logger.error('No access token found for page', null, {
            pageId: page.id,
            pageName: page.name,
          });
          return { events: [], pageId: page.id };
        }

        logger.info('Syncing events for page', {
          pageId: page.id,
          pageName: page.name,
        });
        
        // 3. Get events from facebook-api service
        // Well technically we get two events w/ api upcoming + last 30 days
        let events;
        try {
          events = await getAllRelevantEvents(page.id, accessToken, EVENT_SYNC.PAST_EVENTS_DAYS);
        } catch (error: any) {
          // 4. Check if it's a token expiry error 
          // (Facebook will throw its dedicated error code 190)
          if (error.response && error.response.data && error.response.data.error) {
            const fbError = error.response.data.error;
            if (fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
              logger.error('Token expired for page - marking as inactive', error, {
                pageId: page.id,
                pageName: page.name,
                facebookErrorCode: fbError.code,
              });
              // 4. set the page as inactive and token as expired
              await markTokenExpired(supabase, page.id); // in secret-manager service
              return { events: [], pageId: page.id }; // skips this page
            }
          }
          // if no error token:
          throw error;
        }
        
        // log things in logger
        logger.info('Events fetched from Facebook', {
          pageId: page.id,
          pageName: page.name,
          eventCount: events.length,
        });

        // 5. Process all events for this page
        // We're still doing batch write, i.e. all or nothing, but we'll use 
        // Promise.all to make it real fast
        const pageEventData: EventBatchItem[] = [];
        for (const event of events) { // go thru all events...
          const normalized = normalizeEvent(event, page.id, event.cover ? event.cover.source : null);

          pageEventData.push({
            id: event.id,
            data: normalized,
          });
        }

        return { events: pageEventData, pageId: page.id };
      } catch (error: any) {
        logger.error('Failed to sync events for page', error, {
          pageId: page.id,
          pageName: page.name,
        });
        return { events: [], pageId: page.id };
      }
    })
  );

  // collect all events from all pages
  for (const result of syncResults) {
    eventData.push(...result.events);
    totalEvents += result.events.length;
  }

  // Batch write all events. Again, batch writing is doing it all at once
  if (eventData.length > 0) {
    await batchWriteEvents(supabase, eventData);
    logger.info('Sync completed successfully', {
      totalEvents,
      totalPages: pages.length,
      expiringTokens: expiringTokens.length,
    });
  }

  // And at the end, we might as well log all expiring tokens as a summary
  if (expiringTokens.length > 0) {
    logger.warn('Multiple tokens expiring soon', {
      count: expiringTokens.length,
      tokens: expiringTokens,
    });
  }

  return {
    syncedPages: pages.length,
    syncedEvents: totalEvents,
    expiringTokens: expiringTokens.length,
    expiringTokenDetails: expiringTokens,
  };
}

// the above function just does the functionality. We would actually prefer
// to do it either manually or with a cron job, hence, the two methods below
// do the actual jobs using the above method

/**
 * Manual sync request (HTTP endpoint) using syncAllPageEvents() funct
 * Now requires authentication via API key
 * @param req - HTTP request object
 * @param res - HTTP response object
 */
export async function handleManualSync(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Manual sync started');
    const result = await syncAllPageEvents((req as any).supabase);
    logger.info('Manual sync completed successfully', result);
    res.json({ 
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Manual sync failed', error); 
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(error, isDevelopment, 'Failed to sync events from Facebook')
      // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
    );
  }
}

/**
 * Handle scheduled sync (cron job)
 */
export async function handleScheduledSync(supabase: SupabaseClient): Promise<void> { 
  // The method before this one was manual; this one's scheduled as a cron job.
  // it's actually called in index.ts, i.e. the list of methods accepted by 
  // supabase, which also specifies how often the sync is run on schedule:))
  try {
    logger.info('Scheduled sync started');
    const result = await syncAllPageEvents(supabase);
    logger.info('Scheduled sync completed', result);
  } catch (error: any) {
    logger.error('Scheduled sync failed', error);
  }
}