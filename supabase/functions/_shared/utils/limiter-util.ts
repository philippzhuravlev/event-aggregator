import { SlidingWindowRateLimiter } from "../validation/index.ts";

export interface SlidingWindowLimiter {
  check(key: string): boolean;
  getStatus(
    key: string,
  ): {
    used: number;
    limit: number;
    remaining: number;
    resetAt: number;
  };
  reset(key: string): void;
  destroy(): void;
}

export interface SlidingWindowLimiterConfig {
  name: string;
  maxRequests: number;
  windowMs: number;
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

