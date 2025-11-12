/**
 * Placeholder for shared OAuth validation utilities.
 */
export interface OAuthStateValidationResult {
  valid: boolean;
  origin?: string;
  error?: string;
}

export function extractOriginFromState(state: string): string | null {
  try {
    const url = new URL(state);
    return url.origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(
  origin: string,
  allowedOrigins: readonly string[],
): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.endsWith("/**")) {
      const prefix = allowedOrigin.slice(0, -3);
      return origin.startsWith(prefix);
    }

    if (allowedOrigin.includes("*")) {
      const escaped = allowedOrigin
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$")
        .replace(/\\\*/g, ".*");
      const matcher = new RegExp(`^${escaped}$`);
      return matcher.test(origin);
    }

    return allowedOrigin === origin;
  });
}

export function validateOAuthState(
  state: string | null,
  allowedOrigins: readonly string[],
): OAuthStateValidationResult {
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
      error: `Origin not allowed: ${origin}`,
    };
  }

  return {
    valid: true,
    origin,
  };
}

