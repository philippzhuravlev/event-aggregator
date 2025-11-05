/**
 * Rate Limiting Utilities
 * Simple, practical rate limiting for edge functions
 *
 * Usage:
 * - Per-IP limiting: limiter.check("endpoint-name", clientIp)
 * - Per-token limiting: tokenLimiter.check("token-id")
 * - Brute force: bruteForce.recordFailure(ipAddress)
 */

import { logger } from "../services/logger-service.ts";

// ============================================================================
// SLIDING WINDOW RATE LIMITER
// ============================================================================
// Used for: Public endpoints that need per-IP rate limiting
// Strategy: Track requests in a rolling time window, reject if limit exceeded
// Example: 100 requests per minute per IP

interface SlidingWindowBucket {
  requests: number[];
  windowMs: number;
}

interface SlidingWindowConfig {
  maxRequests: number;
  windowMs: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, SlidingWindowBucket>();
  private configs = new Map<string, SlidingWindowConfig>();
  private cleanupInterval: number | null = null;

  /**
   * Initialize a named rate limiter
   * @param name - Unique identifier for this limiter
   * @param maxRequests - Max requests allowed in window
   * @param windowMs - Time window in milliseconds
   */
  initialize(name: string, maxRequests: number, windowMs: number): void {
    this.configs.set(name, { maxRequests, windowMs });

    // Start cleanup if not already running
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000) as unknown as number;
    }
  }

  /**
   * Check if request should be allowed
   * @param name - Limiter name
   * @param key - Identifier (e.g., IP, user ID)
   * @returns true if allowed, false if rate limited
   */
  check(name: string, key: string): boolean {
    const config = this.configs.get(name);
    if (!config) {
      logger.warn(`Rate limiter "${name}" not initialized`);
      return true; // Allow if not configured
    }

    const bucketKey = `${name}:${key}`;
    const now = Date.now();

    let bucket = this.buckets.get(bucketKey);

    if (!bucket) {
      // First request
      this.buckets.set(bucketKey, {
        requests: [now],
        windowMs: config.windowMs,
      });
      return true;
    }

    // Remove old requests outside the window
    const windowStart = now - config.windowMs;
    bucket.requests = bucket.requests.filter((timestamp) => timestamp > windowStart);

    // Check if at limit
    if (bucket.requests.length >= config.maxRequests) {
      logger.debug(`Rate limit exceeded for "${name}:${key}"`, {
        requests: bucket.requests.length,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
      });
      return false;
    }

    // Add new request
    bucket.requests.push(now);
    return true;
  }

  /**
   * Get current usage for a key
   * @param name - Limiter name
   * @param key - Identifier
   * @returns { used, limit, remaining, resetAt }
   */
  getStatus(name: string, key: string): {
    used: number;
    limit: number;
    remaining: number;
    resetAt: number;
  } {
    const config = this.configs.get(name);
    if (!config) {
      return { used: 0, limit: 0, remaining: 0, resetAt: 0 };
    }

    const bucketKey = `${name}:${key}`;
    const bucket = this.buckets.get(bucketKey);
    const now = Date.now();

    if (!bucket) {
      return {
        used: 0,
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetAt: now + config.windowMs,
      };
    }

    const windowStart = now - config.windowMs;
    const valid = bucket.requests.filter((t) => t > windowStart).length;
    const oldestValid = bucket.requests.find((t) => t > windowStart);
    const resetAt = oldestValid ? oldestValid + config.windowMs : now + config.windowMs;

    return {
      used: valid,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - valid),
      resetAt,
    };
  }

  /**
   * Clean up old buckets to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, bucket] of this.buckets.entries()) {
      // Delete if all requests are older than window + 1 minute
      const oldestRequest = Math.max(...bucket.requests);
      if (now - oldestRequest > bucket.windowMs + 60000) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.buckets.delete(key));

    if (toDelete.length > 0) {
      logger.debug(`Rate limiter cleanup: removed ${toDelete.length} stale buckets`);
    }
  }

  /**
   * Destroy the limiter and clean up intervals
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval as unknown as number);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    this.configs.clear();
  }
}

// ============================================================================
// TOKEN BUCKET RATE LIMITER
// ============================================================================
// Used for: API endpoints that need predictable per-token limits
// Strategy: Tokens are added at a fixed rate; each request costs tokens
// Example: 10 API calls per day per token (tokens refill over 24 hours)

interface TokenBucketData {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per millisecond
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, TokenBucketData>();
  private cleanupInterval: number | null = null;

  constructor() {
    // Start cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) as unknown as number;
  }

  /**
   * Check if token bucket has enough tokens
   * @param key - Token/user identifier
   * @param tokensNeeded - Tokens to consume (default: 1)
   * @param maxTokens - Max tokens in bucket
   * @param refillMs - How long to refill from empty to full
   * @returns true if tokens available, false if rate limited
   */
  check(key: string, tokensNeeded: number = 1, maxTokens: number = 10, refillMs: number = 86400000): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      // Create new bucket (starts full)
      bucket = {
        tokens: maxTokens,
        lastRefill: now,
        maxTokens,
        refillRate: maxTokens / refillMs,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timeSinceRefill = now - bucket.lastRefill;
    const tokensToAdd = timeSinceRefill * bucket.refillRate;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if enough tokens
    if (bucket.tokens < tokensNeeded) {
      logger.debug(`Token bucket rate limit exceeded for "${key}"`, {
        tokensAvailable: Math.floor(bucket.tokens),
        tokensNeeded,
        maxTokens,
      });
      return false;
    }

    // Consume tokens
    bucket.tokens -= tokensNeeded;
    return true;
  }

  /**
   * Get current token bucket status
   * @param key - Token/user identifier
   * @param maxTokens - Max tokens in bucket
   * @param refillMs - Refill time in milliseconds
   * @returns { available, max, nextRefillIn }
   */
  getStatus(key: string, maxTokens: number = 10, refillMs: number = 86400000): {
    available: number;
    max: number;
    nextRefillIn: number;
  } {
    const bucket = this.buckets.get(key);
    const now = Date.now();

    if (!bucket) {
      return {
        available: maxTokens,
        max: maxTokens,
        nextRefillIn: 0,
      };
    }

    const refillRate = maxTokens / refillMs;
    const timeSinceRefill = now - bucket.lastRefill;
    const tokensToAdd = timeSinceRefill * refillRate;
    const available = Math.min(maxTokens, bucket.tokens + tokensToAdd);

    // Time until next token arrives
    const tokensUntilFull = maxTokens - available;
    const nextRefillIn = tokensUntilFull > 0 ? (tokensUntilFull / refillRate) : 0;

    return {
      available: Math.floor(available),
      max: maxTokens,
      nextRefillIn: Math.ceil(nextRefillIn),
    };
  }

  /**
   * Reset a token bucket to full
   * @param key - Token/user identifier
   * @param maxTokens - Max tokens in bucket
   * @param refillMs - Refill time in milliseconds
   */
  reset(key: string, maxTokens: number = 10, refillMs: number = 86400000): void {
    this.buckets.set(key, {
      tokens: maxTokens,
      lastRefill: Date.now(),
      maxTokens,
      refillRate: maxTokens / refillMs,
    });
  }

  /**
   * Clean up old buckets to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    const maxBucketAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > maxBucketAge) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.buckets.delete(key));

    if (toDelete.length > 0) {
      logger.debug(`Token bucket cleanup: removed ${toDelete.length} stale buckets`);
    }
  }

  /**
   * Destroy the limiter and clean up intervals
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval as unknown as number);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}

// ============================================================================
// BRUTE FORCE PROTECTION
// ============================================================================
// Used for: Authentication endpoints that need to prevent brute force attacks
// Strategy: Track failed attempts and temporarily lock out after threshold
// Example: 5 failed login attempts lock out IP for 15 minutes

interface BruteForceBucket {
  attempts: number;
  firstAttempt: number;
  lockedUntil?: number;
}

export class BruteForceProtection {
  private buckets = new Map<string, BruteForceBucket>();
  private cleanupInterval: number | null = null;
  private maxAttempts: number;
  private windowMs: number;
  private lockoutMs: number;

  /**
   * Initialize brute force protection
   * @param maxAttempts - Max failed attempts before lockout (default: 5)
   * @param windowMs - Time window to count attempts (default: 10 minutes)
   * @param lockoutMs - How long to lock out (default: 15 minutes)
   */
  constructor(maxAttempts: number = 5, windowMs: number = 600000, lockoutMs: number = 900000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;

    // Start cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) as unknown as number;
  }

  /**
   * Record a failed attempt
   * @param key - Identifier (e.g., IP, username)
   * @returns { locked: boolean, attemptsRemaining: number, lockedUntil?: number }
   */
  recordFailure(key: string): {
    locked: boolean;
    attemptsRemaining: number;
    lockedUntil?: number;
  } {
    const now = Date.now();

    let bucket = this.buckets.get(key);

    // Check if currently locked
    if (bucket?.lockedUntil && now < bucket.lockedUntil) {
      return {
        locked: true,
        attemptsRemaining: 0,
        lockedUntil: bucket.lockedUntil,
      };
    }

    if (!bucket) {
      // First attempt
      bucket = {
        attempts: 1,
        firstAttempt: now,
      };
      this.buckets.set(key, bucket);
      return {
        locked: false,
        attemptsRemaining: this.maxAttempts - 1,
      };
    }

    // Check if window has reset
    if (now - bucket.firstAttempt > this.windowMs) {
      bucket.attempts = 1;
      bucket.firstAttempt = now;
      delete bucket.lockedUntil;
      return {
        locked: false,
        attemptsRemaining: this.maxAttempts - 1,
      };
    }

    // Increment attempts
    bucket.attempts++;

    if (bucket.attempts >= this.maxAttempts) {
      // Lock out
      bucket.lockedUntil = now + this.lockoutMs;
      logger.warn(`Brute force lockout for "${key}"`, {
        attempts: bucket.attempts,
        lockedUntil: new Date(bucket.lockedUntil).toISOString(),
      });
      return {
        locked: true,
        attemptsRemaining: 0,
        lockedUntil: bucket.lockedUntil,
      };
    }

    return {
      locked: false,
      attemptsRemaining: this.maxAttempts - bucket.attempts,
    };
  }

  /**
   * Record a successful attempt (resets the counter)
   * @param key - Identifier
   */
  recordSuccess(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Check if key is currently locked out
   * @param key - Identifier
   * @returns true if locked
   */
  isLocked(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket?.lockedUntil) return false;
    return Date.now() < bucket.lockedUntil;
  }

  /**
   * Get brute force status
   * @param key - Identifier
   * @returns { locked, attempts, attemptsRemaining, lockedUntil? }
   */
  getStatus(key: string): {
    locked: boolean;
    attempts: number;
    attemptsRemaining: number;
    lockedUntil?: number;
  } {
    const bucket = this.buckets.get(key);
    const now = Date.now();

    if (!bucket) {
      return {
        locked: false,
        attempts: 0,
        attemptsRemaining: this.maxAttempts,
      };
    }

    const locked = bucket.lockedUntil ? now < bucket.lockedUntil : false;

    return {
      locked,
      attempts: bucket.attempts,
      attemptsRemaining: Math.max(0, this.maxAttempts - bucket.attempts),
      lockedUntil: bucket.lockedUntil,
    };
  }

  /**
   * Clean up old buckets to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, bucket] of this.buckets.entries()) {
      // Delete if not locked and window has passed + 1 hour buffer
      if (!bucket.lockedUntil && now - bucket.firstAttempt > this.windowMs + 3600000) {
        toDelete.push(key);
      }
      // Delete if lock has expired + 1 hour buffer
      if (bucket.lockedUntil && now - bucket.lockedUntil > 3600000) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.buckets.delete(key));

    if (toDelete.length > 0) {
      logger.debug(`Brute force protection cleanup: removed ${toDelete.length} stale buckets`);
    }
  }

  /**
   * Destroy the protection and clean up intervals
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval as unknown as number);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract client IP from request
 * Handles proxies and load balancers via x-forwarded-for header
 * @param request - Fetch API Request object
 * @returns IP address or "unknown"
 */
export function getClientIp(request: Request): string {
  // Check x-forwarded-for first (used by proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP if there are multiple
    return forwarded.split(",")[0].trim();
  }

  // Fall back to cf-connecting-ip (Cloudflare)
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  return "unknown";
}

/**
 * Create rate limit headers for responses
 * @param status - Rate limit status from getStatus()
 * @returns Headers object
 */
export function getRateLimitHeaders(status: { used?: number; limit?: number; resetAt?: number }): Record<string, string> {
  const headers: Record<string, string> = {};

  if (status.limit) {
    headers["X-RateLimit-Limit"] = String(status.limit);
  }
  if (status.used !== undefined) {
    headers["X-RateLimit-Used"] = String(status.used);
  }
  if (status.resetAt) {
    headers["X-RateLimit-Reset"] = String(Math.ceil((status.resetAt - Date.now()) / 1000));
  }

  return headers;
}

/**
 * Create a rate limit exceeded error response
 * @param resetAt - When the limit resets (timestamp in ms)
 * @returns Response object
 */
export function getRateLimitExceededResponse(resetAt?: number): Response {
  const retryAfter = resetAt ? Math.ceil((resetAt - Date.now()) / 1000) : 60;

  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
