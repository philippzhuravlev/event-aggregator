/**
 * Token Refresh Types
 * Types for token refresh operations and status reporting
 */

/**
 * Page token information
 */
export interface PageToken {
  page_id: string;
  access_token: string;
  expires_at: string;
}

/**
 * Result of a single page token refresh operation
 */
export interface RefreshResult {
  pageId: string;
  success: boolean;
  expiresInDays?: number;
  error?: string;
}
