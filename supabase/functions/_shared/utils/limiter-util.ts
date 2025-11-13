/**
 * Rate limiter helpers are re-exported from the shared package so that both
 * Supabase edge functions and Node runtimes use the same implementation.
 */
// @deno-types="../../../../packages/shared/src/validation/rate-limit-validation.ts"
export {
  createSlidingWindowLimiter,
} from "../../packages/shared/dist/validation/index.js";

export type {
  SlidingWindowLimiter,
  SlidingWindowLimiterConfig,
} from "../../../../packages/shared/src/validation/rate-limit-validation.ts";
