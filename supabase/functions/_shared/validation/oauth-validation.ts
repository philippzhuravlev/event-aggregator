/**
 * OAuth validation utilities
 * Validates state parameters and redirect origins to prevent attacks
 */

import { ALLOWED_ORIGINS } from "../utils/constants-util.ts";
import { logger } from "../services/logger-service.ts";

// This used to be called "middleware", which lies in the middle between http request
// and business logic. But since we're using deno in edge functions without a full framework,
// it's not technically "middleware" and more of what middleware usually is 95% of the time:
// validation.

// OAuth is simple; the user clicks "Login with Facebook", we redirect them to Facebook
// with a "state" parameter that includes the URL to redirect back to after login. When Facebook
// redirects back to us, we validate that the "state" parameter is valid and that the
// redirect URL is in our whitelist. This prevents open redirect attacks and injection
// attacks

/**
 * Validate that a redirect origin is in our whitelist
 * Prevents open redirect attacks in OAuth flow
 * @param origin - Origin to validate (e.g., "http://localhost:3000")
 * @returns True if origin is in ALLOWED_ORIGINS
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  // The whole point is just to check if the origin of the URL is in our allowed list,
  // so "localhost" for dev and the production URL for prod etc etc

  // Check if origin matches any allowed origin
  return Array.from(ALLOWED_ORIGINS).some((allowed) => {
    // Ensure allowed is a string
    if (typeof allowed !== "string") return false;

    // Exact match
    if (origin === allowed) return true;

    // Handle optional env-based origin (might be undefined at validation time)
    try {
      const allowedUrl = new URL(allowed);
      const originUrl = new URL(origin);
      return allowedUrl.origin === originUrl.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Result of OAuth state validation
 */
export interface OAuthStateValidation {
  // this is just type checking no worries
  isValid: boolean;
  origin: string | null;
  error: string | null;
}

/**
 * Validate and sanitize OAuth state parameter
 * Prevents injection attacks and validates redirect URL
 * @param state - State parameter from OAuth callback
 * @returns Validation result with origin and error
 */
export function validateOAuthState(state: string): OAuthStateValidation {
  // the "state" parameter is "stored" inside a URL-encoded string representing
  // the original URL the user came from, e.g. "http://localhost:3000" or
  // something like that; it's part of the broader HTTP request. State management
  // is thus about checking that the URL is valid and that its origin is whitelisted

  if (!state) {
    return {
      isValid: false,
      origin: null,
      error: "Missing state parameter",
    };
  }

  try {
    // Decode and parse the state URL
    // this is because the url was encoded when we sent it to facebook
    const decodedState = decodeURIComponent(state);

    // Validate it's a valid URL
    const stateUrl = new URL(decodedState);
    const origin = stateUrl.origin;

    // Check if origin is whitelisted
    if (!isAllowedOrigin(origin)) {
      logger.warn("Unauthorized redirect origin attempt", {
        attemptedOrigin: origin,
        allowedCount: Array.from(ALLOWED_ORIGINS).length,
      });
      return {
        isValid: false,
        origin: null,
        error: "Unauthorized redirect origin",
      };
    }

    // State is valid
    return {
      isValid: true,
      origin,
      error: null,
    };
  } catch (error) {
    logger.warn("Invalid state parameter format", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      isValid: false,
      origin: null,
      error: "Invalid state parameter format",
    };
  }
}

/**
 * Extract origin from state parameter safely
 * Returns null if state is invalid
 * @param state - State parameter from OAuth callback
 * @returns Origin URL or null if invalid
 */
export function extractOriginFromState(state: string): string | null {
  const validation = validateOAuthState(state);
  return validation.isValid ? validation.origin : null;
}
