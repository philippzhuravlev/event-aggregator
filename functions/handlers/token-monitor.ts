import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { checkTokenExpiry, getActivePages } from '../services/supabase-service';
import { logger } from '../utils/logger';
import { TokenHealthReport, PageTokenInfo } from '../types';
import { TOKEN_EXPIRY_CONFIG, HTTP_STATUS } from '../utils/constants';
import { createErrorResponse } from '../utils/error-sanitizer';

// NB: "Handlers" like execute business logic; they "do something", like
// syncing events or refreshing tokens, etc. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or supabase vault

// This handler handles "token health", a fancy work for anything related
// to token renewing etc etc. note there might be some overlap with "health-check.ts"
// handler, but that's for the whole damn system, not just the tokens/events

/**
 * Check all page tokens for expiry status
 * Returns a report of which tokens are expiring soon or already expired
 * @param supabase - Supabase client
 * @returns Token health report
 */
export async function checkAllTokenHealth(supabase: SupabaseClient): Promise<TokenHealthReport> {
  const pages = await getActivePages(supabase);
  
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
      const status = await checkTokenExpiry(supabase, page.id, TOKEN_EXPIRY_CONFIG.warningDays);
      
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
 */
export async function handleTokenHealthCheck(req: Request, res: Response): Promise<void> {
  try {
    logger.info('Token health check started');
    const report = await checkAllTokenHealth((req as any).supabase);
    
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
    const isDevelopment = process.env.NODE_ENV === 'development';
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse(error, isDevelopment, 'Failed to check token health')
      // NB: "createErrorResponse" is a utility function in /utils/ that sanitizes errors
    );
  }
}

/**
 * Scheduled handler to monitor token health and log warnings
 * This should run daily to proactively identify expiring tokens
 */
export async function handleScheduledTokenMonitoring(supabase: SupabaseClient): Promise<TokenHealthReport> {
  try {
    logger.info('Scheduled token health monitoring started');
    const report = await checkAllTokenHealth(supabase);
    
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