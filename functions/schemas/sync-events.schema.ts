import { z } from 'zod'; // a nice and simple schema validation library for TypeScript from Node

// So what are "schemas"? They're kind of like "types" in that they define the shape of data, but instead of just defining
// the type (string, number, boolean etc), they define the structure of the data itself, so we can be sure it fits nicely
// in our database and doesn't have missing fields etc. We often pass the entire schema as a parameter to functions that
// need to validate data, a pattern called "dependency injection". Its similar to how we pass "req" and "object" as params.
// It might look like: const validation = validateQueryParams(req, cleanupEventsQuerySchema);

// Syncing events from Facebook can be done manually (e.g. via a POST /syncFacebook endpoint) or automatically
// (e.g. via a scheduled Cloud Function). In both cases, we might want to pass some query parameters to control
// the sync behavior, e.g. which page to sync, whether to force sync even if recently synced, and how many days
// back to look for events etc etc. The schema below defines and validates these params

/**
 * Query parameters schema for POST /syncFacebook endpoint
 * Validates manual sync configuration parameters
 */
export const syncEventsQuerySchema = z.object({
  pageId: z // which Facebook Page to sync events from
    .string()
    .optional()
    .describe('Optional: Sync only a specific page ID'),
  
  force: z // whether to force sync even if recently synced
    .string()
    .optional()
    .transform((val) => val === 'true') // transform to boolean: true if the text is 'true', else false
    .pipe(z.boolean()) // force as boolean
    .describe('Force sync even if recently synced (default: false)'),
  
  daysBack: z // how many days back to look for events
    .string() 
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 30)) // if val exists, parse it, else default to 30
    .pipe(z.number().int().min(1).max(365)) // must be an integer between 1 and 365
    .describe('Number of days to look back for events (1-365, default: 30)'),
}).describe('Sync events query parameters');

export type SyncEventsQuery = z.infer<typeof syncEventsQuerySchema>;