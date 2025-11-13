import { createClient } from "@supabase/supabase-js";
import { logger } from "../_shared/services/logger-service.ts";
import type { GetEventsQuery } from "@event-aggregator/shared/types.ts";
import { GetEventsResponse } from "./types.ts";
import {
  createErrorResponse,
  createSuccessResponse,
  getClientIp,
  getRateLimitExceededResponse,
  handleCORSPreflight,
} from "@event-aggregator/shared/validation/index.js";
import { HTTP_STATUS, PAGINATION } from "@event-aggregator/shared/runtime/deno.js";
import { createSlidingWindowLimiter } from "@event-aggregator/shared/validation/rate-limit-validation.js";
import { validateGetEventsQuery } from "./schema.ts";

// this used to be a "handler", i.e. "thing that does something" (rather than connect,
// or help etc), but because we've refactored to supabase, it's now a "Edge Function".
// They're run on deno, an upgrade to nodejs, and work similarly to serverless functions
// we had before - basically, functions that run on demand or on a schedule.

// So - what is pagination? What it literally means is "divide stuff up by pages". But in databases
// specifically, it means splitting up large requests into smaller chunks, or "pages". Like if you
// have 1000 events, you don't want the frontend to fetch them all at once, because that will be slow
// and might crash. And so, we split them up into e.g. 50 events per page, and send them that way

// Rate limiter for public API: 100 requests per minute per IP
const apiRateLimiter = createSlidingWindowLimiter({
  name: "get-events",
  maxRequests: 100,
  windowMs: 60_000,
});

function escapeIlikePattern(value: string): string {
  return value
    .replace(/[%_]/g, (match) => `\\${match}`)
    .replace(/'/g, "''")
    .replace(/,/g, " ")
    .trim();
}

function buildSearchPattern(value?: string): string | null {
  if (!value) {
    return null;
  }

  const escaped = escapeIlikePattern(value);
  if (!escaped) {
    return null;
  }

  return `%${escaped}%`;
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

  const nowIso = new Date().toISOString();
  const fetchLimit = Math.min(limit, PAGINATION.MAX_LIMIT) + 1;

  let cursorIso: string | null = null;
  if (pageToken) {
    try {
      const decoded = atob(pageToken);
      const timestamp = Number.parseInt(decoded, 10);
      if (!Number.isNaN(timestamp)) {
        cursorIso = new Date(timestamp).toISOString();
      } else {
        logger.warn("Invalid page token provided", { pageToken });
      }
    } catch {
      logger.warn("Invalid page token provided", { pageToken });
    }
  }

  let lowerBoundIso: string | null = null;
  if (upcoming) {
    lowerBoundIso = nowIso;
  }
  if (cursorIso) {
    lowerBoundIso = lowerBoundIso && lowerBoundIso > cursorIso
      ? lowerBoundIso
      : cursorIso;
  }

  let query = supabase
    .from("events")
    .select("page_id,event_id,event_data,created_at,updated_at")
    .order("event_data->>start_time", { ascending: true })
    .order("event_id", { ascending: true })
    .limit(fetchLimit);

  if (pageId) {
    query = query.eq("page_id", parseInt(pageId, 10));
  }

  if (lowerBoundIso) {
    query = query.gte("event_data->>start_time", lowerBoundIso);
  }

  const searchPattern = buildSearchPattern(searchQuery);
  if (searchPattern) {
    const orClause = [
      `event_data->>name.ilike.${searchPattern}`,
      `event_data->>description.ilike.${searchPattern}`,
      `event_data->place->>name.ilike.${searchPattern}`,
    ].join(",");
    query = query.or(orClause);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get events from Supabase: ${error.message}`);
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const events = pageRows
    .map((row) => {
      // deno-lint-ignore no-explicit-any
      const eventData = (row as any).event_data ?? {};
      if (!eventData?.start_time) {
        return null;
      }

      const createdAtIso = (() => {
        const value = (row as any).created_at;
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === "string") {
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
        }
        return undefined;
      })();

      const updatedAtIso = (() => {
        const value = (row as any).updated_at;
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (typeof value === "string") {
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
        }
        return undefined;
      })();

      const createdTimestamp = createdAtIso ??
        new Date(eventData.start_time).toISOString();
      const updatedTimestamp = updatedAtIso ?? createdTimestamp;

      const transformedEvent: Record<string, unknown> = {
        id: eventData.id,
        pageId: String(row.page_id),
        title: eventData.name,
        startTime: eventData.start_time,
        description: eventData.description,
        place: eventData.place,
        coverImageUrl: eventData.cover?.source,
        eventURL: eventData.id
          ? `https://facebook.com/events/${eventData.id}`
          : undefined,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp,
      };

      if (eventData.end_time) {
        transformedEvent.endTime = eventData.end_time;
      }

      return transformedEvent;
    })
    .filter((event): event is Record<string, unknown> => event !== null);

  let nextPageToken: string | undefined;
  if (hasMore) {
    // Use the first row beyond the current page as the cursor
    const nextRow = rows[limit];
    // deno-lint-ignore no-explicit-any
    const nextEventData = (nextRow as any)?.event_data;
    const nextStartTime = nextEventData?.start_time;
    if (typeof nextStartTime === "string") {
      const nextStart = new Date(nextStartTime);
      if (!Number.isNaN(nextStart.getTime())) {
        nextPageToken = btoa(String(nextStart.getTime()));
      }
    }
  }

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
    const isLimited = !apiRateLimiter.check(clientIp);

    if (isLimited) {
      logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return getRateLimitExceededResponse(undefined, origin);
    }

    // 3. Parse and validate query parameters
    const url = new URL(req.url);
    const validation = validateGetEventsQuery(url);

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
