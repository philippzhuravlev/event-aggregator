/**
 * Validation schema for oauth-callback query parameters
 * Handles OAuth flow parameter validation and type definitions
 */

/**
 * Query parameters for OAuth callback from Facebook
 */
export interface OAuthCallbackQuery {
  code?: string;        // Authorization code from Facebook
  state?: string;       // CSRF token / frontend origin
  error?: string;       // Error message if auth failed
}

/**
 * Validated OAuth callback parameters
 */
export interface ValidatedOAuthCallback {
  code: string;
  state: string;
}

/**
 * Response from OAuth callback handler
 */
export interface OAuthCallbackResponse {
  success: boolean;
  pages?: number;
  events?: number;
  error?: string;
  redirectUrl: string;
}

/**
 * Validate and parse OAuth callback query parameters
 * @param url - URL object with search params
 * @returns { success: boolean, data?: ValidatedOAuthCallback, error?: string }
 */
export function validateOAuthCallbackQuery(
  url: URL,
): { success: boolean; data?: ValidatedOAuthCallback; error?: string } {
  try {
    const params = url.searchParams;

    // Check for error first
    const error = params.get("error");
    if (error) {
      return {
        success: false,
        error: `OAuth error: ${error}`,
      };
    }

    // Validate code (required)
    const code = params.get("code");
    if (!code || code.trim() === "") {
      return {
        success: false,
        error: "Missing authorization code",
      };
    }

    // Validate state (required - for CSRF protection)
    const state = params.get("state");
    if (!state || state.trim() === "") {
      return {
        success: false,
        error: "Missing state parameter (CSRF token)",
      };
    }

    return {
      success: true,
      data: {
        code: code.trim(),
        state: state.trim(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse OAuth callback: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
