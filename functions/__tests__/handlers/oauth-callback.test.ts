// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleOAuthCallback } from '../../handlers/oauth-callback';
import * as facebookApi from '../../services/facebook-api';
import * as secretManager from '../../services/secret-manager';
import * as firestoreService from '../../services/firestore-service';
import * as imageService from '../../services/image-service';

// Mock dependencies
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
      })),
    })),
  })),
}));

jest.mock('../../services/facebook-api');
jest.mock('../../services/secret-manager');
jest.mock('../../services/firestore-service');
jest.mock('../../services/image-service');
jest.mock('../../utils/logger');

describe('oauth-callback handler', () => {
  let mockReq: any;
  let mockRes: any;
  const mockAppId = 'test-app-id';
  const mockAppSecret = 'test-app-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
      headers: {},
      method: 'GET',
    };
    mockRes = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('handleOAuthCallback', () => {
    it('should redirect to error page when Facebook returns an error', async () => {
      mockReq.query = {
        error: 'access_denied',
      };

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=oauth_failed')
      );
    });

    it('should redirect to error page when authorization code is missing', async () => {
      mockReq.query = {};

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=missing_code')
      );
    });

    it('should redirect to error page when no pages are found', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue([]);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=no_pages')
      );
    });

    it('should successfully complete OAuth flow and store tokens', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page 1', access_token: 'page-token-1' },
        { id: 'page2', name: 'Test Page 2', access_token: 'page-token-2' },
      ];

      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockResolvedValue(
        'https://storage.googleapis.com/image1.jpg'
      );
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(2);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(facebookApi.exchangeCodeForToken).toHaveBeenCalledWith(
        'valid-auth-code',
        mockAppId,
        mockAppSecret,
        expect.any(String)
      );
      expect(facebookApi.exchangeForLongLivedToken).toHaveBeenCalledWith(
        'short-lived-token',
        mockAppId,
        mockAppSecret
      );
      expect(facebookApi.getUserPages).toHaveBeenCalledWith('long-lived-token');
      expect(secretManager.storePageToken).toHaveBeenCalledTimes(2);
      expect(firestoreService.savePage).toHaveBeenCalledTimes(2);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true')
      );
    });

    it('should use state parameter for redirect URL', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
        state: encodeURIComponent('http://localhost:5173'),
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page 1', access_token: 'page-token-1' },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(0);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:5173')
      );
    });

    it('should accept a signed state parameter when signature is valid', async () => {
      // build signed state: <encodedOrigin>|<hmac>
      const origin = 'http://localhost:5173';
      const encoded = encodeURIComponent(origin);
      // compute expected HMAC using same algorithm as util
      const crypto = require('crypto');
      const sig = crypto.createHmac('sha256', mockAppSecret).update(origin).digest('hex');
      mockReq.query = {
        code: 'valid-auth-code',
        state: `${encoded}|${sig}`,
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page 1', access_token: 'page-token-1' },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(0);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:5173')
      );
    });

    it('should reject a signed state parameter when signature is invalid', async () => {
      const origin = 'http://localhost:5173';
      const encoded = encodeURIComponent(origin);
      // tampered signature
      const sig = '00deadbeef';
      mockReq.query = {
        code: 'valid-auth-code',
        state: `${encoded}|${sig}`,
      };

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=invalid_state')
      );
    });

    it('should fallback to referer header when state is not provided', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };
      mockReq.headers.referer = 'http://localhost:5173/connect';

      const mockPages = [
        { id: 'page1', name: 'Test Page', access_token: 'page-token-1' },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(0);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:5173')
      );
    });

    it('should handle token expiry during event fetch', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page', access_token: 'page-token-1' },
      ];

      const facebookError = {
        response: {
          data: {
            error: {
              code: 190,
              message: 'Token is expired',
            },
          },
        },
      };

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('expired-token');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockRejectedValue(facebookError);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(firestoreService.savePage).toHaveBeenCalledWith(
        expect.anything(),
        'page1',
        { active: false }
      );
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true&pages=1&events=0')
      );
    });

    it('should continue with other pages when token retrieval fails', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      const mockPages = [
        { id: 'page1', name: 'Failing Page', access_token: 'page-token-1' },
        { id: 'page2', name: 'Working Page', access_token: 'page-token-2' },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('page-token-2');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(0);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(facebookApi.getAllRelevantEvents).toHaveBeenCalledTimes(1);
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true')
      );
    });

    it('should use Facebook URLs when storage bucket is not available', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page', access_token: 'page-token-1' },
      ];

      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockImplementation(() => {
        throw new Error('Storage not available');
      });
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(1);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(imageService.processEventCoverImage).not.toHaveBeenCalled();
      expect(firestoreService.batchWriteEvents).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true')
      );
    });

    it('should handle image processing failure gracefully', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      const mockPages = [
        { id: 'page1', name: 'Test Page', access_token: 'page-token-1' },
      ];

      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (facebookApi.exchangeCodeForToken as jest.Mock).mockResolvedValue('short-lived-token');
      (facebookApi.exchangeForLongLivedToken as jest.Mock).mockResolvedValue('long-lived-token');
      (facebookApi.getUserPages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.storePageToken as jest.Mock).mockResolvedValue(undefined);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('page-token-1');
      (firestoreService.savePage as jest.Mock).mockResolvedValue(undefined);
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockRejectedValue(
        new Error('Image upload failed')
      );
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(1 as any);

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(firestoreService.batchWriteEvents).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true')
      );
    });

    it('should redirect to error page on unexpected failure', async () => {
      mockReq.query = {
        code: 'valid-auth-code',
      };

      (facebookApi.exchangeCodeForToken as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await handleOAuthCallback(mockReq, mockRes, mockAppId, mockAppSecret);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=callback_failed')
      );
    });
  });
});