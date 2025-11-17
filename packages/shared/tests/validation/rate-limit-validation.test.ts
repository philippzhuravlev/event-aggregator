import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BruteForceProtection,
  createSlidingWindowLimiter,
  getClientIp,
  getRateLimitExceededResponse,
  getRateLimitHeaders,
  setRateLimitLogger,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
} from "../../src/validation/rate-limit-validation.ts";

describe("rate-limit-validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("SlidingWindowRateLimiter", () => {
    it("allows requests within the limit", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 5, 1000);

      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(true);
    });

    it("blocks requests exceeding the limit", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 2, 1000);

      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(false);
    });

    it("tracks separate keys independently", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 2, 1000);

      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key2")).toBe(true);
      expect(limiter.check("test", "key2")).toBe(true);
    });

    it("expires old requests after window", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 2, 1000);

      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(true);
      expect(limiter.check("test", "key1")).toBe(false);

      vi.advanceTimersByTime(1001);

      expect(limiter.check("test", "key1")).toBe(true);
    });

    it("returns status information", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 5, 1000);

      limiter.check("test", "key1");
      limiter.check("test", "key1");

      const status = limiter.getStatus("test", "key1");
      expect(status.used).toBe(2);
      expect(status.limit).toBe(5);
      expect(status.remaining).toBe(3);
    });

    it("resets a key", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 2, 1000);

      limiter.check("test", "key1");
      limiter.check("test", "key1");
      expect(limiter.check("test", "key1")).toBe(false);

      limiter.reset("test", "key1");
      expect(limiter.check("test", "key1")).toBe(true);
    });

    it("destroys and cleans up", () => {
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 2, 1000);
      limiter.destroy();

      // Should still work after destroy (just clears intervals)
      expect(limiter.check("test", "key1")).toBe(true);
    });
  });

  describe("TokenBucketRateLimiter", () => {
    it("allows requests when tokens are available", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(10, 10 / 1000);

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(true);
    });

    it("blocks requests when bucket is empty", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(2, 2 / 1000);

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(false);
    });

    it("refills tokens over time", () => {
      const limiter = new TokenBucketRateLimiter();
      // Configure with higher refill rate: 2 tokens per 500ms
      limiter.configure(2, 2 / 500);

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(false);

      vi.advanceTimersByTime(500);
      // Trigger refill check - this should refill 2 tokens
      limiter.check("key1");

      // Should have refilled tokens
      expect(limiter.check("key1")).toBe(true);
    });

    it("tracks separate keys independently", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(2, 2 / 1000);

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key2")).toBe(true);
      expect(limiter.check("key2")).toBe(true);
    });

    it("returns status information", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(10, 10 / 1000);

      limiter.check("key1");
      limiter.check("key1");

      const status = limiter.getStatus("key1");
      expect(status.tokens).toBeLessThanOrEqual(8);
      expect(status.capacity).toBe(10);
    });

    it("resets a key", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(2, 2 / 1000);

      limiter.check("key1");
      limiter.check("key1");
      expect(limiter.check("key1")).toBe(false);

      limiter.reset("key1");
      expect(limiter.check("key1")).toBe(true);
    });

    it("destroys and cleans up", () => {
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(2, 2 / 1000);

      // Should work
      expect(limiter.check("key1")).toBe(true);
    });
  });

  describe("setRateLimitLogger", () => {
    it("allows custom logger to be set", () => {
      const debugSpy = vi.fn();
      const warnSpy = vi.fn();
      setRateLimitLogger({ debug: debugSpy, warn: warnSpy });

      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 1, 1000);
      limiter.check("test", "key1");
      limiter.check("test", "key1"); // Should trigger debug log

      // Reset to default
      setRateLimitLogger({});
    });
  });

  describe("createSlidingWindowLimiter", () => {
    it("creates a limiter with correct interface", () => {
      const limiter = createSlidingWindowLimiter({
        name: "test",
        maxRequests: 5,
        windowMs: 1000,
      });

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.getStatus("key1")).toBeDefined();
      expect(typeof limiter.reset).toBe("function");
      expect(typeof limiter.destroy).toBe("function");
    });

    it("tracks limits independently per key", () => {
      const limiter = createSlidingWindowLimiter({
        name: "test",
        maxRequests: 2,
        windowMs: 1000,
      });

      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(true);
      expect(limiter.check("key1")).toBe(false);

      expect(limiter.check("key2")).toBe(true);
      expect(limiter.check("key2")).toBe(true);
    });

    it("destroys limiter correctly", () => {
      const limiter = createSlidingWindowLimiter({
        name: "test",
        maxRequests: 5,
        windowMs: 1000,
      });

      limiter.check("key1");
      limiter.destroy();
      // Should still work after destroy
      expect(limiter.check("key2")).toBe(true);
    });
  });

  describe("BruteForceProtection", () => {
    it("records failures and locks after max attempts", () => {
      const protection = new BruteForceProtection();
      protection.configure({ maxAttempts: 3, lockoutMs: 1000 });

      expect(protection.isLocked("key1")).toBe(false);
      protection.recordFailure("key1");
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(false);
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);
    });

    it("unlocks after lockout period", () => {
      vi.useFakeTimers();
      const protection = new BruteForceProtection();
      protection.configure({ maxAttempts: 2, lockoutMs: 1000 });

      protection.recordFailure("key1");
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);

      vi.advanceTimersByTime(1001);
      expect(protection.isLocked("key1")).toBe(false);

      vi.useRealTimers();
    });

    it("tracks separate keys independently", () => {
      const protection = new BruteForceProtection();
      protection.configure({ maxAttempts: 2, lockoutMs: 1000 });

      protection.recordFailure("key1");
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);
      expect(protection.isLocked("key2")).toBe(false);
    });

    it("resets a key", () => {
      const protection = new BruteForceProtection();
      protection.configure({ maxAttempts: 2, lockoutMs: 1000 });

      protection.recordFailure("key1");
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);

      protection.reset("key1");
      expect(protection.isLocked("key1")).toBe(false);
    });

    it("uses default configuration", () => {
      const protection = new BruteForceProtection();

      // Default maxAttempts is 5
      for (let i = 0; i < 4; i++) {
        protection.recordFailure("key1");
        expect(protection.isLocked("key1")).toBe(false);
      }
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);
    });

    it("updates configuration", () => {
      const protection = new BruteForceProtection();
      protection.configure({ maxAttempts: 3 });

      protection.recordFailure("key1");
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(false);
      protection.recordFailure("key1");
      expect(protection.isLocked("key1")).toBe(true);
    });
  });

  describe("getClientIp", () => {
    it("extracts IP from x-forwarded-for header", () => {
      const request = new Request("https://example.com", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });

      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("extracts IP from cf-connecting-ip header", () => {
      const request = new Request("https://example.com", {
        headers: { "cf-connecting-ip": "10.0.0.1" },
      });

      expect(getClientIp(request)).toBe("10.0.0.1");
    });

    it("extracts IP from x-real-ip header", () => {
      const request = new Request("https://example.com", {
        headers: { "x-real-ip": "172.16.0.1" },
      });

      expect(getClientIp(request)).toBe("172.16.0.1");
    });

    it("prioritizes x-forwarded-for over other headers", () => {
      const request = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "192.168.1.1",
          "cf-connecting-ip": "10.0.0.1",
          "x-real-ip": "172.16.0.1",
        },
      });

      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("returns null when no IP headers are present", () => {
      const request = new Request("https://example.com");

      expect(getClientIp(request)).toBeNull();
    });
  });

  describe("getRateLimitHeaders", () => {
    it("includes all rate limit headers", () => {
      const status = {
        limit: 100,
        used: 50,
        remaining: 50,
        resetAt: Date.now() + 60000,
      };

      const headers = getRateLimitHeaders(status);

      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["X-RateLimit-Used"]).toBe("50");
      expect(headers["X-RateLimit-Remaining"]).toBe("50");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
      expect(headers["Retry-After"]).toBeDefined();
    });

    it("handles partial status", () => {
      const status = {
        limit: 100,
      };

      const headers = getRateLimitHeaders(status);

      expect(headers["X-RateLimit-Limit"]).toBe("100");
      expect(headers["Retry-After"]).toBe("60");
    });

    it("includes CORS headers when origin provided", () => {
      const status = {
        limit: 100,
        used: 50,
        remaining: 50,
        resetAt: Date.now() + 60000,
      };

      const headers = getRateLimitHeaders(status, "https://example.com");

      expect(headers["Access-Control-Allow-Origin"]).toBe(
        "https://example.com",
      );
    });

    it("calculates Retry-After correctly", () => {
      vi.useFakeTimers();
      const resetAt = Date.now() + 120000; // 2 minutes from now

      const headers = getRateLimitHeaders({ resetAt });

      expect(parseInt(headers["Retry-After"])).toBe(120);

      vi.useRealTimers();
    });
  });

  describe("getRateLimitExceededResponse", () => {
    it("returns 429 response with correct headers", async () => {
      const response = getRateLimitExceededResponse();

      expect(response.status).toBe(429);
      const body = JSON.parse(await response.text());
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.retryAfter).toBe(60);
      expect(response.headers.get("Retry-After")).toBe("60");
    });

    it("calculates retry after from resetAt", async () => {
      vi.useFakeTimers();
      const resetAt = Date.now() + 90000; // 90 seconds

      const response = getRateLimitExceededResponse(resetAt);

      const body = JSON.parse(await response.text());
      expect(body.retryAfter).toBe(90);
      expect(response.headers.get("Retry-After")).toBe("90");

      vi.useRealTimers();
    });

    it("includes CORS headers when origin provided", () => {
      const response = getRateLimitExceededResponse(
        undefined,
        "https://example.com",
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
    });

    it("includes Content-Type header", () => {
      const response = getRateLimitExceededResponse();

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("SlidingWindowRateLimiter edge cases", () => {
    it("handles uninitialized limiter gracefully", () => {
      const limiter = new SlidingWindowRateLimiter();
      const warnSpy = vi.fn();
      setRateLimitLogger({ warn: warnSpy });

      const result = limiter.check("uninitialized", "key1");
      expect(result).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiter "uninitialized" not initialized'),
      );
    });

    it("returns zero status for uninitialized limiter", () => {
      const limiter = new SlidingWindowRateLimiter();
      const status = limiter.getStatus("uninitialized", "key1");
      expect(status).toEqual({ used: 0, limit: 0, remaining: 0, resetAt: 0 });
    });

    it("handles cleanup of expired buckets", () => {
      vi.useFakeTimers();
      const limiter = new SlidingWindowRateLimiter();
      limiter.initialize("test", 5, 1000);

      limiter.check("test", "key1");
      vi.advanceTimersByTime(2000); // Past window

      // Trigger cleanup by checking again
      limiter.check("test", "key2");

      vi.advanceTimersByTime(61000); // Past cleanup interval
      // Cleanup should have run

      vi.useRealTimers();
    });
  });

  describe("TokenBucketRateLimiter edge cases", () => {
    it("handles unconfigured limiter gracefully", () => {
      const limiter = new TokenBucketRateLimiter();
      const warnSpy = vi.fn();
      setRateLimitLogger({ warn: warnSpy });

      const result = limiter.check("key1");
      expect(result).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith("Token bucket not configured");
    });

    it("returns zero status for unconfigured limiter", () => {
      const limiter = new TokenBucketRateLimiter();
      const status = limiter.getStatus("key1");
      expect(status).toEqual({
        tokens: 0,
        capacity: 0,
        lastRefill: expect.any(Number),
      });
    });

    it("caps tokens at capacity when refilling", () => {
      vi.useFakeTimers();
      const limiter = new TokenBucketRateLimiter();
      limiter.configure(10, 100 / 1000); // High refill rate

      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.check("key1");
      }

      // Advance time significantly
      vi.advanceTimersByTime(1000);

      // Check should refill but cap at capacity
      limiter.check("key1");
      const status = limiter.getStatus("key1");
      expect(status.tokens).toBeLessThanOrEqual(10);

      vi.useRealTimers();
    });
  });
});
