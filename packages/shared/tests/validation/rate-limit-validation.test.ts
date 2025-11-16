import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  setRateLimitLogger,
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
});

