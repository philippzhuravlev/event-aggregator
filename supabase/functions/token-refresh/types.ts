/**
 * Token Refresh Types
 * Types for token refresh operations and status reporting
 */

/**
 * Page token information
 */
export interface PageToken {
  page_id: number;
  page_name: string;
  token_expiry: string | null;
  token_status: "active" | "expired" | "invalid";
  page_access_token_id?: string | null;
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
