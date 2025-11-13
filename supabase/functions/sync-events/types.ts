/**
 * Sync Events Types
 * Response types for event synchronization operations
 */
import type { NormalizedEvent } from "@event-aggregator/shared/types.ts";

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
  events: SynchronizedEvent[];
  pageId: string;
  error: string | null;
}

export type SynchronizedEvent = NormalizedEvent;

/**
 * Token expiring soon that needs notification
 */
export interface ExpiringToken {
  pageId: number;
  pageName: string;
  daysUntilExpiry: number;
  expiresAt: Date | null;
}
