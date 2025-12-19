/**
 * Token Refresh Types
 * Types for token refresh operations and status reporting
 */

import type { DatabasePage } from "../../../packages/shared/src/types.ts";

/**
 * Page token information
 */
export type PageToken = Pick<
  DatabasePage,
  "page_id" | "page_name" | "token_expiry" | "token_status" | "page_access_token_id"
> & {
  page_access_token_id?: string | null;
};

/**
 * Result of a single page token refresh operation
 */
export interface RefreshResult {
  pageId: string;
  success: boolean;
  expiresInDays?: number;
  error?: string;
}
