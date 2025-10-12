import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';
import { checkTokenExpiry } from '../services/secret-manager';
import { getActivePages } from '../services/firestore-service';
import { logger } from '../utils/logger';
import { TokenHealthReport, PageTokenInfo } from '../types';
import { TOKEN_REFRESH } from '../utils/constants';

// NB: "Handlers" like execute business logic; they "do something", like
// // syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager

// This handler handles "token health", a fancy work for anything related
// to token renewing etc etc. note there might be some overlap with "health-check.ts"
// handler, but that's for the whole damn system, not just the tokens/events

/**
 * Check all page tokens for expiry status
 * Returns a report of which tokens are expiring soon or already expired
 * @returns Token health report
 */
export async function checkAllTokenHealth(): Promise<TokenHealthReport> {
  const db = admin.firestore();
  const pages = await getActivePages(db);
  
  const report: TokenHealthReport = {
    totalPages: pages.length,
    healthy: [],
    expiringSoon: [],
    expired: [],
    unknown: [],
    timestamp: new Date().toISOString(),
  };

  for (const page of pages) {
    try {
  const status = await checkTokenExpiry(db, page.id, TOKEN_REFRESH.WARNING_DAYS); // configured warning days
      
      const pageInfo: PageTokenInfo = {
        pageId: page.id,
        pageName: page.name,
        daysUntilExpiry: status.daysUntilExpiry,
        expiresAt: status.expiresAt ? status.expiresAt.toISOString() : null,
      };

      if (status.daysUntilExpiry < 0) {
        report.expired.push(pageInfo);
      } else if (status.isExpiring) {
        report.expiringSoon.push(pageInfo);
      } else if (status.expiresAt) {
        report.healthy.push(pageInfo);
      } else {
        report.unknown.push(pageInfo);
      }
    } catch (error: any) {
      logger.error('Error checking token expiry for page', error, {
        pageId: page.id,
        pageName: page.name,
      });
      report.unknown.push({
        pageId: page.id,
        pageName: page.name,
        error: error.message,
      });
    }
  }

  // sort the expiring tokens 
  report.expiringSoon.sort((a, b) => (a.daysUntilExpiry || 0) - (b.daysUntilExpiry || 0));
  
  return report;
}

/**
 * HTTP handler for token health check endpoint
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param authMiddleware - Authentication middleware function
 */
export async function handleTokenHealthCheck(
  req: Request, 
  res: any, 
  authMiddleware: (req: Request, res: any) => Promise<boolean>
): Promise<void> {
  // authenticate request first
  const isAuthenticated = await authMiddleware(req, res);
  if (!isAuthenticated) {
    return; // middleware already sent error
  }

  try {
    logger.info('Token health check started');
    const report = await checkAllTokenHealth();
    
    // Log warnings for expiring/expired tokens
    if (report.expired.length > 0) {
      logger.critical('Expired tokens detected', new Error('Tokens expired'), {
        count: report.expired.length,
        expiredTokens: report.expired,
      });
    }
    if (report.expiringSoon.length > 0) {
      logger.warn('Tokens expiring soon', {
        count: report.expiringSoon.length,
        expiringTokens: report.expiringSoon,
      });
    }
    
    res.json({
      success: true,
      report,
    });
  } catch (error: any) {
    logger.error('Token health check failed', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Scheduled handler to monitor token health and log warnings
 * This should run daily to proactively identify expiring tokens
 */
export async function handleScheduledTokenMonitoring(): Promise<TokenHealthReport> {
  try {
    logger.info('Scheduled token health monitoring started');
    const report = await checkAllTokenHealth();
    
    // Log summary
    logger.info('Token health summary', {
      healthy: report.healthy.length,
      expiringSoon: report.expiringSoon.length,
      expired: report.expired.length,
      unknown: report.unknown.length,
    });
    
    // expired token summary
    if (report.expired.length > 0) {
      logger.critical('Expired tokens detected in scheduled monitoring', new Error('Tokens expired'), {
        count: report.expired.length,
        expiredTokens: report.expired,
      });
    }
    
    // expiring tokens
    if (report.expiringSoon.length > 0) {
      logger.warn('Tokens expiring soon in scheduled monitoring', {
        count: report.expiringSoon.length,
        expiringTokens: report.expiringSoon,
      });
    }
    
    return report;
  } catch (error: any) {
    logger.error('Scheduled token monitoring failed', error);
    throw error;
  }
}

