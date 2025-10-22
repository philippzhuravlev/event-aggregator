import { z } from 'zod'; // a nice and simple schema validation library for TypeScript from Node
import { PAGINATION } from '../utils/constants';

// So what are "schemas"? They're kind of like "types" in that they define the shape of data, but instead of just defining
// the type (string, number, boolean etc), they define the structure of the data itself, so we can be sure it fits nicely
// in our database and doesn't have missing fields etc. We often pass the entire schema as a parameter to functions that
// need to validate data, a pattern called "dependency injection". Its similar to how we pass "req" and "object" as params.
// It might look like: const validation = validateQueryParams(req, cleanupEventsQuerySchema);

// The schema below defines the query parameters for the GET endpoint inside the ./getEvents endpoint. Here, we also handle 
// "pagination" (i.e. getting events in chunks/pages instead of all at once), filtering (e.g. only upcoming events),
// and searching (e.g. search by title/description/place). 

/**
 * Query parameters schema for GET /getEvents endpoint
 * Validates pagination, filtering, and search parameters
 */
export const getEventsQuerySchema = z.object({ // the "zod" object is just called "z" for convenience
  // Pagination (i.e. getting events in chunks/"pages" instead of all at once, speeding things up)
  limit: z // our dedicated zod object has a "limit" field (i.e. the number of events per page) with the following methods:
    .string() // first, we say it's a string (all query params are strings by default)
    .optional() // then we say it's optional (i.e. user doesn't have to provide it)
    .transform((val) => (val ? parseInt(val, 10) : PAGINATION.DEFAULT_LIMIT)) // then we transform it. Note the ? : notation. 
    // if the val exists, parse it, else default to 50
    .pipe(z.number().int().min(1).max(PAGINATION.MAX_LIMIT)) // pipe means "then validate as..." 
    .describe(`Number of events per page (1-${PAGINATION.MAX_LIMIT}, default: ${PAGINATION.DEFAULT_LIMIT})`), // finally we add a description for documentation
  
  pageToken: z // our schema object has a "pageToken" field with the following methods:
    .string() // first, we say it's a string
    .optional() // then we say it's optional (i.e. user doesn't have to provide the page token)
    .describe('Base64 encoded cursor for pagination'), // finally we add a description for documentation
  
  // Filtering (i.e. only getting certain events)
  pageId: z // you get the idea. Again, zod object has a "pageId" field with methods with checks
    .string() 
    .optional() 
    .describe('Filter by specific Facebook page ID'),
  
  upcoming: z // the zod schema also has an "upcoming" field to filter only upcoming events
    .string()
    .optional()
    .transform((val) => val !== 'false') // transform to boolean; default true unless explicitly "false"
    .pipe(z.boolean()) // again, pipe = "then validate as..."
    .describe('Show only upcoming events (default: true)'), // again, description for documentation
  
  // Search
  search: z
    .string()
    .trim() // trim space from start/end
    .min(1) // minimum length of 1 character
    .max(PAGINATION.MAX_SEARCH_LENGTH) // maximum length of 200 characters
    .optional() // but this field is optional
    .describe('Search query for title/description/place'),
}).describe('Get events query parameters');

export type GetEventsQuery = z.infer<typeof getEventsQuerySchema>;