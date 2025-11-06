/**
 * OAuth Callback Schema and Validation
 */

export interface ValidatedOAuthCallback {
  code: string;
  state: string;
}

/**
 * Validate OAuth callback query parameters
 */
export function validateOAuthCallbackQuery(
  url: URL,
): { success: boolean; data?: ValidatedOAuthCallback; error?: string } {
  try {
    const params = url.searchParams;

    // Check for error first
    const error = params.get('error');
    if (error) {
      return {
        success: false,
        error: `OAuth error: ${error}`,
      };
    }

    // Validate code (required)
    const code = params.get('code');
    if (!code || code.trim() === '') {
      return {
        success: false,
        error: 'Missing authorization code',
      };
    }

    // Validate state (required - for CSRF protection)
    const state = params.get('state');
    if (!state || state.trim() === '') {
      return {
        success: false,
        error: 'Missing state parameter (CSRF token)',
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
