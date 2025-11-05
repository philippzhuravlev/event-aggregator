/**
 * Validation schema for get-events query parameters
 * Defines and validates the query params for paginated event retrieval
 */

import { PAGINATION } from "../_shared/utils/constants-util.ts";

/**
 * Query parameters for get-events endpoint
 */
export interface GetEventsQuery {
  limit: number;
  pageToken?: string;
  pageId?: string;
  upcoming: boolean;
  search?: string;
}

/**
 * Validate and parse query parameters for get-events
 * @param url - URL object with search params
 * @returns { success: boolean, data?: GetEventsQuery, error?: string }
 */
export function validateGetEventsQuery(
  url: URL,
): { success: boolean; data?: GetEventsQuery; error?: string } {
  try {
    const params = url.searchParams;

    // Parse limit (optional, default: 50, max: 100)
    const limitStr = params.get("limit");
    const limit = limitStr
      ? Math.min(
        Math.max(parseInt(limitStr, 10), PAGINATION.MIN_LIMIT),
        PAGINATION.MAX_LIMIT,
      )
      : PAGINATION.DEFAULT_LIMIT;

    if (isNaN(limit)) {
      return { success: false, error: "Invalid limit parameter" };
    }

    // Parse pageToken (optional)
    const pageToken = params.get("pageToken") || undefined;

    // Parse pageId (optional)
    const pageId = params.get("pageId") || undefined;

    // Parse upcoming (optional, default: true)
    const upcomingStr = params.get("upcoming");
    const upcoming = upcomingStr ? upcomingStr !== "false" : true;

    // Parse search (optional)
    let search = params.get("search") || undefined;
    if (search) {
      search = search.trim();
      if (search.length === 0) search = undefined;
      if (search && search.length > PAGINATION.MAX_SEARCH_LENGTH) {
        return {
          success: false,
          error:
            `Search query too long (max ${PAGINATION.MAX_SEARCH_LENGTH} characters)`,
        };
      }
    }

    return {
      success: true,
      data: {
        limit,
        pageToken,
        pageId,
        upcoming,
        search,
      },
    };
  } catch {
    return { success: false, error: "Invalid query parameters" };
  }
}
