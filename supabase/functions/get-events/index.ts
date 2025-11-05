import { createClient } from "@supabase/supabase-js";
import { logger } from "../_shared/services/index.ts";
import { GetEventsQuery } from "../_shared/types.ts";
import { GetEventsResponse } from "./types.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  getClientIp,
  getRateLimitExceededResponse,
  handleCORSPreflight,
  HTTP_STATUS,
  PAGINATION,
  SlidingWindowRateLimiter,
} from "../_shared/validation/index.ts";

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// So - what is pagination? What it literally means is "divide stuff up by pages". But in databases
// specifically, it means splitting up large requests into smaller chunks, or "pages". Like if you
// have 1000 events, you don't want the frontend to fetch them all at once, because that will be slow
// and might crash. And so, we split them up into e.g. 50 events per page, and send them that way

// Rate limiter for public API: 100 requests per minute per IP
const apiRateLimiter = new SlidingWindowRateLimiter();
apiRateLimiter.initialize("get-events", 100, 60000);

/**
 * Validate and parse query parameters for get-events
 */
function sanitizeSearchQuery(input: string): string {
  // Remove anything that's not alphanumeric, spaces, or basic punctuation
  // This prevents XSS/injection attacks
  return input
    .replace(/[^a-zA-Z0-9\s\-'",.&]/g, "")
    .trim()
    .substring(0, 200); // Max length
}

function validateQueryParams(
  url: URL,
): { success: boolean; data?: GetEventsQuery; error?: string } {
  try {
    const params = url.searchParams;

    // Parse limit (optional, default: 50, max: 100)
    const limitStr = params.get("limit");
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10), 1), PAGINATION.MAX_LIMIT)
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
      search = sanitizeSearchQuery(search);
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

/**
 * Fetch paginated events from Supabase
 *
 * Query params:
 * - limit: Number of events per page (default: 50, max: 100)
 * - pageToken: Cursor for next page (base64 encoded timestamp)
 * - pageId: Filter by Facebook page ID
 * - upcoming: Only show upcoming events (default: true)
 * - search: Search query for title/description/place
 */
async function getEvents(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  queryParams: GetEventsQuery,
): Promise<GetEventsResponse> {
  const {
    limit,
    pageToken,
    pageId,
    upcoming,
    search: searchQuery,
  } = queryParams;

  logger.debug("Getting events with pagination", {
    limit,
    pageToken,
    pageId,
    upcoming,
    hasSearch: !!searchQuery,
  });

  // 1. Start by making a Supabase query
  let query = supabase.from("events").select("*");

  // 2. Filter by page if specified
  if (pageId) {
    query = query.eq("page_id", parseInt(pageId, 10));
  }

  // 3. Filter upcoming events if specified
  if (upcoming) {
    const now = new Date().toISOString();
    query = query.gte("start_time", now);
  }

  // 4. Apply full-text search if a search query is provided
  if (searchQuery) {
    query = query.textSearch("fts", searchQuery);
  }

  // 5. Order by start time (required for pagination)
  query = query.order("start_time", { ascending: true });

  // 6. Apply pagination cursor if provided
  if (pageToken) {
    try {
      const cursorTime = atob(pageToken);
      const cursorDate = new Date(parseInt(cursorTime)).toISOString();
      query = query.gte("start_time", cursorDate);
    } catch {
      logger.warn("Invalid page token provided", { pageToken });
      throw new Error("Invalid page token");
    }
  }

  // 7. Limit the number of results (+1 to check for more)
  query = query.limit(limit! + 1);

  // 8. Execute the query
  const { data: allEvents, error } = await query;
  if (error) {
    throw new Error(`Failed to get events from Supabase: ${error.message}`);
  }

  const events = allEvents ? allEvents.slice(0, limit!) : [];

  // 9. Check if there are more results
  const hasMore = allEvents ? allEvents.length > limit! : false;

  // 10. Generate next page token if more results exist
  let nextPageToken: string | undefined;
  if (hasMore && events.length > 0) {
    const lastEvent = events[events.length - 1] as Record<string, unknown>;
    const lastTimestamp = new Date(lastEvent.start_time as string).getTime();
    nextPageToken = btoa(String(lastTimestamp));
  }

  // 11. Log and return the results
  logger.debug("Events retrieved successfully", {
    totalReturned: events.length,
    hasMore,
  });

  return {
    events,
    nextPageToken,
    hasMore,
    totalReturned: events.length,
  };
}

/**
 * HTTP handler for GET /getEvents endpoint
 * Public endpoint (no auth required) with CORS support
 */
async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORSPreflight();
  }

  try {
    // 1. Validate the request method is GET
    if (req.method !== "GET") {
      return createErrorResponse(
        "Method not allowed",
        HTTP_STATUS.METHOD_NOT_ALLOWED,
      );
    }

    // 2. Rate limiting check (100 requests per minute per IP)
    const clientIp = getClientIp(req);
    const isLimited = !apiRateLimiter.check("get-events", clientIp);

    if (isLimited) {
      logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return getRateLimitExceededResponse();
    }

    // 3. Parse and validate query parameters
    const url = new URL(req.url);
    const validation = validateQueryParams(url);

    if (!validation.success) {
      return createErrorResponse(
        validation.error || "Invalid query parameters",
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // 3. Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      logger.error("Missing Supabase environment variables", null);
      return createErrorResponse(
        "Server configuration error",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. Call the getEvents function with the validated query parameters
    const result = await getEvents(supabase, validation.data!);

    // 5. Return the result as JSON with success
    return createSuccessResponse(result, HTTP_STATUS.OK);
  } catch (error) {
    logger.error("Failed to get events", error instanceof Error ? error : null);
    return createErrorResponse(
      "Failed to retrieve events",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

// Start the handler with Deno.serve()
Deno.serve(handler);
