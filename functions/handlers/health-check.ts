import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { toTypedError } from '../types/handlers';
import { createErrorResponse } from '../utils/error-sanitizer';
import { HTTP_STATUS, TIME } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

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
    supabase: HealthCheckStatus;
  };
}

interface HealthCheckStatus {
  status: 'ok' | 'error';
  latency?: number; // milliseconds
  error?: string;
}

const startTime = Date.now();

/**
 * Check Supabase connectivity by making a simple query
 * @param supabase - Supabase client
 * @returns Health check status
 */
async function checkSupabaseHealth(supabase: SupabaseClient): Promise<HealthCheckStatus> {
  // these functions look a little complicated because we're doing async aand promise. Promise
  // is a whole javascript object with a bunch of methods like .then, .catch, .finally, etc.
  // that relates to future values. This lets us do things asynchronously, which is an amazing 
  // feature: While we're waiting for supabase to respond, we can do other things, speeding
  // up our app significantly. It's also used in frontend for this reason
  const start = Date.now();
  try {
    // these functions look a little complicated because we're doing async aand promise. Promise
    // is a whole javascript object with a bunch of methods like .then, .catch, .finally, etc.
    // that relates to future values. This lets us do things asynchronously, which is an amazing 
    await supabase.from('pages').select('id').limit(1);
    return {
      status: 'ok',
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const typedError = toTypedError(error);
    logger.warn('Health check: Supabase check failed', { error: typedError.message });
    return {
      status: 'error',
      error: typedError.message,
      latency: Date.now() - start,
    };
  }
}

/**
 * Perform the full health check
 * @param supabase - Supabase client
 * @returns Health check result
 */
export async function performHealthCheck(
  supabase: SupabaseClient
): Promise<HealthCheckResult> {
  // so remember how we prefaced our functions with "async"? Well now we use
  // Promise.all to run multiple promises in parallel for mega speed.
  // I mean this entire async process may have been overkill for this simple task, but
  // its nice to train these things
  const [supabaseCheck] = await Promise.all([
    checkSupabaseHealth(supabase),
  ]);

  const hasErrors = supabaseCheck.status === 'error';

  const status = hasErrors ? 'unhealthy' : 'healthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / TIME.MS_PER_SECOND),
    version: process.env.K_REVISION || '1.0.0',
    checks: {
      supabase: supabaseCheck,
    },
  };
}

/**
 * HTTP handler for health check endpoint
 * Returns 200 if healthy, 503 if unhealthy
 * @param req - HTTP request
 * @param res - HTTP response
 */
export async function handleHealthCheck(req: Request, res: Response): Promise<void> {
  try {
  // this used to be way simpler, i.e. const result = await performHealthCheck();
  // but using exports as any allows tests to insert a "stubbed" (another terrible
  // programmer word meaning "fake" or "mock") version of performHealthCheck for testing
  const result = await performHealthCheck((req as any).supabase);
    // Return http status code "503" if unhealthy, "200" otherwise
    // 503 is the standard for "service unavailable"
    // 200 is the standard for "ok"
    // you should already be aware of 404 (not found) and 403 (forbidden)
    const statusCode = result.status === 'unhealthy' ? HTTP_STATUS.SERVICE_UNAVAILABLE : HTTP_STATUS.OK;

    // the idea is that it's similar to what we do below with "res.status(503).json({...})",
    // or frankly any other json response, and honestly we should probably do that. Sending 
    // the whole result is useful for debugging, but might be risky if we expose too much
    // info in a public endpoint debugging, but might be risky if we expose too much info in 
    // a public endpoint
    res.status(statusCode).json(result);
  } catch (error: unknown) {
    // function that turns unknown error into a dedicated typed Error 
    // (and error with an explicit type) with message property etc
    const typedError = toTypedError(error);
    logger.error('Health check endpoint failed', typedError);
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(
      createErrorResponse(typedError, isDevelopment, 'Health check failed - service unavailable')
      // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
    );
  }
}