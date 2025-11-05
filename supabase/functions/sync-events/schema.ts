/**
 * Validation schema for sync-events endpoint
 *
 * Note: This endpoint takes no query parameters
 * It's a POST endpoint that triggers a full sync of all active pages
 */

// This handler has minimal validation needed since it's a cron-triggered POST
// with no parameters. The schema is kept here for consistency lol
export type SyncEventsRequest = Record<string, never>;
