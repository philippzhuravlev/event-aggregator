const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

// Secret set via: firebase functions:secrets:set FB_PAGE_TOKEN
// const FB_PAGE_TOKEN = defineSecret('FB_PAGE_TOKEN'); // Temporarily commented out

// Facebook OAuth secrets
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

// Temporarily commented out - will update to use page tokens from Firestore after OAuth setup
/*
exports.syncFacebook = onRequest({ secrets: [FB_PAGE_TOKEN] }, async (req, res) => {
  try {
    const pageId = String(req.query.pageId || '').trim();
    if (!pageId) {
      res.status(400).send('Missing pageId');
      return;
    }

    const accessToken = FB_PAGE_TOKEN.value();
    if (!accessToken) {
      res.status(500).send('FB_PAGE_TOKEN not set');
      return;
    }

    const url = new URL(`https://graph.facebook.com/v19.0/${pageId}/events`);
    url.searchParams.set('time_filter', 'upcoming');
    url.searchParams.set('fields', 'id,name,description,start_time,end_time,place,cover');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok) {
      res.status(response.status).json(body);
      return;
    }

    const events = Array.isArray(body.data) ? body.data : [];
    const db = admin.firestore();
    const batch = db.batch();
    const nowIso = new Date().toISOString();

    // Helper to drop undefined values so Firestore accepts the document
    const dropUndefined = (obj) => Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined)
    );

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
        coverImageUrl: ev.cover?.source,
        eventURL: `https://facebook.com/events/${ev.id}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      batch.set(docRef, normalized, { merge: true });
    }

    await batch.commit();
    res.json({ upserted: events.length });
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : 'Unknown error');
  }
});
*/

// Run twice daily to refresh upcoming events for all active pages in Firestore
// Temporarily commented out - will update to use page tokens from Firestore after OAuth setup
/*
exports.nightlySyncFacebook = onSchedule({
  schedule: 'every 12 hours',
  timeZone: 'Etc/UTC',
  secrets: [FB_PAGE_TOKEN],
}, async () => {
  const accessToken = FB_PAGE_TOKEN.value();
  if (!accessToken) {
    console.warn('FB_PAGE_TOKEN is not set');
    return;
  }

  const db = admin.firestore();
  const pagesSnap = await db.collection('pages').where('active', '==', true).get();
  if (pagesSnap.empty) {
    console.log('No active pages; nothing to sync');
    return;
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  for (const doc of pagesSnap.docs) {
    const pageId = doc.id;
    try {
      const url = new URL(`https://graph.facebook.com/v19.0/${pageId}/events`);
      url.searchParams.set('time_filter', 'upcoming');
      url.searchParams.set('fields', 'id,name,description,start_time,end_time,place,cover');
      url.searchParams.set('access_token', accessToken);

      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) {
        console.warn('Graph error for page', pageId, body);
        continue;
      }

      const events = Array.isArray(body.data) ? body.data : [];
      const dropUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

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
          coverImageUrl: ev.cover?.source,
          eventURL: `https://facebook.com/events/${ev.id}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        batch.set(ref, normalized, { merge: true });
      }
    } catch (err) {
      console.warn('Failed to sync page', pageId, err);
    }
  }

  await batch.commit();
});
*/

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

    // Store page tokens in Firestore
    const db = admin.firestore();
    const batch = db.batch();

    for (const page of pages) {
      const pageRef = db.collection('pages').doc(page.id);
      batch.set(pageRef, {
        id: page.id,
        name: page.name,
        url: `https://facebook.com/${page.id}`,
        accessToken: page.access_token,
        active: true,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    console.log(`Stored ${pages.length} page tokens in Firestore`);

    // Redirect back to your app with success
    res.redirect(`https://dtuevent-8105b.web.app/?success=true&pages=${pages.length}`);

  } catch (error) {
    console.error('Facebook OAuth callback error:', error.response?.data || error.message || error);
    res.redirect('https://dtuevent-8105b.web.app/?error=server_error');
  }
});


