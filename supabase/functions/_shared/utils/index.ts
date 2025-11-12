/**
 * Utils Barrel Export
 * Re-exports all shared utility functions and constants for convenient importing
 *
 * Utils contain business logic that is neither service-specific (no external connections)
 * nor handler-specific (not tied to a single endpoint). They're reusable across the codebase.
 */

// Index files are a weird thing. In regards to functions, they are our
// actual functions that get executed. But in regards to folders, they
// are "barrel" files that just import and export stuff for the folder.
// The common thread here is that index files are always entry points

// Constants - Configuration values and app-wide constants
export {
  ERROR_CODES,
  EVENT_SYNC,
  FACEBOOK,
  FACEBOOK_API,
  FACEBOOK_ORIGIN,
  HTTP_STATUS,
  SERVER_ERROR_RANGE,
  TOKEN_EXPIRY_CONFIG,
  TOKEN_REFRESH,
} from "./constants-util.ts";

// Event Normalization - Transform Facebook events to Supabase schema
export { normalizeEvent } from "./event-normalizer-util.ts";

// Token Expiry Utilities - Token lifecycle and expiration management
export {
  calculateDaysUntilExpiry,
  calculateExpirationDate,
  getTokenStatus,
  isTokenExpiring,
} from "./token-expiry-util.ts";

// URL Builder - URL construction and origin validation
export { isAllowedOrigin } from "./url-builder-util.ts";

// Search Sanitization
export { sanitizeSearchQuery } from "./sanitizer-util.ts";