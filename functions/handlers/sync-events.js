const admin = require('firebase-admin');
const { getPageEvents } = require('../services/facebook-api');
const { getPageToken } = require('../services/secret-manager');
const { getActivePages, batchWriteEvents } = require('../services/firestore-service');

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
      
      // Fetch events from Facebook-api service
      const events = await getPageEvents(page.id, accessToken);
      console.log(`Found ${events.length} events for page ${page.name}`);

      // Normalize and prepare for batch write
      for (const event of events) {
        const nowIso = new Date().toISOString();
        // Safely extract place data if it exists
        const placeData = event.place ? {
          name: event.place.name,
          location: event.place.location,
        } : undefined;
        
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
