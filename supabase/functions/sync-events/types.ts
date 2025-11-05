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
