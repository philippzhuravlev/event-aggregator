import { Request } from 'firebase-functions/v2/https';
import { getApiKey } from '../services/secret-manager';
import { logger } from '../utils/logger';
import { HTTP_STATUS } from '../utils/constants';
import { createErrorResponse } from '../utils/error-sanitizer';

// So in the broadest sense middleware is any software that works between apps and 
// services etc. Usually that means security, little "checkpoints". In many ways they're 
// comparable to handlers in that they "do something", but that "doing something" is less
// domain logic but more security (auth, validation etc).

// authentication is the archetypical middleware. It protects http endpoints 
// when requests and responses are sent out to make sure the right auth is done

/**
 * Verify that user has API key for manual sync endpoints
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @returns True if authenticated, sends error response if not
 */
export async function requireApiKey(req: Request, res: any): Promise<boolean> {
  try {
    const validApiKey = await getApiKey(); // get the API key from Google Secret Manager service
    
    if (!validApiKey) {
      logger.critical('API key not configured in Secret Manager', new Error('Missing API key'));
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse( // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
          new Error('Server configuration error'), // create a new error object
          false, // isDevelopment = false, since this is a server config error
          'API authentication is not properly configured' // the manual, custom message we send back
        )
      );
      return false;
    }

    // here we check the http headers (metadata) for the authorization to pull out the api key:)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const providedKey = authHeader.substring(7); // Remove 'Bearer ' prefix
      if (providedKey === validApiKey) {
        logger.debug('API key authentication successful', { method: 'Authorization header' });
        return true;
      }
    }

    // check x-api-key header (simpler format)
    // x-api-key is if we want our own headers for the sake of ease
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader === validApiKey) {
      logger.debug('API key authentication successful', { method: 'x-api-key header' });
      return true;
    }

    // valid key found not found
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    logger.warn('Unauthorized API access attempt', {
      ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json(
      createErrorResponse(
        new Error('Unauthorized'),
        false,
        'Valid API key required. Provide via Authorization: Bearer <key> or x-api-key: <key> header'
      )
    );
    return false;
  } catch (error: any) {
    logger.error('API key verification failed', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(
        error,
        false,
        'Failed to verify API key'
      )
    );
    return false;
  }
}

/**
 * Middleware to log request details (for monitoring)
 * @param req - HTTP request object
 */
export function logRequest(req: Request): void {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  logger.info('HTTP request received', {
    method: req.method,
    path: req.path,
    ip,
    userAgent,
  });
}

