// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as admin from 'firebase-admin';
import { syncAllPageEvents, handleManualSync, handleScheduledSync } from '../../handlers/sync-events';
import * as facebookApi from '../../services/facebook-api';
import * as secretManager from '../../services/secret-manager';
import * as firestoreService from '../../services/firestore-service';
import * as imageService from '../../services/image-service';

// Create a single mockDb that will be reused
const mockDb = {
  collection: jest.fn(() => ({
    where: jest.fn(() => ({
      get: jest.fn(),
    })),
    doc: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
    })),
  })),
  batch: jest.fn(() => ({
    set: jest.fn(),
    commit: jest.fn(),
  })),
};

// Mock all dependencies
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => mockDb),
}));

jest.mock('../../services/facebook-api');
jest.mock('../../services/secret-manager');
jest.mock('../../services/firestore-service');
jest.mock('../../services/image-service');
jest.mock('../../utils/logger');

// Import logger after mocking
import { logger } from '../../utils/logger';

describe('sync-events handler', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncAllPageEvents', () => {
    it('should return zero counts when no active pages exist', async () => {
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([]);

      const result = await syncAllPageEvents();

      expect(result).toEqual({
        syncedPages: 0,
        syncedEvents: 0,
        expiringTokens: 0,
        expiringTokenDetails: [],
      });
      expect(firestoreService.getActivePages).toHaveBeenCalledWith(mockDb);
    });

    it('should sync events for active pages successfully', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page 1', data: {} },
        { id: 'page2', name: 'Test Page 2', data: {} },
      ];
      
      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event 1',
          description: 'Description 1',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
        {
          id: 'event2',
          name: 'Test Event 2',
          start_time: '2025-12-02T20:00:00+0000',
        },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockResolvedValue('https://storage.googleapis.com/image1.jpg');
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(4);

      const result = await syncAllPageEvents();

      expect(result.syncedPages).toBe(2);
      expect(result.syncedEvents).toBe(4);
      expect(result.expiringTokens).toBe(0);
      expect(firestoreService.batchWriteEvents).toHaveBeenCalled();
    });

    it('should track expiring tokens', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expiring Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: true,
        daysUntilExpiry: 3,
        expiresAt: new Date('2025-10-14'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});

      const result = await syncAllPageEvents();

      expect(result.expiringTokens).toBe(1);
      expect(result.expiringTokenDetails).toHaveLength(1);
      expect(result.expiringTokenDetails[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Expiring Page',
        daysUntilExpiry: 3,
      });
    });

    it('should skip pages without access token', async () => {
      const mockPages = [
        { id: 'page1', name: 'No Token Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue(null);
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });

      const result = await syncAllPageEvents();

      expect(result.syncedEvents).toBe(0);
      expect(facebookApi.getAllRelevantEvents).not.toHaveBeenCalled();
    });

    it('should mark token as expired on Facebook 190 error', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expired Token Page', data: {} },
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

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('expired-token');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockRejectedValue(facebookError);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (secretManager.markTokenExpired as jest.Mock).mockResolvedValue(undefined);

      const result = await syncAllPageEvents();

      expect(secretManager.markTokenExpired).toHaveBeenCalledWith(mockDb, 'page1');
      expect(result.syncedEvents).toBe(0);
    });

    it('should use Facebook URL fallback when storage bucket not available', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page', data: {} },
      ];
      
      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockImplementation(() => {
        throw new Error('Storage not available');
      });
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(1);

      const result = await syncAllPageEvents();

      expect(result.syncedEvents).toBe(1);
      expect(imageService.processEventCoverImage).not.toHaveBeenCalled();
    });

    it('should handle image processing failure gracefully', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page', data: {} },
      ];
      
      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockRejectedValue(new Error('Image upload failed'));
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(1 as any);

      const result = await syncAllPageEvents();

      expect(result.syncedEvents).toBe(1);
      expect(firestoreService.batchWriteEvents).toHaveBeenCalled();
    });

    it('should continue syncing other pages if one page fails', async () => {
      const mockPages = [
        { id: 'page1', name: 'Failing Page', data: {} },
        { id: 'page2', name: 'Working Page', data: {} },
      ];

      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
        },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.getPageToken as jest.Mock)
        .mockResolvedValueOnce('mock-token-1')
        .mockResolvedValueOnce('mock-token-2');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (firestoreService.batchWriteEvents as jest.Mock).mockResolvedValue(1);

      const result = await syncAllPageEvents();

      expect(result.syncedPages).toBe(2);
      expect(result.syncedEvents).toBe(1);
    });
  });

  describe('handleManualSync', () => {
    let mockReq: any;
    let mockRes: any;
    let mockAuthMiddleware: jest.Mock;

    beforeEach(() => {
      mockReq = {
        method: 'POST',
        headers: {},
      };
      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };
      mockAuthMiddleware = jest.fn();
    });

    it('should require authentication', async () => {
      mockAuthMiddleware.mockResolvedValue(false);

      await handleManualSync(mockReq, mockRes, mockAuthMiddleware);

      expect(mockAuthMiddleware).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should successfully sync and return results', async () => {
      mockAuthMiddleware.mockResolvedValue(true);
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([]);

      await handleManualSync(mockReq, mockRes, mockAuthMiddleware);

      expect(mockAuthMiddleware).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          syncedPages: 0,
          syncedEvents: 0,
          timestamp: expect.any(String),
        })
      );
    });

    it('should return 500 on sync failure', async () => {
      mockAuthMiddleware.mockResolvedValue(true);
      (firestoreService.getActivePages as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await handleManualSync(mockReq, mockRes, mockAuthMiddleware as any);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Database connection failed',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('handleScheduledSync', () => {
    it('should execute scheduled sync successfully', async () => {
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([
        { id: 'page1', name: 'Test Page', data: { active: true } },
      ]);
      (secretManager.getPageToken as jest.Mock).mockResolvedValue('token123');
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date(),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([
        {
          id: 'event1',
          name: 'Event 1',
          start_time: '2025-01-01T10:00:00Z',
        },
      ]);

      await handleScheduledSync();

      expect(logger.info).toHaveBeenCalledWith('Scheduled sync started');
      expect(logger.info).toHaveBeenCalledWith('Scheduled sync completed', expect.any(Object));
    });

    it('should handle errors in scheduled sync gracefully', async () => {
      (firestoreService.getActivePages as jest.Mock).mockRejectedValue(new Error('Database error'));

      await handleScheduledSync();

      expect(logger.error).toHaveBeenCalledWith('Scheduled sync failed', expect.any(Error));
    });
  });
});

