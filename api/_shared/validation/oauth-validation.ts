/**
 * OAuth-specific validation utilities
 */

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
 * Extract origin from OAuth state parameter
 * State format: "encoded_payload|hex_signature"
 */
export function extractOriginFromState(state: string): string | null {
  try {
    const parts = state.split("|");
    if (parts.length !== 2) return null;

    const encoded = parts[0];
    const decoded = decodeURIComponent(encoded);
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Check if origin is allowed
 * For OAuth, we allow only specific origins (usually your frontend domain)
 */
export function isAllowedOrigin(
  origin: string,
  allowedOrigins: string[],
): boolean {
  return allowedOrigins.includes(origin);
}

export interface OAuthStateValidation {
  valid: boolean;
  origin?: string;
  error?: string;
}

/**
 * Validate OAuth state parameter
 * Returns origin if valid
 */
export function validateOAuthState(
  state: string | null,
  allowedOrigins: string[],
): OAuthStateValidation {
  if (!state) {
    return {
      valid: false,
      error: "Missing state parameter",
    };
  }

  const origin = extractOriginFromState(state);
  if (!origin) {
    return {
      valid: false,
      error: "Invalid state format",
    };
  }

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    return {
      valid: false,
      error: "Origin not allowed",
    };
  }

  return {
    valid: true,
    origin,
  };
}
