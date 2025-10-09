const admin = require('firebase-admin');
const { getPageEvents } = require('../services/facebook-api');
const { getPageToken } = require('../services/secret-manager');
const { getActivePages, batchWriteEvents, savePage } = require('../services/firestore-service');
const { processEventCoverImage, initializeStorageBucket } = require('../services/image-service');
const { normalizeEvent } = require('../utils/event-normalizer');
const { ERROR_CODES } = require('../utils/constants');

// NB: "Handlers" like execute business logic. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager
// here we use a lot of dedicated service scripts from our facebook service 
// in /functions/services

/**
 * Sync events, simple as. We have a manual and cron version
 */
async function syncAllPageEvents() {
  const db = admin.firestore();
  
  // get all active pages from our firestore service in /functions/services/
  const pages = await getActivePages(db);
  
  if (pages.length === 0) {
    console.log('No active pages; nothing to sync');
    return { syncedPages: 0, syncedEvents: 0 };
  }

  // Storage bucket is googles way of passing data thru objects, often images. It's quite
  // similar to e.g. http req res objects, firebase's snapshots or reaally any object that
  // has methods and properties. If it fails, we just use the original facebook url
  // instead of downloading and reuploading it to our own storage bucket
  let storageBucket = null;
  try {
    storageBucket = initializeStorageBucket();
    console.log('Storage bucket initialized for image processing');
  } catch (error) {
    console.warn('Storage bucket not available; will use original Facebook URLs:', error.message);
  }

  let totalEvents = 0;
  const eventData = [];

  // Sync each page
  for (const page of pages) { 
    try {
      // Get access token from Secret Manager
      const accessToken = await getPageToken(page.id); // in secret-manager service
      if (!accessToken) {
        console.warn(`No access token found for page ${page.id}`);
        continue;
      }

      console.log(`Syncing events for page ${page.name} (${page.id})`);
      
      // Get events from Facebook-api service
      let events;
      try {
        events = await getPageEvents(page.id, accessToken);
      } catch (error) {
        // Check if it's a token expiry error (Facebook error code 190)
        if (error.response && error.response.data && error.response.data.error) {
          const fbError = error.response.data.error;
          if (fbError.code === ERROR_CODES.FACEBOOK_TOKEN_INVALID) {
            console.error(`Token expired for page ${page.name} (${page.id}). Marking as inactive.`);
            // Mark the page as inactive so it won't be synced until re-authorized
            await savePage(db, page.id, { active: false });
            continue; // Skip to next page
          }
        }
        // Re-throw if it's not a token error
        throw error;
      }
      
      console.log(`Found ${events.length} events for page ${page.name}`);

      // Normalize and prepare for batch write
      // batch write is doing it all at once or not at all. Normalize is just 
      // formatting it in a standard way
      for (const event of events) {
        // Start with image processing
        // Process cover image using the image service
        let coverImageUrl = null;
        if (storageBucket) {
          try {
            coverImageUrl = await processEventCoverImage(event, page.id, storageBucket);
          } catch (error) {
            console.warn(`Image processing failed for event ${event.id}:`, error.message);
            // Fallback to original Facebook URL
            coverImageUrl = event.cover ? event.cover.source : undefined;
          }
        } else {
          // No storage available, use original URL
          coverImageUrl = event.cover ? event.cover.source : undefined;
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
    } catch (error) {
      console.warn(`Failed to sync events for page ${page.id}:`, error.message);
    }
  }

  // Batch write all events. Again, batch writing is doing it all at once
  if (eventData.length > 0) {
    await batchWriteEvents(db, eventData);
    console.log(`Synced ${totalEvents} events from ${pages.length} pages`);
  }

  return {
    syncedPages: pages.length,
    syncedEvents: totalEvents,
  };
}

// the above function just does the functionality. We would actually prefer
// to do it either manually or with a cron job

/**
 * Manual sync request (HTTP endpoint) using syncAllPageEvents() funct
 */
async function handleManualSync(req, res) {
  try {
    const result = await syncAllPageEvents();
    res.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handle scheduled sync (cron job)
 */
async function handleScheduledSync() {
  try {
    const result = await syncAllPageEvents();
    console.log('Scheduled sync completed:', result);
  } catch (error) {
    console.error('Scheduled sync error:', error);
  }
}

module.exports = {
  syncAllPageEvents,
  handleManualSync,
  handleScheduledSync,
};
