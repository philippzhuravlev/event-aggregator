import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

// this is the big file where the magic happens. It uses **handlers**, which 
// execute business logic, and **services** which are connections to external
// services supplied by google/meta, e.g. facebook api or firestore

// also notice how this fle and the handlers/services are .ts files now instead of
// .js files. TypeScript provides excellent type safety!

// import handlers
import { handleOAuthCallback } from './handlers/oauth-callback';
import { handleManualSync, handleScheduledSync } from './handlers/sync-events';
import { handleTokenHealthCheck, handleScheduledTokenMonitoring } from './handlers/token-monitor';
import { handleFacebookWebhook } from './handlers/facebook-webhooks';

// import middleware
import { requireApiKey, logRequest } from './middleware/auth';
import { handleCORS } from './middleware/validation';

// import constants
import { SYNC, region, WEBHOOK } from './utils/constants';

// Initialize Firebase Admin
admin.initializeApp();

// more consts
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

/**
 * Manual sync facebook endpoints
 * NOW REQUIRES API KEY AUTHENTICATION + CORS
 */
export const syncFacebook = onRequest({ 
  region: region,
  secrets: [] 
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  logRequest(req);
  await handleManualSync(req, res, requireApiKey);
});

/**
 * Cronjob sync, runs every 12 hours
 * What it does is that it syncs events from all active Facebook pages
 */
export const nightlySyncFacebook = onSchedule({
  region: region,
  schedule: SYNC.SCHEDULE,
  timeZone: SYNC.TIMEZONE,
  secrets: [],
}, handleScheduledSync);

/**
 * Token health check endpoint
 * Requires API key authentication + CORS
 */
export const checkTokenHealth = onRequest({
  region: region,
  secrets: [],
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  logRequest(req);
  await handleTokenHealthCheck(req, res, requireApiKey);
});

/**
 * Daily token health monitoring (cron job)
 * Runs every day at 9 AM UTC to check for expiring tokens
 */
export const dailyTokenMonitoring = onSchedule({
  region: region,
  schedule: 'every day 09:00',
  timeZone: 'Etc/UTC',
  secrets: [],
}, async () => {
  await handleScheduledTokenMonitoring();
});

/**
 * Facebook OAuth callback endpoint
 * Handles redirects from Facebook after user authorization
 * WITH INPUT VALIDATION AND CORS
 */
export const facebookCallback = onRequest({
  region: region,
  secrets: [FACEBOOK_APP_ID, FACEBOOK_APP_SECRET],
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  await handleOAuthCallback( // this is the big file from /handlers/
    req, // http request object that has extra functionality
    res, // http result object also with more functionality
    FACEBOOK_APP_ID.value(),
    FACEBOOK_APP_SECRET.value()
  );
});

/**
 * Facebook Webhook endpoint
 * Receives real-time notifications when events are created/updated/deleted
 * GET - Webhook verification (Facebook sends this to verify the endpoint)
 * POST - Webhook events (Facebook sends these when events change)
 */
export const facebookWebhook = onRequest({
  region: region,
  secrets: [FACEBOOK_APP_SECRET],
}, async (req, res) => {
  await handleFacebookWebhook(
    req,
    res,
    FACEBOOK_APP_SECRET.value(),
    WEBHOOK.VERIFY_TOKEN
  );
});

