import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { createErrorResponse, createValidationErrorResponse } from '../utils/error-sanitizer';
import { validateQueryParams } from '../middleware/validation-schemas';
import { getEventsQuerySchema, GetEventsQuery } from '../schemas/get-events.schema';
import { HTTP_STATUS } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect
// something to an existing service, e.g. facebook or supabase vault

// So - what is pagination? What it literally means is "divide stuff up by pages". But in databases
// specifically, it means splitting up large requests into smaller chunks, or "pages". Like if you 
// have 1000 events, you don't want the frontend to fetch them all at once, because that will be slow 
// and might crash. And so, we split them up into e.g. 50 events per page, and send them that way

/**
 * Response format for paginated events
 */
export interface GetEventsResponse {
  events: any[];
  nextPageToken?: string;  // Token to fetch next page
  hasMore: boolean;        // Whether more results exist
  totalReturned: number;   // Number of events in this response
}

/**
 * Lift paginated events from Supabase
 * 
 * Query params:
 * - limit: Number of events per page (default: 50, max: 100)
 * - pageToken: Cursor for next page (base64 encoded timestamp)
 * - pageId: Filter by Facebook page ID
 * - upcoming: Only show upcoming events (default: true)
 * - search: Search query for title/description/place
 */
export async function getEvents(
  supabase: SupabaseClient, 
  queryParams: GetEventsQuery // the "schema" object found in functions/schemas/get-events.schema.ts
  // What that means is that we use a Node library called Zod. What it does is validate that the data we get 
  // and send is in the right structure - kind of like how /types/ checks for the right type (bool, str etc)
  // Here, we deconstruct the schema into its individual fields
): Promise<GetEventsResponse> { // here, we say the function returns a Promise that resolves to GetEventsResponse
  const {
    limit,
    pageToken,
    pageId,
    upcoming,
    search: searchQuery,
  } = queryParams;

  logger.debug('Getting events with pagination', {
    limit,
    pageToken,
    pageId,
    upcoming,
    hasSearch: !!searchQuery,
  });

  // 1. Lets start by making a Supabase query
  let query = supabase.from('events').select('*');

  // 2. Now filter by page if specified
  if (pageId) {
    query = query.eq('pageId', pageId);
  }

  // 3. Now filter upcoming events if specified
  if (upcoming) {
    const now = new Date().toISOString();
    query = query.gte('startTime', now);
  }

  // 4. Apply full-text search if a search query is provided
  if (searchQuery) {
    query = query.textSearch('fts', searchQuery);
  }

  // 5. Order by start time (required for pagination)
  query = query.order('startTime', { ascending: true });

  // 6. Apply pagination cursor if provided
  if (pageToken) {
    try {
      const cursorTime = Buffer.from(pageToken, 'base64').toString('utf-8');
      const cursorDate = new Date(parseInt(cursorTime)).toISOString();
      query = query.gte('startTime', cursorDate);
    } catch (error) {
      logger.warn('Invalid page token provided', { pageToken, error });
      throw new Error('Invalid page token');
    }
  }
  
  // 7. Limit the number of results (+1 to check for more)
  query = query.limit(limit + 1);

  // 8. now, execute the query as per normal
  const { data: allEvents, error } = await query;
  if (error) throw new Error(`Failed to get events from Supabase: ${error.message}`);

  const events = allEvents.slice(0, limit);

  // 9. Check if there are more results
  const hasMore = allEvents.length > limit;

  // 10. Generate next page token if more results exist
  let nextPageToken: string | undefined;
  if (hasMore && events.length > 0) {
    const lastEvent = events[events.length - 1];
    const lastTimestamp = new Date(lastEvent.startTime).getTime();
    nextPageToken = Buffer.from(String(lastTimestamp)).toString('base64');
  }

  // 11. Log and return the results
  logger.debug('Events retrieved successfully', {
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
export async function handleGetEvents(req: Request, res: Response): Promise<void> {
  try {
    // 1. First we validate the request method is indeed GET
    if (req.method !== 'GET') {
      res.status(HTTP_STATUS.METHOD_NOT_ALLOWED).json(
        createErrorResponse(
          new Error('Method not allowed'),
          false,
          'Only GET requests are supported for this endpoint'
        )
      );
      return;
    }

    // 2. Then, we call the validation function which we did with Zod.
  const validation = validateQueryParams<GetEventsQuery>(req as any, getEventsQuerySchema);
    
    if (!validation.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createValidationErrorResponse(validation.errors, 'Invalid query parameters')
      );
      return;
    }

    // 3. Call the getEvents function with the validated query parameters
    const supabase = (req as any).supabase;
    const queryParams = validation.data!;
    const result = await getEvents(supabase, queryParams);
    
    // 4. Finally, return the result as JSON
    res.status(HTTP_STATUS.OK).json(result);
  } catch (error: any) {
    logger.error('Failed to get events', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error, isDevelopment));
  }
}