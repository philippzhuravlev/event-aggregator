const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const axios = require('axios');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

admin.initializeApp();
const secretClient = new SecretManagerServiceClient();

// Facebook OAuth secrets
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

// Helper function to store page token in Secret Manager
async function storePageToken(pageId, accessToken) {
  const projectId = process.env.GCLOUD_PROJECT;
  const secretName = `facebook-token-${pageId}`;
  
  try {
    // Create the secret
    await secretClient.createSecret({
      parent: `projects/${projectId}`,
      secretId: secretName,
      secret: {
        replication: { automatic: {} },
      },
    });
  } catch (error) {
    // Secret might already exist, that's okay
    if (!error.message.includes('already exists')) {
      console.warn(`Failed to create secret ${secretName}:`, error.message);
    }
  }
  
  // Add the secret version
  await secretClient.addSecretVersion({
    parent: `projects/${projectId}/secrets/${secretName}`,
    payload: {
      data: Buffer.from(accessToken),
    },
  });
}

// Helper function to get page token from Secret Manager
async function getPageToken(pageId) {
  const projectId = process.env.GCLOUD_PROJECT;
  const secretName = `facebook-token-${pageId}`;
  
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });
    return version.payload.data.toString();
  } catch (error) {
    console.warn(`Failed to get token for page ${pageId}:`, error.message);
    return null;
  }
}

// Sync events for all active pages using tokens from Secret Manager
exports.syncFacebook = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();
    const pagesSnap = await db.collection('pages').where('active', '==', true).get();
    
    if (pagesSnap.empty) {
      console.log('No active pages; nothing to sync');
      return res.json({ message: 'No active pages found' });
    }

    let totalEvents = 0;
    const batch = db.batch();
    const nowIso = new Date().toISOString();

    // Helper to drop undefined values so Firestore accepts the document
    const dropUndefined = (obj) => Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );

    for (const doc of pagesSnap.docs) {
      const pageId = doc.id;
      const pageName = doc.data().name;
      
      try {
        // Get the access token from Secret Manager
        const accessToken = await getPageToken(pageId);
        if (!accessToken) {
          console.warn(`No access token found for page ${pageId}`);
          continue;
        }

        console.log(`Syncing events for page ${pageName} (${pageId})`);
        
        const eventsResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/events`, {
          params: {
            access_token: accessToken,
            time_filter: 'upcoming',
            fields: 'id,name,description,start_time,end_time,place,cover',
          },
        });

        const events = eventsResponse.data.data || [];
        console.log(`Found ${events.length} events for page ${pageName}`);

        for (const ev of events) {
          const docRef = db.collection('events').doc(ev.id);
          const normalized = dropUndefined({
            id: ev.id,
            pageId,
            title: ev.name,
            description: ev.description,
            startTime: ev.start_time,
            endTime: ev.end_time,
            place: ev.place,
            coverImageUrl: ev.cover ? ev.cover.source : undefined,
            eventURL: `https://facebook.com/events/${ev.id}`,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          batch.set(docRef, normalized, { merge: true });
          totalEvents++;
        }
      } catch (eventError) {
        console.warn(`Failed to sync events for page ${pageId}:`, (eventError.response && eventError.response.data) || eventError.message);
      }
    }

    if (totalEvents > 0) {
      await batch.commit();
      console.log(`Synced ${totalEvents} events total`);
    }

    res.json({ syncedEvents: totalEvents, syncedPages: pagesSnap.size });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run twice daily to refresh upcoming events for all active pages
exports.nightlySyncFacebook = onSchedule({
  schedule: 'every 12 hours',
  timeZone: 'Etc/UTC',
}, async () => {
  const db = admin.firestore();
  const pagesSnap = await db.collection('pages').where('active', '==', true).get();
  
  if (pagesSnap.empty) {
    console.log('No active pages; nothing to sync');
    return;
  }

  let totalEvents = 0;
  const batch = db.batch();
  const nowIso = new Date().toISOString();

  const dropUndefined = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );

  for (const doc of pagesSnap.docs) {
    const pageId = doc.id;
    try {
      const accessToken = await getPageToken(pageId);
      if (!accessToken) {
        console.warn(`No access token found for page ${pageId}`);
        continue;
      }

      const eventsResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/events`, {
        params: {
          access_token: accessToken,
          time_filter: 'upcoming',
          fields: 'id,name,description,start_time,end_time,place,cover',
        },
      });

      const events = eventsResponse.data.data || [];
      
      for (const ev of events) {
        const ref = db.collection('events').doc(ev.id);
        const normalized = dropUndefined({
          id: ev.id,
          pageId,
          title: ev.name,
          description: ev.description,
          startTime: ev.start_time,
          endTime: ev.end_time,
          place: ev.place,
          coverImageUrl: ev.cover ? ev.cover.source : undefined,
          eventURL: `https://facebook.com/events/${ev.id}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        batch.set(ref, normalized, { merge: true });
        totalEvents++;
      }
    } catch (err) {
      console.warn('Failed to sync page', pageId, err);
    }
  }

  if (totalEvents > 0) {
    await batch.commit();
  }
  console.log(`Nightly sync completed: ${totalEvents} events updated`);
});

// Facebook OAuth callback function
exports.facebookCallback = onRequest({
  region: 'europe-west1',
  secrets: [FACEBOOK_APP_ID, FACEBOOK_APP_SECRET],
}, async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      console.error('Facebook OAuth error:', error);
      return res.redirect('https://dtuevent-8105b.web.app/?error=oauth_failed');
    }
    
    if (!code) {
      console.error('Missing authorization code');
      return res.redirect('https://dtuevent-8105b.web.app/?error=missing_code');
    }

    console.log('Processing Facebook OAuth callback...');

    // Exchange code for short-lived user access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID.value(),
        client_secret: FACEBOOK_APP_SECRET.value(),
        redirect_uri: 'https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback',
        code: code,
      },
    });

    const shortLivedToken = tokenResponse.data.access_token;
    
    if (!shortLivedToken) {
      throw new Error('No access token received from Facebook');
    }

    // Exchange short-lived token for long-lived user token
    const longTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: FACEBOOK_APP_ID.value(),
        client_secret: FACEBOOK_APP_SECRET.value(),
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = longTokenResponse.data.access_token;

    // Get user's pages with their access tokens
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: longLivedToken,
        fields: 'id,name,access_token',
      },
    });

    const pages = pagesResponse.data.data || [];
    console.log(`Found ${pages.length} pages for user`);

    if (pages.length === 0) {
      return res.redirect('https://dtuevent-8105b.web.app/?error=no_pages');
    }

    // Store page metadata in Firestore and tokens in Secret Manager
    const db = admin.firestore();
    const batch = db.batch();

    // Store access tokens securely in Secret Manager
    for (const page of pages) {
      await storePageToken(page.id, page.access_token);
      
      const pageRef = db.collection('pages').doc(page.id);
      batch.set(pageRef, {
        id: page.id,
        name: page.name,
        url: `https://facebook.com/${page.id}`,
        active: true,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    console.log(`Stored ${pages.length} page tokens in Secret Manager and metadata in Firestore`);

    // Now fetch events for each page
    let totalEvents = 0;
    const eventsBatch = db.batch();
    const nowIso = new Date().toISOString();

    // Helper to drop undefined values so Firestore accepts the document
    const dropUndefined = (obj) => Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );

    for (const page of pages) {
      try {
        console.log(`Fetching events for page ${page.name} (${page.id})`);
        
        // Get the access token from Secret Manager
        const accessToken = await getPageToken(page.id);
        if (!accessToken) {
          console.warn(`No access token found for page ${page.id}`);
          continue;
        }
        
        const eventsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/events`, {
          params: {
            access_token: accessToken,
            time_filter: 'upcoming',
            fields: 'id,name,description,start_time,end_time,place,cover',
          },
        });

        const events = eventsResponse.data.data || [];
        console.log(`Found ${events.length} events for page ${page.name}`);

        for (const ev of events) {
          const docRef = db.collection('events').doc(ev.id);
          const normalized = dropUndefined({
            id: ev.id,
            pageId: page.id,
            title: ev.name,
            description: ev.description,
            startTime: ev.start_time,
            endTime: ev.end_time,
            place: ev.place,
            coverImageUrl: ev.cover ? ev.cover.source : undefined,
            eventURL: `https://facebook.com/events/${ev.id}`,
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          eventsBatch.set(docRef, normalized, { merge: true });
          totalEvents++;
        }
      } catch (eventError) {
        console.warn(`Failed to fetch events for page ${page.id}:`, (eventError.response && eventError.response.data) || eventError.message);
      }
    }

    if (totalEvents > 0) {
      await eventsBatch.commit();
      console.log(`Stored ${totalEvents} events in Firestore`);
    }

    // Redirect back to your app with success info
    res.redirect(`https://dtuevent-8105b.web.app/?success=true&pages=${pages.length}&events=${totalEvents}`);

  } catch (error) {
    console.error('Facebook OAuth callback error:', (error.response && error.response.data) || error.message || error);
    res.redirect('https://dtuevent-8105b.web.app/');
  }
});


