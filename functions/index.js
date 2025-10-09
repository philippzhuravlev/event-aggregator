const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// this is the big file where the magic happens. It uses **handlers**, which 
// execute business logic, and **services** which are connections to external
// services supplied by google/meta, e.g. facebook api or firestore

// also notice how this fle and the handlers/services are .js files instead of
// .ts files. Firebase Functions just have better support with those.Also 
// we're in backend so it doesnt matter much compared to /web/ frontend

// import handlers
const { handleOAuthCallback } = require('./handlers/oauth-callback');
const { handleManualSync, handleScheduledSync } = require('./handlers/sync-events');
const { handleTokenHealthCheck, handleScheduledTokenMonitoring } = require('./handlers/token-monitor');

// import middleware
const { requireApiKey, logRequest } = require('./middleware/auth');

// import constants
const { SYNC } = require('./utils/constants');

// Initialize Firebase Admin
admin.initializeApp();

// more consts
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

/**
 * Manual sync facebook endpoints
 * GET/POST https://europe-west1-dtuevent-8105b.cloudfunctions.net/syncFacebook
 * Note: Changed to europe-west1 to match facebookCallback region
 * NOW REQUIRES API KEY AUTHENTICATION
 */
exports.syncFacebook = onRequest({ 
  region: 'europe-west1',
  secrets: [] 
}, async (req, res) => {
  logRequest(req);
  await handleManualSync(req, res, requireApiKey);
});

/**
 * Cronjob sync, runs every 12 hours
 * What it does is that it syncs events from all active Facebook pages
 */
exports.nightlySyncFacebook = onSchedule({
  region: 'europe-west1',
  schedule: SYNC.SCHEDULE,
  timeZone: SYNC.TIMEZONE,
  secrets: [],
}, handleScheduledSync);

/**
 * Token health check endpoint
 * GET https://europe-west1-dtuevent-8105b.cloudfunctions.net/checkTokenHealth
 * Requires API key authentication
 */
exports.checkTokenHealth = onRequest({
  region: 'europe-west1',
  secrets: [],
}, async (req, res) => {
  logRequest(req);
  await handleTokenHealthCheck(req, res, requireApiKey);
});

/**
 * Daily token health monitoring (cron job)
 * Runs every day at 9 AM UTC to check for expiring tokens
 */
exports.dailyTokenMonitoring = onSchedule({
  region: 'europe-west1',
  schedule: 'every day 09:00',
  timeZone: 'Etc/UTC',
  secrets: [],
}, handleScheduledTokenMonitoring);

/**
 * Facebook OAuth callback endpoint
 * Handles redirects from Facebook after user authorization
 * GET https://europe-west1-dtuevent-8105b.cloudfunctions.net/facebookCallback
 */
exports.facebookCallback = onRequest({
  region: 'europe-west1',
  secrets: [FACEBOOK_APP_ID, FACEBOOK_APP_SECRET],
}, async (req, res) => {
  await handleOAuthCallback( // this is the big file from /handlers/
    req, // http request object that has extra functionality
    res, // http result object also with more functionality
    FACEBOOK_APP_ID.value(),
    FACEBOOK_APP_SECRET.value()
  );
});


