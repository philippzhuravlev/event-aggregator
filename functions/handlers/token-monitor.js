const admin = require('firebase-admin');
const { checkTokenExpiry } = require('../services/secret-manager');
const { getActivePages } = require('../services/firestore-service');
const { logger } = require('../utils/logger');

// NB: "Handlers" like execute business logic. Meanwhile "Services" connect 
// something to an existing service, e.g. facebook or google secrets manager
// here we use a lot of dedicated service scripts from our facebook service 
// in /functions/services

// This handler handles "token health", a fancy work for anything related
// to token renewing etc etc

/**
 * Check all page tokens for expiry status
 * Returns a report of which tokens are expiring soon or already expired
 * @returns {Promise<Object>} Token health report
 */
async function checkAllTokenHealth() {
  const db = admin.firestore();
  const pages = await getActivePages(db);
  
  const report = {
    totalPages: pages.length,
    healthy: [],
    expiringSoon: [],
    expired: [],
    unknown: [],
    timestamp: new Date().toISOString(),
  };

  for (const page of pages) {
    try {
      const status = await checkTokenExpiry(db, page.id, 7); // 7 days warning
      
      const pageInfo = {
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
    } catch (error) {
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
  report.expiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  
  return report;
}

/**
 * HTTP handler for token health check endpoint
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {Function} authMiddleware - Authentication middleware function
 */
async function handleTokenHealthCheck(req, res, authMiddleware) {
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
  } catch (error) {
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
async function handleScheduledTokenMonitoring() {
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
  } catch (error) {
    logger.error('Scheduled token monitoring failed', error);
    throw error;
  }
}

module.exports = {
  checkAllTokenHealth,
  handleTokenHealthCheck,
  handleScheduledTokenMonitoring,
};
