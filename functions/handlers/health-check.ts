import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { logger } from '../utils/logger';
import { HttpResponse, toTypedError } from '../types/handlers';
import { createErrorResponse } from '../utils/error-sanitizer';
import { HTTP_STATUS, TIME } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// This handler does "health check", so just checking that the services are indeed
// running. One might ask if this isn't related to "token-minotir.ts" handler, and 
// it is, but health checking is about the whole system, not just the tokens/events
// and when they need to be renewed etc etc

export interface HealthCheckResult {
  // ts interfaces are slightly different from java/c# in that they are only used for
  // "type checking", i.e. the compiler checks that the types are correct. Meanwhile
  // java/c# interfaces are used for both type checking and code generation in the code itself
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number; // seconds since deployment
  version: string;
  checks: {
    firestore: HealthCheckStatus;
    storage: HealthCheckStatus;
    secretManager: HealthCheckStatus;
  };
}

interface HealthCheckStatus {
  status: 'ok' | 'error';
  latency?: number; // milliseconds
  error?: string;
}

const startTime = Date.now();

/**
 * Check Firestore connectivity by reading a test document
 * @param db - Firestore instance
 * @returns Health check status
 */
async function checkFirestoreHealth(db: admin.firestore.Firestore): Promise<HealthCheckStatus> {
  // these functions look a little complicated because we're doing async aand promise. Promise
  // is a whole javascript object with a bunch of methods like .then, .catch, .finally, etc.
  // that relates to future values. This lets us do things asynchronously, which is an amazing 
  // feature: While we're waiting for firestore to respond, we can do other things, speeding
  // up our app significantly. It's also used in frontend for this reason
  const start = Date.now();
  try {
    // try to read from pages collection; this query is v lightweight
    // limit(1) is used to limit the number of documents returned to 1
    // get() actually executes the query
    // await tells the function to wait for the query to complete before returning the result
    await db.collection('pages').limit(1).get();
    return {
      status: 'ok',
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const typedError = toTypedError(error);
    // can i just say that i love having a dedicated logger for all this
    logger.warn('Health check: Firestore check failed', { error: typedError.message });
    return {
      status: 'error',
      error: typedError.message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check Storage bucket connectivity
 * @returns Health check status
 */
async function checkStorageHealth(storageClient?: any): Promise<HealthCheckStatus> {
  const start = Date.now();
  try {
    const storage = storageClient || admin.storage();
    const bucket = storage.bucket();
    // The easy way to do this is to just get the bucket metadata; if it works, it's online
    // before there was a comment here about how we didn't check the state and health of the 
    // bucket, guess what, we finally do check it
    await bucket.getMetadata();
    return { 
      status: 'ok', // if we got here, the bucket is online and all good
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const typedError = toTypedError(error);
    logger.warn('Health check: Storage check failed', { error: typedError.message });
    return {
      status: 'error',
      error: typedError.message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check Secret Manager connectivity
 * @returns Health check status
 */
async function checkSecretManagerHealth(secretClient?: any): Promise<HealthCheckStatus> {
  const start = Date.now();
  try {
    const client = secretClient || (await (async () => {
      const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
      return new SecretManagerServiceClient();
    })());

    const projectId = process.env.GCLOUD_PROJECT;
    await client.listSecrets({
      parent: `projects/${projectId}`,
      pageSize: 1,
    });

    return {
      status: 'ok',
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const typedError = toTypedError(error);
    logger.warn('Health check: Secret Manager check failed', { error: typedError.message });
    return {
      status: 'error',
      error: typedError.message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Perform the full health check
 * @returns Health check result
 */
export async function performHealthCheck(
  
  db?: admin.firestore.Firestore,
  storageClient?: any,
  secretClient?: any
): Promise<HealthCheckResult> {
  const dbInstance = db || admin.firestore();
  // so remember how we prefaced our functions with "async"? Well now we use
  // Promise.all to run multiple promises in parallel for mega speed.
  // I mean this entire async process may have been overkill for this simple task, but
  // its nice to train these things
  const [firestoreCheck, storageCheck, secretManagerCheck] = await Promise.all([
    checkFirestoreHealth(dbInstance),
    checkStorageHealth(storageClient),
    checkSecretManagerHealth(secretClient),
  ]);

  // check if any of the checks failed
  const hasErrors = 
    firestoreCheck.status === 'error' ||
    storageCheck.status === 'error' ||
    secretManagerCheck.status === 'error';

  // ? : notation = if hasErrors is true, return 'unhealthy', otherwise return 'healthy'
  const status = hasErrors ? 'unhealthy' : 'healthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / TIME.MS_PER_SECOND),
    version: process.env.K_REVISION || '1.0.0',
    checks: {
      firestore: firestoreCheck,
      storage: storageCheck,
      secretManager: secretManagerCheck,
    },
  };
}

/**
 * HTTP handler for health check endpoint
 * Returns 200 if healthy, 503 if unhealthy
 * @param req - HTTP request
 * @param res - HTTP response
 */
export async function handleHealthCheck(req: Request, res: HttpResponse): Promise<void> {
  try {
  // this used to be way simpler, i.e. const result = await performHealthCheck();
  // but using exports as any allows tests to insert a "stubbed" (another terrible
  // programmer word meaning "fake" or "mock") version of performHealthCheck for testing
  const result = await (exports as any).performHealthCheck();
    
    // Return http status code "503" if unhealthy, "200" otherwise
    // 503 is the standard for "service unavailable"
    // 200 is the standard for "ok"
    // you should already be aware of 404 (not found) and 403 (forbidden)
    const statusCode = result.status === 'unhealthy' ? HTTP_STATUS.SERVICE_UNAVAILABLE : HTTP_STATUS.OK;
    
    res.status(statusCode).json(result); // send the whole result as json. 
    // the idea is that it's similar to what we do below with "res.status(503).json({...})",
    // or frankly any other json response, and honestly we should probably do that. Sending 
    // the whole result is useful for debugging, but might be risky if we expose too much
    // info in a public endpoint debugging, but might be risky if we expose too much info in 
    // a public endpoint
  } catch (error: unknown) {
    const typedError = toTypedError(error); // amazing inbuilt "casting"
    // function that turns unknown error into a dedicated typed Error 
    // (and error with an explicit type) with message property etc
    logger.error('Health check endpoint failed', typedError);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(
      createErrorResponse(typedError, isDevelopment, 'Health check failed - service unavailable')
      // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
    );
  }
}

