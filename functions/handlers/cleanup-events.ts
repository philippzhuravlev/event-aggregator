import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { CleanupResult, CleanupOptions } from '../types';
import { logger } from '../utils/logger';
import { createErrorResponse } from '../utils/error-sanitizer';
import { validateQueryParams } from '../middleware/validation-schemas';
import { cleanupEventsQuerySchema } from '../schemas/cleanup-events.schema';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// This handler cleans up old events to prevent database bloat events older than X
// days are deleted (or archived). Archiving is important because of GDPR compliance, 
// cuz the user has a right to get all their stored data back even after deletion

/**
 * Clean up old events from Firestore
 * @param options - Cleanup configuration
 * @returns Cleanup result with counts and details
 */
export async function cleanupOldEvents(options: CleanupOptions): Promise<CleanupResult> {
  // the "options: " part means that the function takes a single argument "options"
  // which is of type CleanupOptions, defined in ../types/index.ts. Now the "options" 
  // object itself has properties like daysToKeep, whether to dryRun (actually do cleanup
  // or just simulate), archiveBeforeDelete, etc. which we use in the function. This is a
  // common pattern in typescript, whose fancy term is called "object destructuring" to
  // pass many little params into one function as a single object - like, imagine doing 5-10
  // params manually for each function
  const startTime = Date.now();
  const db = admin.firestore();
  
  const {
    daysToKeep,
    dryRun = false, // dry run means we just simulate the cleanup without actually deleting anything
    archiveBeforeDelete = false,
    batchSize = 500, // firestore batch limit. 500 cleanups per batch
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
    const oldEventsQuery = db.collection('events')
      .where('startTime', '<', cutoffISO)
      .limit(10000); // Process max 10k at a time to avoid memory issues

    const snapshot = await oldEventsQuery.get();

    // if no more older events than last batch, we're done
    if (snapshot.empty) {
      logger.info('No old events found to clean up');
      result.duration = Date.now() - startTime;
      return result;
    }

    logger.info('Found old events to clean up', { count: snapshot.size });

    // archive to cheaper storage if requested
    if (archiveBeforeDelete && !dryRun) {
      try {
        await archiveEvents(snapshot.docs);
        result.archivedCount = snapshot.docs.length;
        logger.info('Events archived successfully', { count: result.archivedCount });
      } catch (error: any) {
        logger.error('Failed to archive events', error);
        result.errors?.push(`Archive failed: ${error.message}`);
      }
    }

    // delete events in batches (firestore limit: 500 ops per batch)
    if (!dryRun) {
      const chunks: FirebaseFirestore.DocumentSnapshot[][]  = [];
      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        chunks.push(snapshot.docs.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        const batch = db.batch();
        
        for (const doc of chunk) {
          try {
            batch.delete(doc.ref);
          } catch (error: any) {
            logger.error('Failed to add delete to batch', error, { eventId: doc.id });
            result.failedCount++;
            result.errors?.push(`Failed to delete ${doc.id}: ${error.message}`);
          }
        }

        try {
          await batch.commit();
          result.deletedCount += chunk.length - result.failedCount;
          logger.debug('Deleted batch of events', {
            batchSize: chunk.length,
            totalDeleted: result.deletedCount,
          });
        } catch (error: any) {
          logger.error('Failed to commit batch delete', error);
          result.failedCount += chunk.length;
          result.errors?.push(`Batch commit failed: ${error.message}`);
        }
      }
    } else {
      // Again, just to repeat myself, "Dry run" is just simulate what would be deleted, without
      // actually deleting anything; its the certified best way to test cleanup without risk
      result.deletedCount = snapshot.size;
      logger.info('Dry run - would delete events', { count: snapshot.size });
    }

    result.duration = Date.now() - startTime; // here it sure helped having the results be an object, huh

    logger.info('Event cleanup completed', {
      ...result,
      durationSeconds: (result.duration / 1000).toFixed(2), // convert ms to seconds
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
 * Archive events to Google Cloud Storage before deletion
 * This stores them as JSON in a cheaper storage tier
 * @param docs - Firestore documents to archive
 */
async function archiveEvents(docs: FirebaseFirestore.DocumentSnapshot[]): Promise<void> {
  if (docs.length === 0) return;
  // note well: Archiving is actually super important because if we just delete stuff,
  // we might not be able to give the data back if the user wants (GDPR complicance)

  try {
    // lets start by initializing things, principally the storage bucket
    const storage = admin.storage();
    const bucket = storage.bucket();
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `archives/events-${timestamp}.json`; // in the "archives" folder
    // the name will be e.g. "events-2023-10-05.json"
    
    // prepare archive data
    const archiveData = docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      archivedAt: new Date().toISOString(),
    }));

    // upload to cloud storage!!
    const file = bucket.file(filename);
    await file.save(JSON.stringify(archiveData, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'private, max-age=31536000', // 1 year
        metadata: {
          eventCount: docs.length.toString(),
          archivedAt: new Date().toISOString(),
        },
      },
    });

    logger.info('Events archived to Cloud Storage', {
      filename,
      count: docs.length,
      size: JSON.stringify(archiveData).length,
    });
  } catch (error: any) {
    logger.error('Failed to archive events to Cloud Storage', error);
    throw error;
  }
}

/**
 * HTTP handler for manual cleanup
 * Requires API key authentication
 * @param req - HTTP request
 * @param res - HTTP response
 * @param authMiddleware - Authentication middleware
 */
export async function handleManualCleanup(
  req: Request,
  res: any,
  authMiddleware: (req: Request, res: any) => Promise<boolean>
): Promise<void> {
  // manual cleanup means we call this function via HTTP request (a full on object)
  // with authentication as a parameter, so only authorized users can do it. The 
  // confusing notation is just because authMiddleware is itself a function that takes
  // req and res as params and returns a boolean promise (true if authenticated). Again,
  // promise means async operations work or nah. This chaotic mess of a function is indeed
  // just how ts works: the pattern is called "higher order functions" - functions that take
  // other functions as params. Welcome to real programming
  
  // authenticate request with our amazing middleware function that we passed as a whole param
  const isAuthenticated = await authMiddleware(req, res);
  if (!isAuthenticated) {
    return; // don't worry about logging - Middleware already sent error
  }

  try {
    // Validate query parameters
    // This is done with a Node module called Zod; it lets us add schemas for better validation
    // when we get the params from the HTTP request. The schema itself is defined in
    // functions/schemas/cleanup-events.schema.ts. The validating is done elsewhere (in 
    // functions/validation.ts) but we still pass the actual cleanup events schema here as
    // a param. This is called "dependency injection" - passing dependencies as params
    // instead of hardcoding them inside the function, with 5-10 little params etc
    const validation = validateQueryParams(req, cleanupEventsQuerySchema);
    
    if (!validation.success) {
      res.status(400).json({ // 400 = Bad Request
        error: 'Invalid query parameters',
        details: validation.errors,
      });
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
    const result = await cleanupOldEvents({ // remember - cleanupOldEvents() sends back a promise
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
    res.status(500).json(createErrorResponse(error, isDevelopment));
  }
}

/**
 * Scheduled cleanup handler
 * Runs weekly to clean up old events automatically
 */
export async function handleScheduledCleanup(): Promise<void> {
  try {
    logger.info('Scheduled event cleanup started');
    
    const result = await cleanupOldEvents({
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

