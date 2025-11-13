/**
 * Placeholder for shared rate limit validation utilities.
 */
import { createBaseCorsHeaders, createCorsHeaders } from "../runtime/base.ts";
import type {
  BruteForceEntry,
  SlidingWindowConfig,
  SlidingWindowStatus,
  TokenBucketState,
} from "../types.ts";

type RateLimitLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
};

const noop = () => {};

let rateLimitLogger: RateLimitLogger = {
  debug: noop,
  warn: noop,
};

const BASE_CORS_HEADERS = createBaseCorsHeaders();

export function setRateLimitLogger(logger: RateLimitLogger): void {
  rateLimitLogger = {
    debug: logger.debug ?? noop,
    warn: logger.warn ?? noop,
  };
}

export interface SlidingWindowLimiterConfig extends SlidingWindowConfig {
  name: string;
}

export interface SlidingWindowLimiter {
  check(key: string): boolean;
  getStatus(key: string): SlidingWindowStatus;
  reset(key: string): void;
  destroy(): void;
}

interface SlidingWindowBucket {
  requests: number[];
  windowMs: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, SlidingWindowBucket>();
  private configs = new Map<string, SlidingWindowConfig>();
  private cleanupInterval: ReturnType<typeof globalThis.setInterval> | null =
    null;

  initialize(name: string, maxRequests: number, windowMs: number): void {
    this.configs.set(name, { maxRequests, windowMs });

    if (!this.cleanupInterval) {
      this.cleanupInterval = globalThis.setInterval(
        () => this.cleanup(),
        60000,
      );
    }
  }

  check(name: string, key: string): boolean {
    const config = this.configs.get(name);
    if (!config) {
      rateLimitLogger.warn?.(`Rate limiter "${name}" not initialized`);
      return true;
    }

    const bucketKey = `${name}:${key}`;
    const now = Date.now();
    const bucket = this.buckets.get(bucketKey);

    if (!bucket) {
      this.buckets.set(bucketKey, {
        requests: [now],
        windowMs: config.windowMs,
      });
      return true;
    }

    const windowStart = now - config.windowMs;
    bucket.requests = bucket.requests.filter((timestamp) =>
      timestamp > windowStart
    );

    if (bucket.requests.length >= config.maxRequests) {
      rateLimitLogger.debug?.(`Rate limit exceeded for "${name}:${key}"`, {
        requests: bucket.requests.length,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
      });
      return false;
    }

    bucket.requests.push(now);
    return true;
  }

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

  reset(name: string, key: string): void {
    const bucketKey = `${name}:${key}`;
    this.buckets.delete(bucketKey);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      globalThis.clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
    this.configs.clear();
  }

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
}

export function createSlidingWindowLimiter(
  config: SlidingWindowLimiterConfig,
): SlidingWindowLimiter {
  const limiter = new SlidingWindowRateLimiter();
  limiter.initialize(config.name, config.maxRequests, config.windowMs);

  return {
    check: (key: string) => limiter.check(config.name, key),
    getStatus: (key: string) => limiter.getStatus(config.name, key),
    reset: (key: string) => limiter.reset(config.name, key),
    destroy: () => limiter.destroy(),
  };
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, TokenBucketState>();
  private config: {
    capacity: number;
    refillRate: number;
  } | null = null;

  configure(capacity: number, refillRate: number): void {
    this.config = { capacity, refillRate };
  }

  check(key: string): boolean {
    if (!this.config) {
      rateLimitLogger.warn?.("Token bucket not configured");
      return true;
    }

    const now = Date.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.config.capacity,
      lastRefill: now,
    };

    const elapsed = now - bucket.lastRefill;
    const refillAmount = elapsed * this.config.refillRate;

    bucket.tokens = Math.min(
      this.config.capacity,
      bucket.tokens + refillAmount,
    );
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  getStatus(key: string): {
    tokens: number;
    capacity: number;
    lastRefill: number;
  } {
    if (!this.config) {
      return {
        tokens: 0,
        capacity: 0,
        lastRefill: Date.now(),
      };
    }

    const bucket = this.buckets.get(key);
    if (!bucket) {
      return {
        tokens: this.config.capacity,
        capacity: this.config.capacity,
        lastRefill: Date.now(),
      };
    }

    return {
      tokens: bucket.tokens,
      capacity: this.config.capacity,
      lastRefill: bucket.lastRefill,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

export class BruteForceProtection {
  private attempts = new Map<string, BruteForceEntry>();
  private maxAttempts = 5;
  private lockoutMs = 15 * 60 * 1000;

  configure(options: { maxAttempts?: number; lockoutMs?: number }): void {
    if (options.maxAttempts !== undefined) {
      this.maxAttempts = options.maxAttempts;
    }
    if (options.lockoutMs !== undefined) {
      this.lockoutMs = options.lockoutMs;
    }
  }

  recordFailure(key: string): BruteForceEntry {
    const entry = this.attempts.get(key) ?? { attempts: 0 };
    entry.attempts += 1;

    if (entry.attempts >= this.maxAttempts) {
      entry.lockedUntil = Date.now() + this.lockoutMs;
      rateLimitLogger.warn?.("Brute force protection triggered", { key });
    }

    this.attempts.set(key, entry);
    return entry;
  }

  isLocked(key: string): boolean {
    const entry = this.attempts.get(key);
    if (!entry?.lockedUntil) {
      return false;
    }

    if (Date.now() > entry.lockedUntil) {
      this.attempts.delete(key);
      return false;
    }

    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for") ??
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      null
  );
}

export function getRateLimitHeaders(
  status: {
    limit?: number;
    used?: number;
    remaining?: number;
    resetAt?: number;
  },
  corsOrigin?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Retry-After": status.resetAt
      ? String(Math.ceil((status.resetAt - Date.now()) / 1000))
      : "60",
    ...(corsOrigin ? createCorsHeaders(corsOrigin) : { ...BASE_CORS_HEADERS }),
  };

  if (status.limit !== undefined) {
    headers["X-RateLimit-Limit"] = String(status.limit);
  }
  if (status.used !== undefined) {
    headers["X-RateLimit-Used"] = String(status.used);
  }
  if (status.remaining !== undefined) {
    headers["X-RateLimit-Remaining"] = String(status.remaining);
  }
  if (status.resetAt !== undefined) {
    headers["X-RateLimit-Reset"] = String(
      Math.ceil((status.resetAt - Date.now()) / 1000),
    );
  }

  return headers;
}

export function getRateLimitExceededResponse(
  resetAt?: number,
  corsOrigin?: string,
): Response {
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
        ...(corsOrigin
          ? createCorsHeaders(corsOrigin)
          : { ...BASE_CORS_HEADERS }),
      },
    },
  );
}
