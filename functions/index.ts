import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

// this is the big file where the magic happens. We've made a lot of handlers that "do stuff",
// middleware that guards front- and backend, and constants that are used by both (and more).
// then we just pass them to firebase functions and let them do their magic.

// import handlers
import { handleOAuthCallback } from './handlers/oauth-callback';
import { handleManualSync, handleScheduledSync } from './handlers/sync-events';
import { handleTokenHealthCheck, handleScheduledTokenMonitoring } from './handlers/token-monitor';
import { handleFacebookWebhook } from './handlers/facebook-webhooks';
import { handleManualCleanup, handleScheduledCleanup } from './handlers/cleanup-events';
import { handleHealthCheck } from './handlers/health-check';

// import middleware
import { requireApiKey, logRequest } from './middleware/auth';
import { handleCORS } from './middleware/validation';
import { standardRateLimiter, webhookRateLimiter, oauthRateLimiter } from './middleware/rate-limit';

// import constants
import { SYNC, region, WEBHOOK, CLEANUP } from './utils/constants';

// Initialize Firebase Admin
admin.initializeApp();

// more consts
const FACEBOOK_APP_ID = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');

/**
 * Manual sync facebook endpoints
 * NOW REQUIRES API KEY AUTHENTICATION + CORS + RATE LIMITING
 */
export const syncFacebook = onRequest({ 
  region: region,
  secrets: [] 
}, async (req, res) => {
  // Handle CORS preflight and validate origin
  if (!handleCORS(req, res)) return;
  
  // Apply rate limiting
  await new Promise<void>((resolve) => {
    standardRateLimiter(req as any, res as any, () => resolve());
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
const FACEBOOK_APP_ID_SECRET = defineSecret('FACEBOOK_APP_ID');
const FACEBOOK_APP_SECRET_SECRET = defineSecret('FACEBOOK_APP_SECRET');
const MAIL_SMTP_HOST = defineSecret('MAIL_SMTP_HOST');
const MAIL_SMTP_USER = defineSecret('MAIL_SMTP_USER');
const MAIL_SMTP_PASS = defineSecret('MAIL_SMTP_PASS');

export const dailyTokenRefresh = onSchedule({
  region: region,
  schedule: 'every day 03:00',
  timeZone: 'Etc/UTC',
  secrets: [
    FACEBOOK_APP_ID_SECRET, 
    FACEBOOK_APP_SECRET_SECRET,
    MAIL_SMTP_HOST,
    MAIL_SMTP_USER,
    MAIL_SMTP_PASS,
  ],
}, async () => {
  // yeah this means that we're importing this function only when needed, something programmers
  // call "lazy loading" or if they're full of themselves (like me), "dynamic import". It's 
  // actually quite helpful because it's efficient and prevents "circular dependencies" issues
  const { handleScheduledTokenRefresh } = await import('./handlers/token-refresh.js');
  await handleScheduledTokenRefresh(
    FACEBOOK_APP_ID_SECRET.value(), 
    FACEBOOK_APP_SECRET_SECRET.value(),
    {
      host: MAIL_SMTP_HOST.value(),
      user: MAIL_SMTP_USER.value(),
      pass: MAIL_SMTP_PASS.value(),
      port: 587, // Gmail SMTP with STARTTLS
      from: 'no-reply@dtuevent.dk', // Your desired from address
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
  await new Promise<void>((resolve) => {
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
export const facebookWebhook = onRequest({
  region: region,
  secrets: [FACEBOOK_APP_SECRET],
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
    WEBHOOK.VERIFY_TOKEN
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

