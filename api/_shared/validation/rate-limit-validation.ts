/**
 * Rate Limiting Utilities
 * Simple, practical rate limiting for Node.js server
 *
 * Usage:
 * - Per-IP limiting: limiter.check("endpoint-name", clientIp)
 * - Per-token limiting: tokenLimiter.check("token-id")
 * - Brute force: bruteForce.recordFailure(ipAddress)
 */

import { logger } from "../services/logger-service";
import type {
    BruteForceEntry,
    SlidingWindowBucket,
    SlidingWindowConfig,
    TokenBucket,
} from "../types";

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// We have three main rate limiting strategies here:
// 1. Sliding Window Rate Limiter - for general per-IP rate limiting
// 2. Token Bucket Rate Limiter - for predictable per-token limits
// 3. Brute Force Protection - for authentication endpoints to prevent abuse

// ============================================================================
// SLIDING WINDOW RATE LIMITER
// ============================================================================
// Used for: Public endpoints that need per-IP rate limiting
// Strategy: Track requests in a rolling time window, reject if limit exceeded
// Example: 100 requests per minute per IP

export class SlidingWindowRateLimiter {
    private buckets = new Map<string, SlidingWindowBucket>();
    private configs = new Map<string, SlidingWindowConfig>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
            this.cleanupInterval = setInterval(
                () => this.cleanup(),
                60000,
            );
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

        const bucket = this.buckets.get(bucketKey);

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
        bucket.requests = bucket.requests.filter((timestamp) =>
            timestamp > windowStart
        );

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
        const resetAt = oldestValid
            ? oldestValid + config.windowMs
            : now + config.windowMs;

        return {
            used: valid,
            limit: config.maxRequests,
            remaining: Math.max(0, config.maxRequests - valid),
            resetAt,
        };
    }

    /**
     * Reset a specific bucket
     * @param name - Limiter name
     * @param key - Identifier to reset
     */
    reset(name: string, key: string): void {
        const bucketKey = `${name}:${key}`;
        this.buckets.delete(bucketKey);
    }

    /**
     * Clean up old buckets to prevent memory leaks
     * @private
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [bucketKey, bucket] of this.buckets) {
            const windowStart = now - bucket.windowMs;
            bucket.requests = bucket.requests.filter((t) => t > windowStart);

            if (bucket.requests.length === 0) {
                this.buckets.delete(bucketKey);
            }
        }
    }

    /**
     * Destroy the limiter and clean up resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.buckets.clear();
        this.configs.clear();
    }
}

// ============================================================================
// TOKEN BUCKET RATE LIMITER
// ============================================================================
// Used for: Per-user/token rate limiting with burst capacity
// Strategy: Tokens refill at a constant rate, requests consume tokens
// Example: 10 tokens per second, max 50 tokens

export class TokenBucketRateLimiter {
    private buckets = new Map<string, TokenBucket>();
    private config: {
        refillRate: number; // tokens per second
        maxTokens: number; // burst capacity
    };

    constructor(refillRate: number = 10, maxTokens: number = 50) {
        this.config = { refillRate, maxTokens };
    }

    /**
     * Check if request should be allowed
     * @param key - Identifier (e.g., user ID, token)
     * @param tokensRequired - Number of tokens needed (default: 1)
     * @returns true if allowed, false if rate limited
     */
    check(key: string, tokensRequired: number = 1): boolean {
        const bucket = this.getOrCreateBucket(key);
        const now = Date.now();

        // Calculate tokens to add based on time elapsed
        const timeSinceRefill = (now - bucket.lastRefill) / 1000; // convert to seconds
        const tokensToAdd = timeSinceRefill * this.config.refillRate;

        // Add tokens (capped at max)
        bucket.tokens = Math.min(
            this.config.maxTokens,
            bucket.tokens + tokensToAdd,
        );
        bucket.lastRefill = now;

        // Check if we have enough tokens
        if (bucket.tokens >= tokensRequired) {
            bucket.tokens -= tokensRequired;
            return true;
        }

        return false;
    }

    /**
     * Get bucket for key, creating if needed
     * @private
     */
    private getOrCreateBucket(key: string): TokenBucket {
        if (!this.buckets.has(key)) {
            this.buckets.set(key, {
                tokens: this.config.maxTokens,
                lastRefill: Date.now(),
            });
        }
        return this.buckets.get(key)!;
    }

    /**
     * Get current token count for a key
     * @param key - Identifier
     * @returns Current token count
     */
    getTokens(key: string): number {
        const bucket = this.buckets.get(key);
        if (!bucket) return this.config.maxTokens;

        const now = Date.now();
        const timeSinceRefill = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = timeSinceRefill * this.config.refillRate;
        return Math.min(
            this.config.maxTokens,
            bucket.tokens + tokensToAdd,
        );
    }

    /**
     * Reset bucket for a key
     * @param key - Identifier to reset
     */
    reset(key: string): void {
        this.buckets.delete(key);
    }
}

// ============================================================================
// BRUTE FORCE PROTECTION
// ============================================================================
// Used for: Authentication endpoints to prevent brute force attacks
// Strategy: Track failed attempts, lock after threshold

export class BruteForceProtection {
    private entries = new Map<string, BruteForceEntry>();
    private config: {
        maxFailures: number;
        lockoutMs: number;
        resetMs: number;
    };

    constructor(
        maxFailures: number = 5,
        lockoutMs: number = 15 * 60 * 1000, // 15 minutes
        resetMs: number = 60 * 60 * 1000, // 1 hour
    ) {
        this.config = { maxFailures, lockoutMs, resetMs };
    }

    /**
     * Check if an IP/user is currently locked out
     * @param key - Identifier (IP, username, etc.)
     * @returns true if locked, false if allowed
     */
    isLocked(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;

        const now = Date.now();

        // Check if lockout has expired
        if (entry.lockedUntil && now > entry.lockedUntil) {
            entry.locked = false;
            entry.lockedUntil = undefined;
        }

        return entry.locked;
    }

    /**
     * Record a failed attempt
     * @param key - Identifier
     * @returns Remaining attempts before lockout
     */
    recordFailure(key: string): number {
        const now = Date.now();
        let entry = this.entries.get(key);

        if (!entry) {
            entry = {
                failures: 1,
                lastFailure: now,
                locked: false,
            };
        } else {
            // Reset failures if window has expired
            if (now - entry.lastFailure > this.config.resetMs) {
                entry.failures = 1;
            } else {
                entry.failures++;
            }
            entry.lastFailure = now;
        }

        // Lock if max failures reached
        if (entry.failures >= this.config.maxFailures) {
            entry.locked = true;
            entry.lockedUntil = now + this.config.lockoutMs;
        }

        this.entries.set(key, entry);
        return Math.max(0, this.config.maxFailures - entry.failures);
    }

    /**
     * Record a successful attempt (resets failures)
     * @param key - Identifier
     */
    recordSuccess(key: string): void {
        this.entries.delete(key);
    }

    /**
     * Get failure count for a key
     * @param key - Identifier
     * @returns Failure count
     */
    getFailureCount(key: string): number {
        const entry = this.entries.get(key);
        if (!entry) return 0;

        const now = Date.now();
        // Reset if window has expired
        if (now - entry.lastFailure > this.config.resetMs) {
            return 0;
        }

        return entry.failures;
    }

    /**
     * Get lockout time remaining (milliseconds) for a key
     * @param key - Identifier
     * @returns Milliseconds until lockout expires, or 0 if not locked
     */
    getLockoutTimeRemaining(key: string): number {
        const entry = this.entries.get(key);
        if (!entry || !entry.locked || !entry.lockedUntil) return 0;

        const now = Date.now();
        return Math.max(0, entry.lockedUntil - now);
    }

    /**
     * Reset failed attempts for a key
     * @param key - Identifier
     */
    reset(key: string): void {
        this.entries.delete(key);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract client IP from request
 * Handles proxies (X-Forwarded-For header)
 * @param request - Express/Node.js request object
 * @returns Client IP address
 */
export function getClientIp(request: Record<string, unknown>): string {
    // Check for proxy headers
    const xForwardedFor = (request.headers as Record<string, unknown>)?.[
        "x-forwarded-for"
    ];
    if (xForwardedFor) {
        const ips = String(xForwardedFor).split(",");
        return ips[0].trim();
    }

    // Fallback to connection remote address
    return (
        (request.socket as Record<string, unknown>)?.remoteAddress as string ||
        (request.connection as Record<string, unknown>)
            ?.remoteAddress as string ||
        (request.ip as string) ||
        "unknown"
    );
}

/**
 * Create rate limit response headers
 * @param status - Rate limiter status
 * @returns Headers object
 */
export function getRateLimitHeaders(status: {
    used: number;
    limit: number;
    remaining: number;
    resetAt: number;
}): Record<string, string> {
    return {
        "X-RateLimit-Limit": status.limit.toString(),
        "X-RateLimit-Used": status.used.toString(),
        "X-RateLimit-Remaining": status.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(status.resetAt / 1000).toString(),
    };
}

/**
 * Create rate limit exceeded response
 * @param retryAfter - Seconds to retry after
 * @returns Response object
 */
export function getRateLimitExceededResponse(retryAfter: number = 60): {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
} {
    return {
        status: 429,
        headers: {
            "Retry-After": retryAfter.toString(),
            "Content-Type": "application/json",
        },
        body: {
            error: "Too Many Requests",
            retryAfter,
        },
    };
}
