import express from 'express'; // a node js web app "framework" (a bunch of tools in a system)
import rateLimit from 'express-rate-limit';
import { RATE_LIMITS, TRUSTED_PROXIES } from '../utils/constants';
import { logger } from '../utils/logger';

const app = express(); // here we create the express app. It's a surprise too that'll help us later with proxies and rate limiting
app.set('trust proxy', TRUSTED_PROXIES); // and here's what we're using express for, to trust only specific proxies

// So in the broadest sense middleware is any software that works between 
// apps and services etc. Usually that means security, little "checkpoints"

// Rate limiting is also classic middleware. It prevents abuse by limiting how many
// requests someone can make in a given time window. This protects against:
// - DDoS attacks
// - Brute force attempts
// - API abuse
// - Accidental infinite loops in client code

/**
 * Standard rate limiter for authenticated endpoints
 * 100 requests per 15 minutes
 * Used for: manual sync, token health check, cleanup
 */
export const standardRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.STANDARD.WINDOW_MS,
  max: RATE_LIMITS.STANDARD.MAX_REQUESTS,
  message: {
    error: 'Too many requests',
    message: `Rate limit exceeded. Maximum ${RATE_LIMITS.STANDARD.MAX_REQUESTS} requests per ${RATE_LIMITS.STANDARD.WINDOW_MS / 60000} minutes.`,
    retryAfter: RATE_LIMITS.STANDARD.WINDOW_MS / 1000, // seconds
  },
  standardHeaders: true, // Return rate limit info into the HTTP `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers. This is used by older browsers.
  keyGenerator: (req) => {
    // so the key generateor is what identifies a user - each user has its own key whenever it makes
    // a http request. This is important because it means that if one user abuses the system (e.g. 
    // by sending too many requests), we can block just that user without affecting others. Usually
    // it's the IP address, but if they're using proxies (e.g. cloudflare, firebase), then it can be
    // so easily bypassed that it's not even funny. And so, we use express with trusted proxies and
    // pull x-forwareded-for header first, then the usual request IP ("req.ip")
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    return Array.isArray(ip) ? ip[0] : ip; // Use the first IP in the chain. Note the ? : notation,
    // which is just "if then", i.e. "if ip is an array, use the first element ([0]), else use ip as is" 
  },
  
  // Log when rate limit is hit
  handler: (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    logger.warn('Rate limit exceeded', {
      ip,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${RATE_LIMITS.STANDARD.MAX_REQUESTS} requests per ${RATE_LIMITS.STANDARD.WINDOW_MS / 60000} minutes.`,
      retryAfter: RATE_LIMITS.STANDARD.WINDOW_MS / 1000,
    });
  },
});

/**
 * Webhook rate limiter for Facebook webhook endpoint
 * 1000 requests per minute (Facebook can send bursts)
 * More lenient because Facebook controls the rate
 */
export const webhookRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.WEBHOOK.WINDOW_MS,
  max: RATE_LIMITS.WEBHOOK.MAX_REQUESTS,
  message: {
    error: 'Webhook rate limit exceeded',
    message: `Too many webhook requests. Maximum ${RATE_LIMITS.WEBHOOK.MAX_REQUESTS} per minute.`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  // Use default keyGenerator for IPv6 safety
  // Webhooks from Facebook will be tracked by their IP
  
  handler: (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    logger.critical('Webhook rate limit exceeded - possible attack', new Error('Rate limit exceeded'), {
      ip,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });
    
    res.status(429).json({
      error: 'Webhook rate limit exceeded',
      message: 'Too many requests',
    });
  },
});

/**
 * OAuth rate limiter for authentication callback
 * 10 requests per 15 minutes (very restrictive)
 * Protects against OAuth abuse
 */
export const oauthRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.OAUTH.WINDOW_MS,
  max: RATE_LIMITS.OAUTH.MAX_REQUESTS,
  message: {
    error: 'OAuth rate limit exceeded',
    message: `Too many OAuth attempts. Maximum ${RATE_LIMITS.OAUTH.MAX_REQUESTS} per ${RATE_LIMITS.OAUTH.WINDOW_MS / 60000} minutes.`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  
  // Use default keyGenerator (IPv6 safe)
  
  handler: (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    logger.warn('OAuth rate limit exceeded', {
      ip,
      path: req.path,
      userAgent: req.headers['user-agent'],
      state: req.query.state,
    });
    
    res.status(429).json({
      error: 'OAuth rate limit exceeded',
      message: 'Too many authentication attempts. Please try again later.',
    });
  },
});

