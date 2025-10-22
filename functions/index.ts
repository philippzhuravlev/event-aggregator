import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

// generally, index files is the confusing name given for the main entry and exit points of a module
// as you can see, it consists of just importing all of our handlers, middleware, utils etc etc

// But in reality, this is the big file where the magic happens, because we export it to Firebase Functions.
// that's because it's in [firebase] /functions/; if it was in /schemas/, it'd be the index for schemas. 
// This also means that it goes beyond imports and exports, but also functions and initializes admin etc

// import handlers
import { handleOAuthCallback } from './handlers/oauth-callback';
import { handleManualSync, handleScheduledSync } from './handlers/sync-events';
import { handleTokenHealthCheck, handleScheduledTokenMonitoring } from './handlers/token-monitor';
import { handleFacebookWebhook } from './handlers/facebook-webhooks';
import { handleManualCleanup, handleScheduledCleanup } from './handlers/cleanup-events';
import { handleHealthCheck } from './handlers/health-check';
import { handleGetEvents } from './handlers/get-events';

// import middleware
import { requireApiKey, logRequest } from './middleware/auth';
import { handleCORS } from './middleware/validation';
import { standardRateLimiter, webhookRateLimiter, oauthRateLimiter } from './middleware/rate-limit';

// import constants
import { SYNC, region, CLEANUP, EMAIL } from './utils/constants';

// Initialize Firebase Admin
admin.initializeApp(); // also note that initializing firebase admin is necessary for using firestore, storage, etc
// because without it, we don't have the right permissions to access those services

// more consts
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID'); // pulled from Google Secret Manager
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

/**
 * Manual sync facebook endpoints
 * NOW REQUIRES API KEY AUTHENTICATION + CORS + RATE LIMITING
 */
export const syncFacebook = onRequest({ 
  region: region,
  secrets: [] 
}, async (req, res) => {
  // The reason why we put this as a function rather than just imports/exports is because firebase functions needs to
  // initialize and run these functions when called, not before. So we need to wrap them in a function that firebase
  // can call when the endpoint is hit (like a handler). This is also where we apply middleware like CORS and rate limiting.
  
  if (!handleCORS(req, res)) return;
  
  // Apply rate limiting
  await new Promise<void>((resolve) => {
    standardRateLimiter(req as any, res as any, () => resolve());
    // if you're wondering why "as any", it's because express-rate-limit expects express Request/Response types,
    // but firebase-functions/v2/https Request/Response are slightly different. So we cast them to "any"
    // 
  });
  
  // Check if rate limit was triggered (response already sent)
  if (res.headersSent) return;
  
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
 * Requires API key authentication + CORS + RATE LIMITING
 */
export const checkTokenHealth = onRequest({
  region: region,
  secrets: [],
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  // apply rate limiting
  await new Promise<void>((resolve) => {
    standardRateLimiter(req as any, res as any, () => resolve());
  });
  
  if (res.headersSent) return;
  
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

// Scheduled token refresh (daily at 03:00 UTC) - automatically refresh tokens nearing expiry
const FACEBOOK_APP_ID_SECRET = defineSecret('FACEBOOK_APP_ID'); // pull these secrets from Google Secret Manager
const FACEBOOK_APP_SECRET_SECRET = defineSecret('FACEBOOK_APP_SECRET');
const MAIL_SMTP_HOST = defineSecret('MAIL_SMTP_HOST');
const MAIL_SMTP_USER = defineSecret('MAIL_SMTP_USER');
const MAIL_SMTP_PASS = defineSecret('MAIL_SMTP_PASS');

export const dailyTokenRefresh = onSchedule({
  region: region, // for us, it's europe-west1
  schedule: 'every day 03:00',
  timeZone: 'Etc/UTC',
  secrets: [ // pull in all necessary secrets
    FACEBOOK_APP_ID_SECRET, 
    FACEBOOK_APP_SECRET_SECRET,
    MAIL_SMTP_HOST,
    MAIL_SMTP_USER,
    MAIL_SMTP_PASS,
  ],
}, async () => {
  // below: await import means that we're importing this function only when needed, something programmers
  // call "lazy loading" or if they're full of themselves (like me), "dynamic import". So it's not at the
  // top of the page, but inside our function (which is async'd btw and uses TS' amazing => shortcut, which
  // is just a more concise way of writing functions instead of writing the whole "function ... () { ... }"
  // TS is sometimes awful but it's full of these little things people call "syntactic sugar"
  const { handleScheduledTokenRefresh } = await import('./handlers/token-refresh.js');
  await handleScheduledTokenRefresh(
    FACEBOOK_APP_ID_SECRET.value(), 
    FACEBOOK_APP_SECRET_SECRET.value(),
    { // SMTP = Simple Mail Transfer Protocol, standard for sending emails
      host: MAIL_SMTP_HOST.value(), // HOST = SMTP server host (e.g. gmail)
      user: MAIL_SMTP_USER.value(), // USER = email account username
      pass: MAIL_SMTP_PASS.value(), // PASSWORD = email account password, stored as a secret
      port: EMAIL.SMTP_PORT, // PORT = SMTP server port (e.g. 587 for Gmail)
      from: 'no-reply@dtuevent.dk', // Email from address
    }
  );
});

/**
 * Facebook OAuth callback endpoint
 * Handles redirects from Facebook after user authorization
 * WITH INPUT VALIDATION, CORS, AND RATE LIMITING
 */
export const facebookCallback = onRequest({
  region: region,
  secrets: [FACEBOOK_APP_ID, FACEBOOK_APP_SECRET],
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  // apply OAuth rate limiting (strict)
  await new Promise<void>((resolve) => { // again, => is just a shorthand for function () {} etc
    oauthRateLimiter(req as any, res as any, () => resolve());
  });
  
  if (res.headersSent) return;
  
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
 * WITH RATE LIMITING (lenient for Facebook bursts)
 */
const WEBHOOK_VERIFY_TOKEN_SECRET = defineSecret('WEBHOOK_VERIFY_TOKEN');
export const facebookWebhook = onRequest({
  region: region,
  secrets: [FACEBOOK_APP_SECRET, WEBHOOK_VERIFY_TOKEN_SECRET],
}, async (req, res) => {
  // apply webhook rate limiting (lenient for Facebook)
  await new Promise<void>((resolve) => {
    webhookRateLimiter(req as any, res as any, () => resolve());
  });
  
  if (res.headersSent) return;
  
  await handleFacebookWebhook(
    req,
    res,
    FACEBOOK_APP_SECRET.value(),
    WEBHOOK_VERIFY_TOKEN_SECRET.value()
  );
});

/**
 * Manual event cleanup endpoint
 * Deletes events older than specified days (default: 90)
 * Requires API key authentication + CORS + RATE LIMITING
 * Query params: ?daysToKeep=90&dryRun=true&archive=true
 */
export const cleanupEvents = onRequest({
  region: region,
  secrets: [],
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  // apply rate limiting
  await new Promise<void>((resolve) => {
    standardRateLimiter(req as any, res as any, () => resolve());
  });
  
  if (res.headersSent) return;
  
  logRequest(req);
  await handleManualCleanup(req, res, requireApiKey);
});

/**
 * Scheduled event cleanup (cron job)
 * Runs weekly on Sundays at 3 AM UTC
 * Deletes events older than 90 days and archives them to Cloud Storage
 */
export const weeklyEventCleanup = onSchedule({
  region: region,
  schedule: CLEANUP.SCHEDULE,
  timeZone: CLEANUP.TIMEZONE,
  secrets: [],
}, handleScheduledCleanup);

/**
 * Health check endpoint
 * Returns http status code "200" if healthy, "503" if unhealthy
 * Checks: Firestore, Storage, Secret Manager connectivity
 */
export const checkHealth = onRequest({
  region: region,
  secrets: [],
}, async (req, res) => {
  await handleHealthCheck(req, res);
});

/**
 * Get events with pagination
 * GET /getEvents?limit=50&pageToken=xyz&pageId=123&upcoming=true&search=party
 * No authentication required - public read access
 * CORS enabled for web app access
 */
export const getEvents = onRequest({
  region: region,
  secrets: [],
}, async (req, res) => {
  // Do CORS stuff first
  if (!handleCORS(req, res)) return;
  
  // Now do rate limiting
  await new Promise<void>((resolve) => {
    standardRateLimiter(req as any, res as any, () => resolve());
  });
  
  if (res.headersSent) return;
  
  // Now handle the actual request
  await handleGetEvents(req, res); 
});