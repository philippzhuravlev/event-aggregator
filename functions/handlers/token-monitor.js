const admin = require('firebase-admin');
const { checkTokenExpiry } = require('../services/secret-manager');
const { getActivePages } = require('../services/firestore-service');

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
      console.error(`Error checking token for page ${page.id}:`, error);
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
    console.log('Checking token health...');
    const report = await checkAllTokenHealth();
    
    // Log warnings for expiring/expired tokens
    if (report.expired.length > 0) {
      console.error(`${report.expired.length} expired token(s)!`);
    }
    if (report.expiringSoon.length > 0) {
      console.warn(`${report.expiringSoon.length} token(s) expiring soon!`);
    }
    
    res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Token health check error:', error);
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
    console.log('🔍 Running scheduled token health monitoring...');
    const report = await checkAllTokenHealth();
    
    // Log summary
    console.log(`Token Health Summary:
      Healthy: ${report.healthy.length}
      Expiring Soon: ${report.expiringSoon.length}
      Expired: ${report.expired.length}
      Unknown: ${report.unknown.length}`);
    
    // expired token summary
    if (report.expired.length > 0) {
      console.error('Expired tokens (!):');
      report.expired.forEach(page => {
        console.error(`   - ${page.pageName} (${page.pageId})`);
      });
    }
    
    // expiring tokens
    if (report.expiringSoon.length > 0) {
      console.warn('Tokens expiring soon (!):');
      report.expiringSoon.forEach(page => {
        console.warn(`   - ${page.pageName} (${page.pageId}): ${page.daysUntilExpiry} days remaining`);
      });
    }
    
    return report;
  } catch (error) {
    console.error('Scheduled token monitoring error:', error);
    throw error;
  }
}

module.exports = {
  checkAllTokenHealth,
  handleTokenHealthCheck,
  handleScheduledTokenMonitoring,
};
