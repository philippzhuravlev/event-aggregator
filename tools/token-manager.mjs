// Token Management Utility for DTUEvent
// Handles Facebook Page Access Token storage, validation, and refresh in Firestore

import { getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

/**
 * Token document structure in Firestore:
 * /admin/tokens/{pageId}
 * {
 *   pageId: string,
 *   token: string,
 *   expiresAt: Timestamp,
 *   lastRefreshed: Timestamp,
 *   status: 'valid' | 'expired' | 'needs_refresh' | 'invalid',
 *   pageName: string,
 *   permissions: string[]
 * }
 */

class TokenManager {
  constructor() {
    // Use existing Firebase app
    const app = getApps().length > 0 ? getApp() : null;
    if (!app) {
      throw new Error('Firebase app not initialized. Initialize Firebase before creating TokenManager.');
    }
    this.db = getFirestore(app);
    this.tokensCollection = this.db.collection('admin').doc('tokens').collection('pages');
  }

  /**
   * Store a new token for a page with enhanced metadata
   */
  async storeToken(pageId, token, pageName = null, expiryDays = 60, debugInfo = null) {
    const now = Timestamp.now();
    const expiresAt = new Date(Date.now() + (expiryDays * 24 * 60 * 60 * 1000));

    const tokenDoc = {
      pageId,
      token,
      expiresAt: Timestamp.fromDate(expiresAt),
      lastRefreshed: now,
      status: 'valid',
      pageName: pageName || `Page ${pageId}`,
      permissions: ['pages_read_engagement', 'pages_show_list'],
      createdAt: now
    };

    // Add Facebook debug info if provided
    if (debugInfo) {
      tokenDoc.facebookMeta = {
        appId: debugInfo.appId,
        appName: debugInfo.appName,
        issuedTimestamp: debugInfo.issued,
        expiresTimestamp: debugInfo.expires,
        dataAccessExpiresTimestamp: debugInfo.dataAccessExpires,
        appScopedUserId: debugInfo.appScopedUserId,
        scopes: debugInfo.scopes || [],
        granularScopes: debugInfo.granularScopes || {},
        origin: debugInfo.origin || 'Web',
        lastDebugCheck: now
      };

      // Use Facebook's actual expiry if provided
      if (debugInfo.expires) {
        tokenDoc.expiresAt = Timestamp.fromDate(new Date(debugInfo.expires * 1000));
        expiresAt = new Date(debugInfo.expires * 1000);
      }
    }

    await this.tokensCollection.doc(pageId).set(tokenDoc);
    console.log(`Token stored for page ${pageId} (expires: ${expiresAt.toISOString()})`);
    return tokenDoc;
  }

  /**
   * Get a valid token for a page, with automatic refresh if needed
   */
  async getValidToken(pageId) {
    const tokenDoc = await this.tokensCollection.doc(pageId).get();
    
    if (!tokenDoc.exists) {
      throw new Error(`No token found for page ${pageId}. Run migration script first.`);
    }

    const tokenData = tokenDoc.data();
    const now = Date.now();
    const expiresAt = tokenData.expiresAt.toDate().getTime();
    const sevenDaysFromNow = now + (7 * 24 * 60 * 60 * 1000);

    // Check if token needs refresh (expires within 7 days)
    if (expiresAt < sevenDaysFromNow) {
      console.log(`Token for page ${pageId} expires soon, attempting refresh...`);
      
      try {
        const refreshedToken = await this.refreshToken(tokenData.token);
        if (refreshedToken) {
          await this.storeToken(pageId, refreshedToken.access_token, tokenData.pageName, 60);
          return refreshedToken.access_token;
        }
      } catch (error) {
        console.warn(`Failed to refresh token for page ${pageId}:`, error.message);
        await this.updateTokenStatus(pageId, 'needs_refresh');
      }
    }

    // Check if token is expired
    if (expiresAt < now) {
      await this.updateTokenStatus(pageId, 'expired');
      throw new Error(`Token for page ${pageId} has expired. Manual refresh required.`);
    }

    return tokenData.token;
  }

  /**
   * Attempt to refresh a Facebook token
   */
  async refreshToken(currentToken) {
    // Note: Facebook token refresh requires app credentials
    // This is a placeholder for the refresh logic
    // In practice, you'd need to implement proper token extension
    
    const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${currentToken}&access_token=${currentToken}`;
    
    try {
      const response = await fetch(debugUrl);
      const data = await response.json();
      
      if (data.data && data.data.is_valid) {
        console.log('Token is still valid, no refresh needed');
        return null; // Token doesn't need refresh
      }
    } catch (error) {
      console.warn('Token validation failed:', error.message);
    }

    // For now, return null - manual refresh required
    // TODO: Implement proper token extension using app credentials
    return null;
  }

  /**
   * Update token status
   */
  async updateTokenStatus(pageId, status) {
    await this.tokensCollection.doc(pageId).update({
      status,
      lastChecked: Timestamp.now()
    });
  }

  /**
   * Get all stored tokens with their status
   */
  async getAllTokens() {
    const snapshot = await this.tokensCollection.get();
    const tokens = [];
    
    snapshot.forEach(doc => {
      tokens.push({
        id: doc.id,
        ...doc.data(),
        expiresAt: doc.data().expiresAt.toDate().toISOString()
      });
    });

    return tokens;
  }

  /**
   * Test token validity by making a test API call
   */
  async testToken(pageId) {
    try {
      const token = await this.getValidToken(pageId);
      const testUrl = `https://graph.facebook.com/v19.0/${pageId}?access_token=${token}`;
      const response = await fetch(testUrl);
      
      if (response.ok) {
        const data = await response.json();
        await this.updateTokenStatus(pageId, 'valid');
        return { valid: true, pageData: data };
      } else {
        const error = await response.text();
        await this.updateTokenStatus(pageId, 'invalid');
        return { valid: false, error };
      }
    } catch (error) {
      await this.updateTokenStatus(pageId, 'invalid');
      return { valid: false, error: error.message };
    }
  }

  /**
   * Enrich an existing token with Facebook debug information
   */
  async enrichTokenWithDebugInfo(pageId, debugInfo) {
    try {
      const doc = await this.tokensCollection.doc(pageId).get();
      if (!doc.exists) {
        throw new Error(`Token for page ${pageId} not found`);
      }

      const updates = {
        facebookMeta: {
          appId: debugInfo.appId,
          appName: debugInfo.appName,
          issuedTimestamp: debugInfo.issued,
          expiresTimestamp: debugInfo.expires,
          dataAccessExpiresTimestamp: debugInfo.dataAccessExpires,
          appScopedUserId: debugInfo.appScopedUserId,
          scopes: debugInfo.scopes || [],
          granularScopes: debugInfo.granularScopes || {},
          origin: debugInfo.origin || 'Web',
          lastDebugCheck: Timestamp.now()
        },
        lastUpdated: Timestamp.now()
      };

      // Update expiry if Facebook provides more accurate data
      if (debugInfo.expires) {
        updates.expiresAt = Timestamp.fromDate(new Date(debugInfo.expires * 1000));
      }

      await this.tokensCollection.doc(pageId).update(updates);
      console.log(`Enhanced token metadata for page ${pageId}`);
      return true;
    } catch (error) {
      console.error(`Failed to enrich token: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Facebook debug information for a token
   */  
  async getTokenDebugInfo(pageId) {
    try {
      const token = await this.getValidToken(pageId);
      const debugUrl = `https://graph.facebook.com/v19.0/debug_token?input_token=${token}&access_token=${token}`;
      
      const response = await fetch(debugUrl);
      if (!response.ok) {
        throw new Error(`Debug API returned ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message);
      }

      return result.data;
    } catch (error) {
      console.error(`Failed to get debug info: ${error.message}`);
      return null;
    }
  }
}

export default TokenManager;