/**
 * Sync Events Types
 * Response types for event synchronization operations
 */

/**
 * Result of syncing all page events
 */
export interface SyncResult {
  success: boolean;
  pagesProcessed: number;
  eventsAdded: number;
  eventsUpdated: number;
  errors: Array<{
    pageId: string;
    error: string;
  }>;
  timestamp: string;
}

/**
 * Result of syncing events for a single page
 */
export interface PageSyncResult {
  events: unknown[];
  pageId: string;
  error: string | null;
}

/**
 * Token expiring soon that needs notification
 */
export interface ExpiringToken {
  pageId: number;
  pageName: string;
  daysUntilExpiry: number;
  expiresAt: Date | null;
}
