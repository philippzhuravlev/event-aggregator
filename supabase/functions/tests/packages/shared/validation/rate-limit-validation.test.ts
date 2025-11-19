import {
  BruteForceProtection,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  createSlidingWindowLimiter,
  getClientIp,
  getRateLimitExceededResponse,
  getRateLimitHeaders,
  setRateLimitLogger,
} from "@event-aggregator/shared/validation/rate-limit-validation.js";
import { TokenBucketRateLimiter as ExportedBucket } from "@event-aggregator/shared/validation/index.js";
import { assertEquals } from "std/assert/mod.ts";

Deno.test("SlidingWindowRateLimiter enforces limits and reports status", () => {
  const limiter = new SlidingWindowRateLimiter();
  limiter.initialize("test", 2, 10_000);

  assertEquals(limiter.check("test", "ip"), true);
  assertEquals(limiter.check("test", "ip"), true);
  assertEquals(limiter.check("test", "ip"), false);

  const status = limiter.getStatus("test", "ip");
  assertEquals(status.limit, 2);
  assertEquals(status.remaining, 0);

  limiter.reset("test", "ip");
  assertEquals(limiter.check("test", "ip"), true);
  limiter.destroy();
});

Deno.test("SlidingWindowRateLimiter warns when not initialized", () => {
  const warnings: string[] = [];
  setRateLimitLogger({
    warn: (message) => warnings.push(message),
  });

  const limiter = new SlidingWindowRateLimiter();
  limiter.check("missing", "ip");
  assertEquals(warnings.length > 0, true);
});

Deno.test("createSlidingWindowLimiter wrapper delegates to limiter", () => {
  const limiter = createSlidingWindowLimiter({
    name: "wrapper",
    maxRequests: 1,
    windowMs: 1,
  });

  assertEquals(limiter.check("key"), true);
  assertEquals(limiter.check("key"), false);
  limiter.reset("key");
  limiter.destroy();
});

Deno.test("TokenBucketRateLimiter handles configuration and exhaustion", () => {
  const logs: string[] = [];
  setRateLimitLogger({
    warn: (message) => logs.push(message),
  });

  const bucket = new TokenBucketRateLimiter();
  assertEquals(bucket.check("key"), true); // Not configured -> warn but allow
  assertEquals(logs.length > 0, true);

  bucket.configure(1, 0);
  assertEquals(bucket.check("key"), true);
  assertEquals(bucket.check("key"), false);
  const status = bucket.getStatus("key");
  assertEquals(status.capacity, 1);
  bucket.reset("key");
});

Deno.test("BruteForceProtection locks and resets keys", () => {
  const protection = new BruteForceProtection();
  protection.configure({ maxAttempts: 2, lockoutMs: 1000 });

  protection.recordFailure("user");
  const entry = protection.recordFailure("user");
  assertEquals(entry.attempts, 2);
  assertEquals(protection.isLocked("user"), true);

  protection.reset("user");
  assertEquals(protection.isLocked("user"), false);
});

Deno.test("getClientIp and rate limit headers utilities handle fallbacks", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.1.1.1",
    "cf-connecting-ip": "2.2.2.2",
    "x-real-ip": "3.3.3.3",
  });
  assertEquals(getClientIp(new Request("https://example.com", { headers })), "1.1.1.1");

  const resetAt = Date.now() + 2000;
  const rateHeaders = getRateLimitHeaders(
    {
      limit: 10,
      used: 5,
      remaining: 5,
      resetAt,
    },
    "https://example.com",
  );
  assertEquals(rateHeaders["X-RateLimit-Limit"], "10");
  assertEquals(rateHeaders["Access-Control-Allow-Origin"], "https://example.com");

  const response = getRateLimitExceededResponse(resetAt, "https://example.com");
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("access-control-allow-origin"), "https://example.com");
});

Deno.test("validation index re-exports rate limit helpers", () => {
  assertEquals(typeof ExportedBucket, "function");
});

