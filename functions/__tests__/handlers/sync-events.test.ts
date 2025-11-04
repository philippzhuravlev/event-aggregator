// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { syncAllPageEvents, handleManualSync, handleScheduledSync } from '../../handlers/sync-events';
import * as facebookApi from '../../services/facebook-api';
import * as supabaseService from '../../services/supabase-service';
import * as imageService from '../../services/image-service';

// Mock all dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      upsert: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

jest.mock('../../services/facebook-api');
jest.mock('../../services/supabase-service');
jest.mock('../../services/image-service');
jest.mock('../../utils/logger');

// Import logger after mocking
import { logger } from '../../utils/logger';

describe('sync-events handler', () => {
  let supabase: any;

  beforeEach(() => {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient();
    jest.clearAllMocks();
  });

  describe('syncAllPageEvents', () => {
    it('should return zero counts when no active pages exist', async () => {
      (supabaseService.getActivePages as jest.Mock).mockResolvedValue([]);

      const result = await syncAllPageEvents(supabase);

      expect(result).toEqual({
        syncedPages: 0,
        syncedEvents: 0,
        expiringTokens: 0,
        expiringTokenDetails: [],
      });
    });

    it('should sync events for active pages successfully', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page 1' },
        { id: 'page2', name: 'Test Page 2' },
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

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockResolvedValue('https://storage.supabase.com/image1.jpg');

      const result = await syncAllPageEvents(supabase);

      expect(result.syncedPages).toBe(2);
      expect(result.syncedEvents).toBe(4);
      expect(result.expiringTokens).toBe(0);
      expect(supabaseService.batchWriteEvents).toHaveBeenCalled();
    });

    it('should track expiring tokens', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expiring Page' },
      ];

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: true,
        daysUntilExpiry: 3,
        expiresAt: new Date('2025-10-14'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue([]);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});

      const result = await syncAllPageEvents(supabase);

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
        { id: 'page1', name: 'No Token Page' },
      ];

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue(null);
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });

      const result = await syncAllPageEvents(supabase);

      expect(result.syncedEvents).toBe(0);
      expect(facebookApi.getAllRelevantEvents).not.toHaveBeenCalled();
    });

    it('should mark token as expired on Facebook 190 error', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expired Token Page' },
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

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('expired-token');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockRejectedValue(facebookError);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (supabaseService.markTokenExpired as jest.Mock).mockResolvedValue(undefined);

      const result = await syncAllPageEvents(supabase);

      expect(supabaseService.markTokenExpired).toHaveBeenCalledWith(supabase, 'page1');
      expect(result.syncedEvents).toBe(0);
    });

    it('should use Facebook URL fallback when storage bucket not available', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page' },
      ];
      
      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockImplementation(() => {
        throw new Error('Storage not available');
      });

      const result = await syncAllPageEvents(supabase);

      expect(result.syncedEvents).toBe(1);
      expect(imageService.processEventCoverImage).not.toHaveBeenCalled();
    });

    it('should handle image processing failure gracefully', async () => {
      const mockPages = [
        { id: 'page1', name: 'Test Page' },
      ];
      
      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
          cover: { source: 'https://facebook.com/image1.jpg' },
        },
      ];

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('mock-token');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock).mockResolvedValue(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});
      (imageService.processEventCoverImage as jest.Mock).mockRejectedValue(new Error('Image upload failed'));

      const result = await syncAllPageEvents(supabase);

      expect(result.syncedEvents).toBe(1);
      expect(supabaseService.batchWriteEvents).toHaveBeenCalled();
    });

    it('should continue syncing other pages if one page fails', async () => {
      const mockPages = [
        { id: 'page1', name: 'Failing Page' },
        { id: 'page2', name: 'Working Page' },
      ];

      const mockEvents = [
        {
          id: 'event1',
          name: 'Test Event',
          start_time: '2025-12-01T20:00:00+0000',
        },
      ];

      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock)
        .mockResolvedValueOnce('mock-token-1')
        .mockResolvedValueOnce('mock-token-2');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });
      (facebookApi.getAllRelevantEvents as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockEvents);
      (imageService.initializeStorageBucket as jest.Mock).mockReturnValue({});

      const result = await syncAllPageEvents(supabase);

      expect(result.syncedPages).toBe(2);
      expect(result.syncedEvents).toBe(1);
    });
  });

  describe('handleManualSync', () => {
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      mockReq = {
        method: 'POST',
        headers: {},
        supabase: supabase,
      };
      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };
    });

    it('should successfully sync and return results', async () => {
      (supabaseService.getActivePages as jest.Mock).mockResolvedValue([]);

      await handleManualSync(mockReq, mockRes);

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
      (supabaseService.getActivePages as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      await handleManualSync(mockReq, mockRes);

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
      const mockPages = [
        { id: 'page1', name: 'Test Page' },
      ];
      (supabaseService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (supabaseService.getPageToken as jest.Mock).mockResolvedValue('token123');
      (supabaseService.checkTokenExpiry as jest.Mock).mockResolvedValue({
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

      await handleScheduledSync(supabase);

      expect(logger.info).toHaveBeenCalledWith('Scheduled sync started');
      expect(logger.info).toHaveBeenCalledWith('Scheduled sync completed', expect.any(Object));
    });

    it('should handle errors in scheduled sync gracefully', async () => {
      (supabaseService.getActivePages as jest.Mock).mockRejectedValue(new Error('Database error'));

      await handleScheduledSync(supabase);

      expect(logger.error).toHaveBeenCalledWith('Scheduled sync failed', expect.any(Error));
    });
  });
});