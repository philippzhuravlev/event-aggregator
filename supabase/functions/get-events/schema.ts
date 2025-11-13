/**
 * Validation schema for get-events query parameters
 * Defines and validates the query params for paginated event retrieval
 */

import { PAGINATION } from "@event-aggregator/shared/runtime/deno.js";
import type { GetEventsQuery } from "@event-aggregator/shared/types.ts";
import { sanitizeSearchQuery } from "@event-aggregator/shared/utils/sanitizer-util.js";

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
      const sanitized = sanitizeSearchQuery(
        search,
        PAGINATION.MAX_SEARCH_LENGTH,
      );

      if (sanitized.length === 0) {
        search = undefined;
      } else if (sanitized.length > PAGINATION.MAX_SEARCH_LENGTH) {
        return {
          success: false,
          error:
            `Search query too long (max ${PAGINATION.MAX_SEARCH_LENGTH} characters)`,
        };
      } else {
        search = sanitized;
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
