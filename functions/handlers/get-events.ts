import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { logger } from '../utils/logger';
import { createErrorResponse } from '../utils/error-sanitizer';
import { validateQueryParams } from '../middleware/validation-schemas';
import { getEventsQuerySchema, GetEventsQuery } from '../schemas/get-events.schema';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

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
 * Lift paginated events from Firestore
 * 
 * Query params:
 * - limit: Number of events per page (default: 50, max: 100)
 * - pageToken: Cursor for next page (base64 encoded timestamp)
 * - pageId: Filter by Facebook page ID
 * - upcoming: Only show upcoming events (default: true)
 * - search: Search query for title/description/place
 */
export async function getEvents(
  db: admin.firestore.Firestore,
  queryParams: GetEventsQuery // the "schema" object found in functions/schemas/get-events.schema.ts
  // What that means is that we use a Node library called Zod. What it does is validate that the data we get 
  // and send is in the right structure - kind of like how /types/ checks for the right type (bool, str etc)
  // Here, we deconstruct the schema into its individual fields
): Promise<GetEventsResponse> { // here, we say the function returns a Promise that resolves to GetEventsResponse
  // 
  const limit = queryParams.limit;
  const pageToken = queryParams.pageToken;
  const pageId = queryParams.pageId;
  const upcoming = queryParams.upcoming;
  const searchQuery = queryParams.search?.toLowerCase().trim();

  logger.debug('Getting events with pagination', {
    limit,
    pageToken,
    pageId,
    upcoming,
    hasSearch: !!searchQuery,
  });

  // 1. Lets start by making a Firestore query
  let query: admin.firestore.Query = db.collection('events');

  // 2. Now filter by page if specified
  // query = query.where(...) modifies the query to add a filter
  if (pageId) {
    query = query.where('pageId', '==', pageId); // where() filters by field, here pageId
  }

  // 3. Now filter upcoming events if specified
  if (upcoming) {
    const now = admin.firestore.Timestamp.now();
    query = query.where('startTime', '>=', now); // filter by startTime
  }

  // 4. Order by start time (required for pagination)
  query = query.orderBy('startTime', 'asc');

  // 5. Apply pagination cursor if provided
  // a "cursor" is just a fancy word for "where to start from", like "from page 2" but as a timestamp
  if (pageToken) {
    try {
      // Timestamps are stored as Firestore Timestamps, but we encode them as something called 
      // "base64", just a string format. So here we decode the pageToken back to a real timestamp
      const cursorTime = Buffer.from(pageToken, 'base64').toString('utf-8');
      const cursorTimestamp = admin.firestore.Timestamp.fromMillis(parseInt(cursorTime));
      query = query.startAfter(cursorTimestamp);
    } catch (error) {
      logger.warn('Invalid page token provided', { pageToken, error });
      throw new Error('Invalid page token');
    }
  }
  
  // 6. Limit the number of results
  query = query.limit(limit + 1); // the + 1 is to see if there's anything more after this page

  // 7. now, execute the query as per normal
  const snapshot = await query.get();
  const events = snapshot.docs.slice(0, limit).map(doc => {
    const data = doc.data();
    return { // this is the full event object we return with all its little fields
      id: doc.id,
      pageId: data.pageId,
      title: data.title,
      description: data.description,
      startTime: data.startTime?.toDate?.()?.toISOString() || data.startTime,
      endTime: data.endTime?.toDate?.()?.toISOString() || data.endTime,
      place: data.place,
      coverImageUrl: data.coverImageUrl,
      eventURL: data.eventURL,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
    };
  });

  // 8. Apply side search filter from frontend if the user has called for it
  // (Firestore doesn't support full-text search natively so we do it here) 
  // Sidenote: Supabase has a really nice full-text search feature built in. Why did we not use that?
  // When you're 6 months into development firestore loses its appeal real fast haha. Next time then
  let filteredEvents = events;
  if (searchQuery) {
    filteredEvents = events.filter(event => {
      const searchableText = [
        event.title,
        event.description,
        event.place?.name || '',
      ].join(' ').toLowerCase();
      return searchableText.includes(searchQuery);
    });
  }

  // 9. Check if there are more results
  const hasMore = snapshot.docs.length > limit;

  // 10. Generate next page token if more results exist
  let nextPageToken: string | undefined;
  if (hasMore && filteredEvents.length > 0) {
    const lastEvent = filteredEvents[filteredEvents.length - 1];
    const lastTimestamp = new Date(lastEvent.startTime).getTime();
    nextPageToken = Buffer.from(String(lastTimestamp)).toString('base64');
  }

  // 11. Log and return the results
  logger.debug('Events retrieved successfully', {
    totalReturned: filteredEvents.length,
    hasMore,
  });
  return {
    events: filteredEvents,
    nextPageToken,
    hasMore,
    totalReturned: filteredEvents.length,
  };
}

/**
 * HTTP handler for GET /getEvents endpoint
 * Public endpoint (no auth required) with CORS support
 */
export async function handleGetEvents(req: Request, res: any): Promise<void> {
  // Here, we try to deconstruct the schema (getEventsQuerySchema from functions/schemas/get-events.schema.ts) into 
  // its individual fields, which can then be passed to the /getEvents endpoint
  try {
    // 1. First we validate the request method is indeed GET
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' }); // 405 = Method Not Allowed
      return;
    }

    // 2. Then, we call the validation function which we did with Zod. Note that getEventsQuerySchema is passed as 
    // a parameter, like our HTTP request object. This is a pattern called "dependency injection"", where we inject the schema"
    const validation = validateQueryParams(req, getEventsQuerySchema);
    
    if (!validation.success) {
      res.status(400).json({ // 400 = Bad Request
        error: 'Invalid query parameters',
        details: validation.errors,
      });
      return;
    }

    // 3. Call the getEvents function with the validated query parameters
    const db = admin.firestore();
    const queryParams = validation.data!; // ! = non-null assertion; we make sure data is not null here
    const result = await getEvents(db, queryParams);
    
    // 4. Finally, return the result as JSON
    res.status(200).json(result); // 200 = OK
  } catch (error: any) {
    logger.error('Failed to get events', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(500).json(createErrorResponse(error, isDevelopment));
  }
}
