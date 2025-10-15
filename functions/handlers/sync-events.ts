import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { getAllRelevantEvents } from '../services/facebook-api';
import { getPageToken, checkTokenExpiry, markTokenExpired } from '../services/secret-manager';
import { getActivePages, batchWriteEvents } from '../services/firestore-service';
import { processEventCoverImage, initializeStorageBucket } from '../services/image-service';
import { normalizeEvent } from '../utils/event-normalizer';
import { ERROR_CODES, TOKEN_REFRESH } from '../utils/constants';
import { logger } from '../utils/logger';
import { EventBatchItem, SyncResult, ExpiringToken } from '../types';
import { createErrorResponse } from '../utils/error-sanitizer';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// Syncing events means getting events from facebook and putting them
// into our firestore database. We have two ways of doing this: manually
// via an http endpoint (handleManualSync) or automatically via a cron
// job (handleScheduledSync). Both use the same underlying function
// syncAllPageEvents which does the actual work, which also includes 
// processing event cover images and normalizing event data - could have
// been split into separate functions honestly

/**
 * Sync events, simple as. We have a manual and cron version
 */
export async function syncAllPageEvents(): Promise<SyncResult> {
  const db = admin.firestore();
  
  // get all active pages from our firestore service in /functions/services/
  const pages = await getActivePages(db);
  
  if (pages.length === 0) {
    logger.info('No active pages to sync');
    return { syncedPages: 0, syncedEvents: 0, expiringTokens: 0, expiringTokenDetails: [] };
  }

  // Storage bucket is googles way of passing data thru objects, often images. It's quite
  // similar to e.g. http req res objects, firebase's snapshots or reaally any object that
  // has methods and properties. If it fails, we just use the original facebook url
  // instead of downloading and reuploading it to our own storage bucket
  let storageBucket: any = null;
  try {
    storageBucket = initializeStorageBucket();
    logger.info('Storage bucket initialized for image processing');
  } catch (error: any) {
    logger.warn('Storage bucket not available; using original Facebook URLs', { 
      error: error.message 
    });
  }

  let totalEvents = 0;
  const eventData: EventBatchItem[] = [];
  const expiringTokens: ExpiringToken[] = [];

  // Sync each page
  for (const page of pages) { 
    try {
      // Check if token is expiring soon (within 7 days)
  const tokenStatus = await checkTokenExpiry(db, page.id, TOKEN_REFRESH.WARNING_DAYS);
      if (tokenStatus.isExpiring) {
        logger.warn('Token expiring soon', {
          pageId: page.id,
          pageName: page.name,
          daysUntilExpiry: tokenStatus.daysUntilExpiry,
          expiresAt: tokenStatus.expiresAt ? tokenStatus.expiresAt.toISOString() : null,
        });
        expiringTokens.push({
          pageId: page.id,
          pageName: page.name,
          daysUntilExpiry: tokenStatus.daysUntilExpiry,
          expiresAt: tokenStatus.expiresAt,
        });
      }

      // Get access token from Secret Manager
      const accessToken = await getPageToken(page.id); // in secret-manager service
      if (!accessToken) {
        logger.error('No access token found for page', null, {
          pageId: page.id,
          pageName: page.name,
        });
        continue;
      }

      logger.info('Syncing events for page', {
        pageId: page.id,
        pageName: page.name,
      });
      
      // Get events from Facebook-api service (upcoming + last 30 days)
      let events;
      try {
        events = await getAllRelevantEvents(page.id, accessToken, 30);
      } catch (error: any) {
        // Check if it's a token expiry error (Facebook error code 190)
        if (error.response && error.response.data && error.response.data.error) {
          const fbError = error.response.data.error;
          if (fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
            logger.error('Token expired for page - marking as inactive', error, {
              pageId: page.id,
              pageName: page.name,
              facebookErrorCode: fbError.code,
            });
            // Mark the page as inactive and token as expired
            await markTokenExpired(db, page.id);
            continue; // Skip to next page
          }
        }
        // Re-throw if it's not a token error
        throw error;
      }
      
      logger.info('Events fetched from Facebook', {
        pageId: page.id,
        pageName: page.name,
        eventCount: events.length,
      });

      // Normalize and prepare for batch write
      // batch write is doing it all at once or not at all. Normalize is just 
      // formatting it in a standard way
      for (const event of events) {
        // Start with image processing
        // Process cover image using the image service
        let coverImageUrl: string | null = null;
        if (storageBucket) {
          try {
            coverImageUrl = await processEventCoverImage(event, page.id, storageBucket);
          } catch (error: any) {
            logger.warn('Image processing failed - using Facebook URL', {
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

        // here we use our "normalizer" util in /functions/utils which basically matches
        // facebook's event object to our firestore event object
        const normalized = normalizeEvent(event, page.id, coverImageUrl);

        eventData.push({
          id: event.id,
          data: normalized,
        });
        totalEvents++;
      }
    } catch (error: any) {
      logger.error('Failed to sync events for page', error, {
        pageId: page.id,
        pageName: page.name,
      });
    }
  }

  // Batch write all events. Again, batch writing is doing it all at once
  if (eventData.length > 0) {
    await batchWriteEvents(db, eventData);
    logger.info('Sync completed successfully', {
      totalEvents,
      totalPages: pages.length,
      expiringTokens: expiringTokens.length,
    });
  }

  // Log expiring tokens summary
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
// to do it either manually or with a cron job

/**
 * Manual sync request (HTTP endpoint) using syncAllPageEvents() funct
 * Now requires authentication via API key
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param authMiddleware - Authentication middleware function
 */
export async function handleManualSync(
  req: Request, 
  res: any, 
  authMiddleware: (req: Request, res: any) => Promise<boolean>
): Promise<void> {
  // authenticate request
  const isAuthenticated = await authMiddleware(req, res);
  if (!isAuthenticated) {
    return; // middleware already sent error
  }

  try {
    logger.info('Manual sync started');
    const result = await syncAllPageEvents();
    logger.info('Manual sync completed successfully', result);
    res.json({ 
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Manual sync failed', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json(createErrorResponse(error, isDevelopment));
  }
}

/**
 * Handle scheduled sync (cron job)
 */
export async function handleScheduledSync(): Promise<void> {
  try {
    logger.info('Scheduled sync started');
    const result = await syncAllPageEvents();
    logger.info('Scheduled sync completed', result);
  } catch (error: any) {
    logger.error('Scheduled sync failed', error);
  }
}

