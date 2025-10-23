import { z } from 'zod'; // a nice and simple schema validation library for TypeScript from Node

// So what are "schemas"? They're kind of like "types" in that they define the shape of data, but instead of just defining
// the type (string, number, boolean etc), they define the structure of the data itself, so we can be sure it fits nicely
// in our database and doesn't have missing fields etc. We often pass the entire schema as a parameter to functions that
// need to validate data, a pattern called "dependency injection". Its similar to how we pass "req" and "object" as params.
// It might look like: const validation = validateQueryParams(req, cleanupEventsQuerySchema);

// The schema below defines the query parameters for the POST endpoint inside the ./cleanupEvents endpoint. Here, we handle
// parameters related to how many days to keep events, whether to do a "dry run" (simulating the cleanup without deleting),
// whether to archive events before deletion, and the "batch size" (number of events to process at once) for processing events.

/**
 * Query parameters schema for POST /cleanupEvents endpoint
 * Validates cleanup configuration parameters
 */
export const cleanupEventsQuerySchema = z.object({
  // Zod works by having a "zod object" (here called "z") with fields (the stuff in red), i.e. what we want to query in this schema,
  // and methods (the stuff in blue), how how to validate and transform that stuff
  daysToKeep: z // to clean up events, we need to know how many days to keep events for
    .string() // first, we say it's a string (all query params are strings by default)
    .optional() // then we say it's optional (i.e. user doesn't have to provide it)
    .transform((val) => (val ? parseInt(val, 10) : 90)) // then we transform the param 
    // Note the ? : notation. if the val exists, parse it, else default to 90
    .pipe(z.number().int().min(1).max(3650)) // pipe means "then validate as...". 
    // Here we say it must be an integer between 1 and 3650
    .describe('Number of days to keep events (1-3650, default: 90)'), // now add this text for documentation
  
  // also note that we could write it all out as days:ToKeep.string().optional().transform(...).pipe(...) etc

  dryRun: z // also we need to know whether to do a "dry run" (i.e. simulate cleanup without deleting, e.g. in testing)
    .string() // first, say it's a string
    .optional() // then say it's optional
    .transform((val) => val === 'true') // then transform it to boolean: true if the text is 'true', else false
    .pipe(z.boolean()) // then we "pipe" it out as a boolean, which is what we want - to do a dry run or nah
    .describe('Simulate cleanup without deleting (default: false)'), // then we add some text for documentation
  
  archive: z // also we need to know whether to archive events before deletion
    .string() // again, start by getting a string
    .optional() // then say it's optional
    .transform((val) => val !== 'false') // and then transform it to boolean: true unless the text is 'false'
    .pipe(z.boolean()) // then pipe it out as a boolean - archive or nah?
    .describe('Archive events before deletion (default: true)'), // then add some text for documentation
  
  batchSize: z // you get the idea. Indeed, we need to know the "batch size" (how large the batch) for processing events
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 500)) // if val exists, parse it, else default to 500
    .pipe(z.number().int().min(1).max(500)) // Pipe actually validates. Here, it must be an integer between 1 and 500
    .describe('Number of events per batch (1-500, default: 500)'),
}).describe('Cleanup events query parameters');

export type CleanupEventsQuery = z.infer<typeof cleanupEventsQuerySchema>;