import { Request } from 'firebase-functions/v2/https';
import { getApiKey } from '../services/secret-manager';
import { logger } from '../utils/logger';

// So in the broadest sense middleware is any software that works between 
// apps and services etc. Usually that means security, little "checkpoints"

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
      res.status(500).json({  // 500 = server error
        error: 'Server configuration error',
        message: 'API authentication is not properly configured'
      });
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
    res.status(401).json({ // 401 = unauthorized
      error: 'Unauthorized',
      message: 'Valid API key required. Provide via Authorization: Bearer <key> or x-api-key: <key> header'
    });
    return false;
  } catch (error: any) {
    logger.error('API key verification failed', error);
    res.status(500).json({ // 500 = server error
      error: 'Authentication error',
      message: 'Failed to verify API key'
    });
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

