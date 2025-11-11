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

  // 1. Start by making a Supabase query - fetch all event_data JSON column
  let query = supabase.from("events").select("id, page_id, event_data");

  // 2. Filter by page if specified
  if (pageId) {
    query = query.eq("page_id", parseInt(pageId, 10));
  }

  // 8. Execute the query
  const { data: allEvents, error } = await query;
  if (error) {
    throw new Error(`Failed to get events from Supabase: ${error.message}`);
  }

  // 9. Process the events - extract from event_data JSON and apply filters
  // deno-lint-ignore no-explicit-any
  const processedEvents: any[] = [];
  const now = new Date();

  for (const row of allEvents || []) {
    const eventData = row.event_data;
    if (!eventData) continue;

    // Extract start_time for filtering
    const startTime = eventData.start_time
      ? new Date(eventData.start_time)
      : null;

    // 3. Filter upcoming events if specified
    if (upcoming && (!startTime || startTime < now)) {
      continue;
    }

    // 4. Apply full-text search if provided
    if (searchQuery) {
      const searchableText = `${eventData.name || ""} ${
        eventData.description || ""
      } ${eventData.place?.name || ""}`.toLowerCase();
      if (!searchableText.includes(searchQuery.toLowerCase())) {
        continue;
      }
    }

    processedEvents.push({
      startTime: startTime ? startTime.getTime() : 0,
      event: eventData,
      page_id: row.page_id, // Store page_id so we can include it in the response
    });
  }

  // Sort by start time
  processedEvents.sort((a, b) => a.startTime - b.startTime);

  // Apply cursor-based pagination
  let startIdx = 0;
  if (pageToken) {
    try {
      const cursorTime = parseInt(atob(pageToken), 10);
      startIdx = processedEvents.findIndex((e) => e.startTime >= cursorTime);
      if (startIdx === -1) startIdx = 0;
    } catch {
      logger.warn("Invalid page token provided", { pageToken });
      startIdx = 0;
    }
  }

  // Extract the page of results
  const pageSize = limit!;
  const events = processedEvents.slice(startIdx, startIdx + pageSize).map(
    (e) => {
      const eventData = e.event;

      // Transform database format (Facebook API fields) to frontend format (camelCase + renamed fields)
      // Database stores: id, name, start_time, end_time, description, place, cover (within event_data column)
      // Also gets: page_id from the row itself
      // Frontend expects: id, title, startTime, endTime, description, place, coverImageUrl, eventURL, pageId, createdAt, updatedAt
      const transformedEvent: Record<string, unknown> = {
        id: eventData?.id,
        pageId: String(e.page_id), // Include the Facebook page ID - essential for frontend filtering!
        title: eventData?.name, // Facebook uses "name", frontend expects "title"
        startTime: eventData?.start_time, // Facebook uses "start_time", frontend expects "startTime"
        description: eventData?.description,
        place: eventData?.place,
        coverImageUrl: eventData?.cover?.source,
        eventURL: `https://facebook.com/events/${eventData?.id}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add optional fields if present
      if (eventData?.end_time) {
        transformedEvent.endTime = eventData.end_time;
      }

      return transformedEvent;
    },
  );
  const hasMore = startIdx + pageSize < processedEvents.length;

  // Generate next page token if more results exist
  let nextPageToken: string | undefined;
  if (hasMore && events.length > 0) {
    // Use the start time of the next event as the cursor
    const nextEvent = processedEvents[startIdx + pageSize];
    if (nextEvent) {
      nextPageToken = btoa(String(nextEvent.startTime));
    }
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
  // Extract the request origin for CORS
  const origin = req.headers.get("origin") || "";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCORSPreflight(origin);
  }

  try {
    // 1. Validate the request method is GET
    if (req.method !== "GET") {
      return createErrorResponse(
        "Method not allowed",
        HTTP_STATUS.METHOD_NOT_ALLOWED,
        undefined,
        origin,
      );
    }

    // 2. Rate limiting check (100 requests per minute per IP)
    const clientIp = getClientIp(req);
    const isLimited = !apiRateLimiter.check("get-events", clientIp);

    if (isLimited) {
      logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return getRateLimitExceededResponse(undefined, origin);
    }

    // 3. Parse and validate query parameters
    const url = new URL(req.url);
    const validation = validateQueryParams(url);

    if (!validation.success) {
      return createErrorResponse(
        validation.error || "Invalid query parameters",
        HTTP_STATUS.BAD_REQUEST,
        undefined,
        origin,
      );
    }

    // 3. Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      logger.error("Missing Supabase environment variables", null);
      return createErrorResponse(
        "Server configuration error",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        undefined,
        origin,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // 4. Call the getEvents function with the validated query parameters
    const result = await getEvents(supabase, validation.data!);

    // 5. Return the result as JSON with success
    return createSuccessResponse(result, HTTP_STATUS.OK, undefined, origin);
  } catch (error) {
    logger.error("Failed to get events", error instanceof Error ? error : null);
    return createErrorResponse(
      "Failed to retrieve events",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      undefined,
      origin,
    );
  }
}

// Start the handler with Deno.serve()
Deno.serve(handler);
