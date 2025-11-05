/**
 * Types and validation schemas for token-refresh handler
 * Defines request/response structures for token refresh operations
 */

/**
 * Database page token record
 */
export interface PageToken {
  page_id: string;
  access_token: string;
  expires_at: string;
}

/**
 * Result of attempting to refresh a single page's token
 */
export interface RefreshResult {
  pageId: string;
  success: boolean;
  expiresInDays?: number;
  error?: string;
}

/**
 * Response from token-refresh handler
 */
export interface TokenRefreshResponse {
  success: boolean;
  message: string;
  refreshed: number;
  failed: number;
  results: RefreshResult[];
  timestamp: string;
}

/**
 * Manual refresh request body (if triggered via HTTP)
 */
export interface TokenRefreshRequest {
  pageId?: string;  // Optional - refresh specific page only
  dryRun?: boolean; // Validate but don't actually refresh
}

/**
 * Validate token refresh request body
 * @param body - Request body
 * @returns { success: boolean, data?: TokenRefreshRequest, error?: string }
 */
export function validateTokenRefreshRequest(
  body: unknown,
): { success: boolean; data?: TokenRefreshRequest; error?: string } {
  try {
    if (!body || typeof body !== "object") {
      return {
        success: true,
        data: {}, // Empty request is valid (all pages)
      };
    }

    const req = body as Record<string, unknown>;

    const validated: TokenRefreshRequest = {};

    // Validate pageId if provided
    if (req.pageId !== undefined) {
      if (typeof req.pageId !== "string" || req.pageId.trim() === "") {
        return {
          success: false,
          error: "pageId must be a non-empty string",
        };
      }
      validated.pageId = req.pageId.trim();
    }

    // Validate dryRun if provided
    if (req.dryRun !== undefined) {
      if (typeof req.dryRun !== "boolean") {
        return {
          success: false,
          error: "dryRun must be a boolean",
        };
      }
      validated.dryRun = req.dryRun;
    }

    return {
      success: true,
      data: validated,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to validate token refresh request: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
