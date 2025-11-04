import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { CleanupResult, CleanupOptions } from '../types';
import { logger } from '../utils/logger';
import { createErrorResponse, createValidationErrorResponse } from '../utils/error-sanitizer';
import { validateQueryParams } from '../middleware/validation-schemas';
import { cleanupEventsQuerySchema } from '../schemas/cleanup-events.schema';
import { EVENT_SYNC, HTTP_STATUS, TIME } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

// This handler cleans up old events to prevent database bloat events older than X
// days are deleted (or archived). Archiving is important because of GDPR compliance, 
// cuz the user has a right to get all their stored data back even after deletion

/**
 * Clean up old events from Supabase
 * @param supabase - Supabase client
 * @param options - Cleanup configuration
 * @returns Cleanup result with counts and details
 */
export async function cleanupOldEvents(supabase: SupabaseClient, options: CleanupOptions): Promise<CleanupResult> {
  // the "options: " part means that the function takes a single argument "options"
  // which is of type CleanupOptions, defined in ../types/index.ts. Now the "options" 
  // object itself has properties like daysToKeep, whether to dryRun (actually do cleanup
  // or just simulate), archiveBeforeDelete, etc. which we use in the function. This is a
  // common pattern in typescript, whose fancy term is called "object destructuring" to
  // pass many little params into one function as a single object - like, imagine doing 5-10
  // params manually for each function
  const startTime = Date.now();
  
  const {
    daysToKeep,
    dryRun = false, // dry run means we just simulate the cleanup without actually deleting anything
    archiveBeforeDelete = false,
    batchSize = EVENT_SYNC.MAX_CLEANUP_QUERY, // Supabase batch limit. 500 cleanups per batch
  } = options;

  // calculate cutoff date
  // We do this because events are organized by startTime, so we use that to determine if an event is old enough
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffISO = cutoffDate.toISOString();

  // log and prepare results
  logger.info('Starting event cleanup', {
    daysToKeep,
    cutoffDate: cutoffISO,
    dryRun,
    archiveBeforeDelete,
  });
  const result: CleanupResult = {
    deletedCount: 0,
    archivedCount: 0,
    failedCount: 0,
    cutoffDate: cutoffISO,
    duration: 0,
    errors: [],
  };

  // and here, we do the actual cleanup - or at least try to hehe
  try {
    // Query events older than cutoff date
    // we use endTime if available, otherwise startTime
    const { data: oldEvents, error } = await supabase
      .from('events')
      .select('id')
      .lt('startTime', cutoffISO)
      .limit(EVENT_SYNC.MAX_CLEANUP_QUERY);

    if (error) {
      throw new Error(error.message);
    }

    // if no more older events than last batch, we're done
    if (!oldEvents || oldEvents.length === 0) {
      logger.info('No old events found to clean up');
      result.duration = Date.now() - startTime;
      return result;
    }

    logger.info('Found old events to clean up', { count: oldEvents.length });

    // TODO: Add back archiving

    // delete events in batches
    if (!dryRun) {
      const chunks: { id: string }[][] = [];
      for (let i = 0; i < oldEvents.length; i += batchSize) {
        chunks.push(oldEvents.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        const idsToDelete = chunk.map(event => event.id);
        const { error: deleteError } = await supabase
          .from('events')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) {
          logger.error('Failed to commit batch delete', deleteError);
          result.failedCount += chunk.length;
          result.errors?.push(`Batch commit failed: ${deleteError.message}`);
        } else {
          result.deletedCount += chunk.length;
          logger.debug('Deleted batch of events', {
            batchSize: chunk.length,
            totalDeleted: result.deletedCount,
          });
        }
      }
    } else {
      // Again, just to repeat myself, "Dry run" is just simulate what would be deleted, without
      // actually deleting anything; its the certified best way to test cleanup without risk
      result.deletedCount = oldEvents.length;
      logger.info('Dry run - would delete events', { count: oldEvents.length });
    }

    result.duration = Date.now() - startTime; // here it sure helped having the results be an object, huh

    logger.info('Event cleanup completed', {
      ...result,
      durationSeconds: (result.duration / TIME.MS_PER_SECOND).toFixed(2), // convert ms to seconds
    });

    return result; // wuw we did it
  } catch (error: any) {
    logger.error('Event cleanup failed', error); // aww we didnt
    result.duration = Date.now() - startTime;
    result.errors?.push(`Cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * HTTP handler for manual cleanup
 * Requires API key authentication
 * @param req - HTTP request
 * @param res - HTTP response
 */
  // manual cleanup means we call this function via HTTP request (a full on object)
  // with authentication as a parameter, so only authorized users can do it. The 
  // confusing notation is just because authMiddleware is itself a function that takes
  // req and res as params and returns a boolean promise (true if authenticated). Again,
  // promise means async operations work or nah. This chaotic mess of a function is indeed
  // just how ts works: the pattern is called "higher order functions" - functions that take
  // other functions as params. Welcome to real programming

  // authenticate request with our amazing middleware function that we passed as a whole param
export async function handleManualCleanup(req: Request, res: Response): Promise<void> {
  try {
    // Validate query parameters
    // This is done with a Node module called Zod; it lets us add schemas for better validation
    // when we get the params from the HTTP request. The schema itself is defined in
    // functions/schemas/cleanup-events.schema.ts. The validating is done elsewhere (in 
    // functions/validation.ts) but we still pass the actual cleanup events schema here as
    // a param. This is called "dependency injection" - passing dependencies as params
    // instead of hardcoding them inside the function, with 5-10 little params etc
  const validation = validateQueryParams<import('../schemas/cleanup-events.schema').CleanupEventsQuery>(req as any, cleanupEventsQuerySchema);
    
    if (!validation.success) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createValidationErrorResponse(validation.errors, 'Invalid query parameters')
      );
      return;
    }

    // extract validated params. The "data!" part means we assert that data is not null/undefined;
    // since we already checked validation.success above, this __should__ be safe...
    const { daysToKeep, dryRun, archive, batchSize } = validation.data!;

    logger.info('Manual cleanup requested', {
      daysToKeep,
      dryRun,
      archiveBeforeDelete: archive,
    });

    // do the cleanup with the original function we wrote above.
    const result = await cleanupOldEvents((req as any).supabase, { // remember - cleanupOldEvents() sends back a promise
      daysToKeep,
      dryRun,
      archiveBeforeDelete: archive,
      batchSize,
    });
    // See that "await" keyword above? It means "wait for this async function to complete before continuing
    // with any other code". So yes, this function sits and waits for cleanupOldEvents() to finish and send
    // back the result as a promise. When done, we can proceed with the rest of the code below

    res.json({ // send the http response object back when we've received the result as a promise object
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });

    // async programming truly is magical isn't it
  } catch (error: any) {
    logger.error('Manual cleanup failed', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(createErrorResponse(error, isDevelopment));
    // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
  }
}

/**
 * Scheduled cleanup handler
 * Runs weekly to clean up old events automatically
 */
export async function handleScheduledCleanup(supabase: SupabaseClient): Promise<void> {
  try {
    logger.info('Scheduled event cleanup started');
    
    const result = await cleanupOldEvents(supabase, {
      daysToKeep: 90, // keep events for 90 days
      dryRun: false,
      archiveBeforeDelete: true, // archive before deleting
    });

    logger.info('Scheduled cleanup completed', result);

    // alert in our logger if cleanup failed or had errors
    if (result.failedCount > 0 || (result.errors && result.errors.length > 0)) {
      logger.critical('Scheduled cleanup had failures', new Error('Cleanup failures'), {
        failedCount: result.failedCount,
        errors: result.errors,
      });
    }
  } catch (error: any) {
    logger.error('Scheduled cleanup failed', error);
  }
}