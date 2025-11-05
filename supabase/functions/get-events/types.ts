/**
 * Get Events Types
 * Response and query parameter types for event retrieval
 */

/**
 * Response format for paginated events
 */
export interface GetEventsResponse {
  events: unknown[];
  nextPageToken?: string; // Token to fetch next page
  hasMore: boolean; // Whether more results exist
  totalReturned: number; // Number of events in this response
}
