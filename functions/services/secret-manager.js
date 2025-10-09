const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { logger } = require('../utils/logger');
const secretClient = new SecretManagerServiceClient();

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// Services should not be confused with "handlers" that do business logic

/**
 * Store a Facebook page access token in Google Secret Manager
 * Also stores metadata about token expiry in Firestore for monitoring
 * @param {string} pageId - Facebook page ID
 * @param {string} accessToken - Facebook page access token
 * @param {Object} options - Additional options
 * @param {admin.firestore.Firestore} options.db - Firestore instance (optional, for metadata)
 * @param {number} options.expiresInDays - Token validity period in days (default: 60)
 * @returns {Promise<void>}
 */
async function storePageToken(pageId, accessToken, options = {}) {
  const { db = null, expiresInDays = 60 } = options;
  const projectId = process.env.GCLOUD_PROJECT; // i.e. stored in .env
  const secretName = `facebook-token-${pageId}`; 
  // before we called our secret facebook-[pageId] but that was ambiguous.
  // We're talking bout __tokens__ here

  try {
    // create the secret (if it doesn't exist)
    await secretClient.createSecret({
      parent: `projects/${projectId}`,
      secretId: secretName,
      secret: {
        replication: { automatic: {} },
      },
    });
    logger.debug('Created new secret for page token', { secretName, pageId });
  } catch (error) {
    // if we failed to create the secret, it might not be because it's
    // __actually__ an error, but because it might already exist
    if (!error.message.includes('already exists')) {
      // If it's a real error (not "already exists"), we should fail fast
      // rather than trying to add a version to a potentially non-existent secret
      logger.error('Failed to create secret', error, { secretName, pageId });
      throw new Error(`Cannot store token: Secret creation failed for ${secretName}`);
    }
    // If it already exists, that's fine - we'll add a new version below
  }
  
  // secret version actually contains the data, kind of like firestore's 
  // snapshot object or http req/res objects. Here, it has a payload
  await secretClient.addSecretVersion({
    parent: `projects/${projectId}/secrets/${secretName}`,
    payload: {
      data: Buffer.from(accessToken),
      // buffer is just a temp data storage, esp in networks
    },
  });
  
  logger.info('Stored token for page in Secret Manager', { pageId });

  // Store token metadata in Firestore for expiry tracking
  if (db) {
    // Import at top-level to avoid re-initialization issues
    const { Timestamp } = require('@google-cloud/firestore');
    
    const now = Timestamp.now();
    const expiresAt = new Date(now.toDate().getTime() + expiresInDays * 24 * 60 * 60 * 1000);
    
    await db.collection('pages').doc(pageId).set({
      tokenStoredAt: now,
      tokenExpiresAt: Timestamp.fromDate(expiresAt),
      tokenExpiresInDays: expiresInDays,
      tokenStatus: 'valid',
    }, { merge: true });
    
    logger.info('Stored token metadata in Firestore', {
      pageId,
      expiresAt: expiresAt.toISOString(),
      expiresInDays,
    });
  }
}

/**
 * Retrieve a Facebook page access token from Google Secret Manager
 * @param {string} pageId - Facebook page ID
 * @returns {Promise<string|null>} The access token or null if not found
 */
async function getPageToken(pageId) {
  // largely the same as the above create page token method, tho
  // a getter instead of a setter
  const projectId = process.env.GCLOUD_PROJECT;
  const secretName = `facebook-token-${pageId}`;
  
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });
    return version.payload.data.toString();
  } catch (error) {
    logger.warn('Failed to retrieve token from Secret Manager', {
      pageId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Get the API key for authenticating manual sync requests
 * @returns {Promise<string|null>} The API key or null if not found
 */
async function getApiKey() {
  const projectId = process.env.GCLOUD_PROJECT;
  const secretName = 'API_SYNC_KEY';
  
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });
    return version.payload.data.toString();
  } catch (error) {
    logger.error('Failed to retrieve API key from Secret Manager', error);
    return null;
  }
}

/**
 * Check if a page's token is expiring soon and needs refresh
 * @param {admin.firestore.Firestore} db - Firestore instance
 * @param {string} pageId - Facebook page ID
 * @param {number} warningDays - Days before expiry to start warning (default: 7)
 * @returns {Promise<{isExpiring: boolean, daysUntilExpiry: number, expiresAt: Date}>}
 */
async function checkTokenExpiry(db, pageId, warningDays = 7) {
  const pageDoc = await db.collection('pages').doc(pageId).get();
  
  if (!pageDoc.exists || !pageDoc.data().tokenExpiresAt) {
    return { isExpiring: true, daysUntilExpiry: 0, expiresAt: null };
  }
  
  const expiresAt = pageDoc.data().tokenExpiresAt.toDate();
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
  
  return {
    isExpiring: daysUntilExpiry <= warningDays,
    daysUntilExpiry,
    expiresAt,
  };
}

/**
 * Mark a page's token as expired in Firestore
 * @param {admin.firestore.Firestore} db - Firestore instance
 * @param {string} pageId - Facebook page ID
 * @returns {Promise<void>}
 */
async function markTokenExpired(db, pageId) {
  const { FieldValue } = require('@google-cloud/firestore');
  await db.collection('pages').doc(pageId).set({
    tokenStatus: 'expired',
    tokenExpiredAt: FieldValue.serverTimestamp(),
    active: false,
  }, { merge: true });
  
  logger.warn('Marked token as expired in Firestore', { pageId });
}

module.exports = {
  storePageToken,
  getPageToken,
  getApiKey,
  checkTokenExpiry,
  markTokenExpired,
};
