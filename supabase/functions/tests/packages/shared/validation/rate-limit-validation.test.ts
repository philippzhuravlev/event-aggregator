import {
  BruteForceProtection,
  createSlidingWindowLimiter,
  getClientIp,
  getRateLimitExceededResponse,
  getRateLimitHeaders,
  setRateLimitLogger,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
} from "@event-aggregator/shared/validation/rate-limit-validation.js";
import { TokenBucketRateLimiter as ExportedBucket } from "@event-aggregator/shared/validation/index.js";
import { assert, assertEquals } from "std/assert/mod.ts";

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
    warn: (message: string) => warnings.push(message),
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
    warn: (message: string) => logs.push(message),
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
  assertEquals(
    getClientIp(new Request("https://example.com", { headers })),
    "1.1.1.1",
  );

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
  assertEquals(
    rateHeaders["Access-Control-Allow-Origin"],
    "https://example.com",
  );

  const response = getRateLimitExceededResponse(resetAt, "https://example.com");
  assertEquals(response.status, 429);
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "https://example.com",
  );
});

Deno.test("validation index re-exports rate limit helpers", () => {
  assertEquals(typeof ExportedBucket, "function");
});

Deno.test("getRateLimitHeaders falls back to base CORS headers when origin missing", () => {
  const headers = getRateLimitHeaders({
    limit: 5,
    used: 1,
    remaining: 4,
    resetAt: Date.now() + 1000,
  });
  assertEquals(headers["Access-Control-Allow-Origin"], "*");
  assertEquals(headers["X-RateLimit-Limit"], "5");
});

Deno.test("TokenBucketRateLimiter refills tokens based on elapsed time", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;

  try {
    const bucket = new TokenBucketRateLimiter();
    bucket.configure(2, 1 / 1000); // 1 token per second

    assertEquals(bucket.check("key"), true); // consume 1
    assertEquals(bucket.check("key"), true); // consume 2
    assertEquals(bucket.check("key"), false); // exhausted

    now += 2000; // advance 2 seconds => +2 tokens
    assertEquals(bucket.check("key"), true);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("SlidingWindowRateLimiter cleanup prunes expired buckets", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;

  try {
    const limiter = new SlidingWindowRateLimiter();
    limiter.initialize("test", 5, 100);

    limiter.check("test", "ip"); // request at t=0
    now = 200;
    limiter.cleanup(); // should remove old bucket

    const status = limiter.getStatus("test", "ip");
    assertEquals(status.used, 0);
    limiter.destroy();
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("SlidingWindowRateLimiter getStatus returns correct values for new bucket", () => {
  const limiter = new SlidingWindowRateLimiter();
  limiter.initialize("test", 10, 1000);

  const status = limiter.getStatus("test", "new-key");
  assertEquals(status.used, 0);
  assertEquals(status.limit, 10);
  assertEquals(status.remaining, 10);
  assertEquals(status.resetAt > Date.now(), true);

  limiter.destroy();
});

Deno.test("SlidingWindowRateLimiter getStatus calculates resetAt from oldest request", () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const limiter = new SlidingWindowRateLimiter();
    limiter.initialize("test", 10, 5000);

    limiter.check("test", "key"); // at t=1000
    now = 2000;
    limiter.check("test", "key"); // at t=2000

    const status = limiter.getStatus("test", "key");
    // resetAt should be oldest request (1000) + window (5000) = 6000
    assertEquals(status.resetAt, 6000);
    assertEquals(status.used, 2);

    limiter.destroy();
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("SlidingWindowRateLimiter getStatus handles uninitialized limiter", () => {
  const limiter = new SlidingWindowRateLimiter();
  const status = limiter.getStatus("missing", "key");
  assertEquals(status.used, 0);
  assertEquals(status.limit, 0);
  assertEquals(status.remaining, 0);
  assertEquals(status.resetAt, 0);
});

Deno.test("TokenBucketRateLimiter getStatus returns correct values for new bucket", () => {
  const bucket = new TokenBucketRateLimiter();
  bucket.configure(10, 1 / 1000);

  const status = bucket.getStatus("new-key");
  assertEquals(status.tokens, 10);
  assertEquals(status.capacity, 10);
  assertEquals(status.lastRefill > 0, true);
});

Deno.test("TokenBucketRateLimiter getStatus returns correct values for existing bucket", () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const bucket = new TokenBucketRateLimiter();
    bucket.configure(10, 1 / 1000);

    bucket.check("key"); // consume 1 token
    const status = bucket.getStatus("key");
    assertEquals(status.tokens, 9);
    assertEquals(status.capacity, 10);
    assertEquals(status.lastRefill, 1000);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("TokenBucketRateLimiter getStatus handles unconfigured bucket", () => {
  const bucket = new TokenBucketRateLimiter();
  const status = bucket.getStatus("key");
  assertEquals(status.tokens, 0);
  assertEquals(status.capacity, 0);
  assertEquals(status.lastRefill > 0, true);
});

Deno.test("TokenBucketRateLimiter refills tokens correctly over time", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => {
    return now;
  };

  try {
    const bucket = new TokenBucketRateLimiter();
    bucket.configure(10, 1 / 1000); // 1 token per second

    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      bucket.check("key");
    }
    assertEquals(bucket.check("key"), false); // exhausted

    // Advance time by 5 seconds
    now = 5000;
    assertEquals(bucket.check("key"), true); // should have refilled 5 tokens
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("TokenBucketRateLimiter caps tokens at capacity", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => {
    return now;
  };

  try {
    const bucket = new TokenBucketRateLimiter();
    bucket.configure(10, 1 / 1000); // 1 token per second

    // Consume 5 tokens, leaving 5
    for (let i = 0; i < 5; i++) {
      bucket.check("key");
    }

    // Advance time by 20 seconds (should refill 20, but capped at 10)
    now = 20000;
    // check() refills tokens, so after consuming 5 and waiting 20 seconds,
    // we should have 10 tokens (capped), then consume 1, leaving 9
    assertEquals(bucket.check("key"), true); // should succeed (tokens refilled)
    const status = bucket.getStatus("key");
    assertEquals(status.tokens <= status.capacity, true); // capped
    assertEquals(status.capacity, 10);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("BruteForceProtection handles lockout expiration", () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;

  try {
    const protection = new BruteForceProtection();
    protection.configure({ maxAttempts: 2, lockoutMs: 1000 });

    protection.recordFailure("user");
    protection.recordFailure("user");
    assertEquals(protection.isLocked("user"), true);

    // Advance time past lockout
    now = 2000;
    assertEquals(protection.isLocked("user"), false);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test("BruteForceProtection uses default configuration", () => {
  const protection = new BruteForceProtection();
  // Should use defaults: maxAttempts=5, lockoutMs=15*60*1000

  for (let i = 0; i < 4; i++) {
    protection.recordFailure("user");
    assertEquals(protection.isLocked("user"), false);
  }

  protection.recordFailure("user"); // 5th attempt
  assertEquals(protection.isLocked("user"), true);
});

Deno.test("BruteForceProtection configure updates settings", () => {
  const protection = new BruteForceProtection();
  protection.configure({ maxAttempts: 3, lockoutMs: 5000 });

  protection.recordFailure("user");
  protection.recordFailure("user");
  assertEquals(protection.isLocked("user"), false);

  protection.recordFailure("user"); // 3rd attempt
  assertEquals(protection.isLocked("user"), true);
});

Deno.test("BruteForceProtection configure handles partial options", () => {
  const protection = new BruteForceProtection();
  protection.configure({ maxAttempts: 2 }); // only update maxAttempts

  for (let i = 0; i < 2; i++) {
    protection.recordFailure("user");
  }
  assertEquals(protection.isLocked("user"), true);
});

Deno.test("getClientIp falls back through headers", () => {
  // Test x-forwarded-for
  const headers1 = new Headers({ "x-forwarded-for": "1.1.1.1" });
  assertEquals(
    getClientIp(new Request("https://example.com", { headers: headers1 })),
    "1.1.1.1",
  );

  // Test cf-connecting-ip (when x-forwarded-for not present)
  const headers2 = new Headers({ "cf-connecting-ip": "2.2.2.2" });
  assertEquals(
    getClientIp(new Request("https://example.com", { headers: headers2 })),
    "2.2.2.2",
  );

  // Test x-real-ip (when others not present)
  const headers3 = new Headers({ "x-real-ip": "3.3.3.3" });
  assertEquals(
    getClientIp(new Request("https://example.com", { headers: headers3 })),
    "3.3.3.3",
  );

  // Test no headers
  const headers4 = new Headers();
  assertEquals(
    getClientIp(new Request("https://example.com", { headers: headers4 })),
    null,
  );
});

Deno.test("getRateLimitHeaders handles missing resetAt", () => {
  const headers = getRateLimitHeaders({
    limit: 10,
    used: 5,
    remaining: 5,
  });
  assertEquals(headers["Retry-After"], "60"); // default
  assertEquals(headers["X-RateLimit-Limit"], "10");
});

Deno.test("getRateLimitHeaders calculates retry-after correctly", () => {
  const resetAt = Date.now() + 5000; // 5 seconds from now
  const headers = getRateLimitHeaders({
    limit: 10,
    used: 5,
    remaining: 5,
    resetAt,
  });
  const retryAfter = Number.parseInt(headers["Retry-After"], 10);
  assertEquals(retryAfter >= 4 && retryAfter <= 5, true); // allow small timing variance
});

Deno.test("getRateLimitHeaders handles negative resetAt", () => {
  const resetAt = Date.now() - 1000; // in the past
  const headers = getRateLimitHeaders({
    limit: 10,
    used: 5,
    remaining: 5,
    resetAt,
  });
  assertEquals(headers["Retry-After"], "0");
});

Deno.test("getRateLimitHeaders includes all rate limit headers", () => {
  const resetAt = Date.now() + 1000;
  const headers = getRateLimitHeaders({
    limit: 10,
    used: 5,
    remaining: 5,
    resetAt,
  }, "https://example.com");

  assertEquals(headers["X-RateLimit-Limit"], "10");
  assertEquals(headers["X-RateLimit-Used"], "5");
  assertEquals(headers["X-RateLimit-Remaining"], "5");
  assertEquals(typeof headers["X-RateLimit-Reset"], "string");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://example.com");
});

Deno.test("getRateLimitExceededResponse handles missing resetAt", async () => {
  const response = getRateLimitExceededResponse(
    undefined,
    "https://example.com",
  );
  assertEquals(response.status, 429);
  assertEquals(response.headers.get("retry-after"), "60"); // default
  const body = await response.json();
  assertEquals(body.error, "Rate limit exceeded");
  assertEquals(body.retryAfter, 60);
});

Deno.test("getRateLimitExceededResponse calculates retry-after correctly", () => {
  const resetAt = Date.now() + 3000;
  const response = getRateLimitExceededResponse(resetAt, "https://example.com");
  const retryAfter = Number.parseInt(
    response.headers.get("retry-after") || "0",
    10,
  );
  assertEquals(retryAfter >= 2 && retryAfter <= 3, true); // allow small timing variance
});

Deno.test("getRateLimitExceededResponse handles missing origin", () => {
  const resetAt = Date.now() + 1000;
  const response = getRateLimitExceededResponse(resetAt);
  assertEquals(response.headers.get("access-control-allow-origin"), "*");
});

Deno.test("setRateLimitLogger updates logger", () => {
  const debugLogs: string[] = [];
  const warnLogs: string[] = [];

  setRateLimitLogger({
    debug: (message: string) => debugLogs.push(message),
    warn: (message: string) => warnLogs.push(message),
  });

  const limiter = new SlidingWindowRateLimiter();
  limiter.check("missing", "key"); // should trigger warning

  assertEquals(warnLogs.length > 0, true);

  // Reset logger
  setRateLimitLogger({});
});
