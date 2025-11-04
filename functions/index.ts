import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

// generally, index files is the confusing name given for the main entry and exit points of a module
// as you can see, it consists of just importing all of our handlers, middleware, utils etc etc

// But in reality, this is the big file where the magic happens, because we export it to a server.
// This also means that it goes beyond imports and exports, but also functions and initializes the server etc

// import handlers
import { handleOAuthCallback } from './handlers/oauth-callback';
import { handleManualSync } from './handlers/sync-events';
import { handleTokenHealthCheck } from './handlers/token-monitor';
import { handleFacebookWebhook } from './handlers/facebook-webhooks';
import { handleManualCleanup } from './handlers/cleanup-events';
import { handleHealthCheck } from './handlers/health-check';
import { handleGetEvents } from './handlers/get-events';

// import middleware
import { requireApiKey, logRequest } from './middleware/auth';
import { handleCORS } from './middleware/validation';
import { standardRateLimiter, webhookRateLimiter, oauthRateLimiter } from './middleware/rate-limit';

const app = express();
const port = process.env.PORT || 8080;

// Secrets from environment variables
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const facebookAppId = process.env.FACEBOOK_APP_ID || '';
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || '';
const webhookVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to attach Supabase client to request
app.use((req, res, next) => {
  (req as any).supabase = supabase;
  next();
});

app.use(logRequest);
app.use(handleCORS);

app.post('/sync-facebook', standardRateLimiter, requireApiKey, handleManualSync);
app.get('/check-token-health', standardRateLimiter, requireApiKey, handleTokenHealthCheck);
app.post('/cleanup-events', standardRateLimiter, requireApiKey, handleManualCleanup);

app.get('/facebook-callback', oauthRateLimiter, (req, res) => handleOAuthCallback(req, res, facebookAppId, facebookAppSecret));
app.all('/facebook-webhook', webhookRateLimiter, (req, res) => handleFacebookWebhook(req, res, facebookAppSecret, webhookVerifyToken));

app.get('/health-check', handleHealthCheck);
app.get('/get-events', standardRateLimiter, handleGetEvents);

// TODO: Replace with a cron job or a similar mechanism
// nightlySyncFacebook
// dailyTokenMonitoring
// dailyTokenRefresh
// weeklyEventCleanup

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
