import { Request } from 'firebase-functions/v2/https';
import { ALLOWED_ORIGINS, FACEBOOK_ORIGIN } from '../utils/constants';
import { logger } from '../utils/logger';
import { sanitizeErrorMessage } from '../utils/error-sanitizer';

// So in the broadest sense middleware is any software that works between apps and 
// services etc. Usually that means security, little "checkpoints". In many ways they're 
// comparable to handlers in that they "do something", but that "doing something" is less
// domain logic but more security (auth, validation etc).

// Like auth, validation is classic middleware. It protects against classic attacks 
// e.g. sending SQL statements in text fields (an "injection attack"), manually 
// changing redirect urls etc. The whole point of validation however is to ensure
// that data is in the correct format, and that it meets our expectations. We use a
// nice library called Zod (see functions/schemas/) to define "schemas" for data
// (like "this is what a valid facebook webhook payload looks like"), and then
// we can use those schemas to validate incoming data. If the data doesn't match
// the schema, we can reject it before it causes any harm. So like think of schemas
// as "checkers" in the same way that /types/ are "checkers" for data types (bool, str etc)

/**
 * Validate that a redirect origin is in our whitelist
 * Prevents open redirect attacks in OAuth flow
 * @param origin - Origin to validate
 * @returns True if origin is allowed
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  
  // we try to match the origin against our whitelist, e.g. localhost, dtuevent.dk etc
  // this is important because otherwise someone could do an "open redirect" attack
  // where they send a user to facebook to login, but then redirect them to a 
  // malicious site instead of our own. This way we can be sure that only urls
  // we know about are used.
  return ALLOWED_ORIGINS.includes(origin);
}

interface OAuthStateValidation { // note that in js/ts, interfaces are just for type checking
  isValid: boolean;
  origin: string | null;
  error: string | null;
}

/**
 * Validate and sanitize OAuth state parameter
 * Prevents injection attacks and validates redirect URL
 * @param state - State parameter from OAuth callback
 * @returns Validation result with origin and error
 */
export function validateOAuthState(state: string): OAuthStateValidation {
  if (!state) {
    return {
      isValid: false,
      origin: null,
      error: 'Missing state parameter',
    };
  }

  try {
    // decode and parse the state URL
    const decodedState = decodeURIComponent(state); // helpful built-in js function
    const stateUrl = new URL(decodedState);
    const origin = stateUrl.origin;

    // check if origin is whitelisted in our list
    if (!isAllowedOrigin(origin)) {
      logger.warn('Unauthorized redirect origin attempt', { 
        attemptedOrigin: origin,
        allowedOrigins: ALLOWED_ORIGINS,
      });
      return {
        isValid: false,
        origin: null,
        error: 'Unauthorized redirect origin',
      };
    }

    // if we reached this far, the state is valid and origin is allowed
    return {
      isValid: true,
      origin: origin,
      error: null,
    };
  } catch (error: any) {
    logger.warn('Invalid state parameter format', { 
      state: state.substring(0, 50), // Log first 50 chars only
      error: sanitizeErrorMessage(error.message || String(error)),
    });

    // state is invalid
    return {
      isValid: false,
      origin: null,
      error: 'Invalid state parameter format',
    };
  }
}

interface OAuthCallbackValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate OAuth callback
 * @param query - Request query parameters
 * @returns Validation result
 */
export function validateOAuthCallback(query: Record<string, any>): OAuthCallbackValidation {
  const errors: string[] = [];
  // check for required parameters; for a successful auth, we need "code"
  // that's sent by facebook thru the url, and if there's an error, we receive "error"
  if (!query.code && !query.error) {
    errors.push('Missing authorization code or error parameter');
  }

  // validate code format (should be alphanumeric + some special chars)
  if (query.code && !/^[\w\-._~]+$/.test(query.code)) {
    errors.push('Invalid authorization code format');
  }

  // validate state if present
  if (query.state) {
    const stateValidation = validateOAuthState(query.state);
    if (!stateValidation.isValid && stateValidation.error) {
      errors.push(stateValidation.error);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * CORS middleware for HTTP Cloud Functions
 * Validates origin and sets appropriate headers
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @returns True if request should continue, false if preflight handled
 */
export function handleCORS(req: Request, res: any): boolean {
  const origin = req.headers.origin || req.headers.referer;
  // generally, we want to allow requests from the same origin. However, CORS is an intentional, 
  // safe way to bypass this "same origin policy" CORS is a classic concern, and browsers and serves
  // do a lot of it automatically ir have built-in support to do things safely.

  // Check if origin is allowed
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originBase = originUrl.origin; // e.g. "http://localhost:3000", "dtuevent.dk"
      
      if (isAllowedOrigin(originBase) || originBase === FACEBOOK_ORIGIN) {
        // set CORS headers for allowed origin. Headers are part of the http "protocol" (system)
        // and are usually hidden from ordinary view, but are passed alongside what you see (the url)
        // the headers below are the classic way of telling the browser that CORS is allowed
        res.set('Access-Control-Allow-Origin', originBase);
        res.set('Access-Control-Allow-Credentials', 'true');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
        res.set('Access-Control-Max-Age', '3600');
      } else {
        logger.warn('CORS request from unauthorized origin', { 
          origin: originBase,
          path: req.path,
        });
      }
    } catch (error: any) {
      logger.debug('Invalid origin header', { origin, error: sanitizeErrorMessage(error?.message || String(error)) });
    }
  }

  // CORS preflight request handling
  // A preflight request is an OPTIONS request (just another kind of HTTP request like 
  // GET/POST) sent by browsers to check whether the CORS (dodging same-origin policy) 
  // is allowed. We in turn do that by responding to the OPTIONS request with headers
  // (like Accept, Accept-Encoding etc) and a "204 No Content" status.
  if (req.method === 'OPTIONS') {
    res.status().send('');
    return false; // dont continue
  }

  return true; // continue
}