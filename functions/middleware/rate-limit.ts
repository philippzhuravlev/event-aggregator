import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../utils/constants';
import { logger } from '../utils/logger';

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
  
  // Custom key generator (uses IP address)
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
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
  
  keyGenerator: (req) => {
    // For webhooks, we trust Facebook's IP but still track it
    return req.ip || req.headers['x-forwarded-for'] as string || 'facebook-webhook';
  },
  
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
  
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
  },
  
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

