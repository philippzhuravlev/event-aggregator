const express = require('express');
const axios = require('axios');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require('firebase-admin');
const router = express.Router();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}
const db = admin.firestore();

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

const FB_APP_ID = process.env.VITE_FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.VITE_FACEBOOK_APP_SECRET;
const FB_REDIRECT_URI = 'http://localhost:3001/fb/callback';
const GCP_PROJECT_ID = process.env.VITE_GCP_PROJECT_ID;

async function storePageTokenInSecretManager(pageId, token) {
  const secretId = `facebook-token-${pageId}`;
  const parent = `projects/${GCP_PROJECT_ID}`;
  // Try to create the secret (ignore error if it exists)
  try {
    await secretClient.createSecret({
      parent,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (e) {
    if (!e.message.includes('Already exists')) throw e;
  }
  // Add a new version with the token
  await secretClient.addSecretVersion({
    parent: `${parent}/secrets/${secretId}`,
    payload: { data: Buffer.from(token, 'utf8') },
  });
}

router.get('/fb/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing code');
  }

  try {
    // Step 3: Exchange code for short-lived user token
    const tokenRes = await axios.get('https://graph.facebook.com/v23.0/oauth/access_token', {
      params: {
        client_id: FB_APP_ID,
        redirect_uri: FB_REDIRECT_URI,
        client_secret: FB_APP_SECRET,
        code,
      },
    });
    const shortLivedToken = tokenRes.data.access_token;

    // Step 4: Exchange for long-lived user token
    const longTokenRes = await axios.get('https://graph.facebook.com/v23.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    });
    const longLivedToken = longTokenRes.data.access_token;

    // Step 5: Get Page tokens
    const pagesRes = await axios.get('https://graph.facebook.com/v23.0/me/accounts', {
      params: {
        fields: 'id,name,access_token',
        access_token: longLivedToken,
      },
    });

    // Store each page token in Secret Manager, and (optionally) metadata in Firestore
    const pages = pagesRes.data.data || [];
    for (const page of pages) {
      await storePageTokenInSecretManager(page.id, page.access_token);
      // Store page metadata in Firestore
      await db.collection('pages').doc(page.id).set({
        id: page.id,
        name: page.name,
        connectedAt: new Date().toISOString(),
      }, { merge: true });
      console.log(`Wrote page metadata for ${page.id} to Firestore`);
    }

    res.send('Page tokens stored in Secret Manager! You can close this window.');
  } catch (err) {
    console.error('Facebook error:', err.response?.data || err.message || err);
    res.status(500).send('Facebook auth failed');
  }
});

module.exports = router;