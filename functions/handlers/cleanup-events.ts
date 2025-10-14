import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { CleanupResult, CleanupOptions } from '../types';
import { logger } from '../utils/logger';
import { createErrorResponse } from '../utils/error-sanitizer';

// NB: "Handlers" like execute business logic; they "do something", like
// // syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// This handler cleans up old events to prevent database bloat
// events older than X days are deleted (or archived)

/**
 * Clean up old events from Firestore
 * @param options - Cleanup configuration
 * @returns Cleanup result with counts and details
 */
export async function cleanupOldEvents(options: CleanupOptions): Promise<CleanupResult> {
  const startTime = Date.now();
  const db = admin.firestore();
  
  const {
    daysToKeep,
    dryRun = false,
    archiveBeforeDelete = false,
    batchSize = 500, // Firestore batch limit
  } = options;

  // calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffISO = cutoffDate.toISOString();

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

  try {
    // Query events older than cutoff date
    // we use endTime if available, otherwise startTime
    const oldEventsQuery = db.collection('events')
      .where('startTime', '<', cutoffISO)
      .limit(10000); // Process max 10k at a time to avoid memory issues

    const snapshot = await oldEventsQuery.get();

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
      // "Dry run", i.e. just count what would be deleted, without actually deleting anything;
      // its a good way to test the cleanup process without actually deleting anything
      result.deletedCount = snapshot.size;
      logger.info('Dry run - would delete events', { count: snapshot.size });
    }

    result.duration = Date.now() - startTime;

    logger.info('Event cleanup completed', {
      ...result,
      durationSeconds: (result.duration / 1000).toFixed(2),
    });

    return result;
  } catch (error: any) {
    logger.error('Event cleanup failed', error);
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

  try {
    const storage = admin.storage();
    const bucket = storage.bucket();
    
    // create archive filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `archives/events-${timestamp}.json`;
    
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
  // authenticate request
  const isAuthenticated = await authMiddleware(req, res);
  if (!isAuthenticated) {
    return; // Middleware already sent error
  }

  try {
    // get options from query params
    const daysToKeep = parseInt(req.query.daysToKeep as string || '90');
    const dryRun = req.query.dryRun === 'true';
    const archiveBeforeDelete = req.query.archive === 'true';

    logger.info('Manual cleanup requested', {
      daysToKeep,
      dryRun,
      archiveBeforeDelete,
    });

    const result = await cleanupOldEvents({
      daysToKeep,
      dryRun,
      archiveBeforeDelete,
    });

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
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

