// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  checkAllTokenHealth,
  handleTokenHealthCheck,
  handleScheduledTokenMonitoring,
} from '../../handlers/token-monitor';
import * as secretManager from '../../services/secret-manager';
import * as firestoreService from '../../services/firestore-service';

// Mock dependencies
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({})),
}));

jest.mock('../../services/secret-manager');
jest.mock('../../services/firestore-service');
jest.mock('../../utils/logger');

describe('token-monitor handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAllTokenHealth', () => {
    it('should return empty report when no pages exist', async () => {
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([]);

      const report = await checkAllTokenHealth();

      expect(report).toEqual({
        totalPages: 0,
        healthy: [],
        expiringSoon: [],
        expired: [],
        unknown: [],
        timestamp: expect.any(String),
      });
    });

    it('should categorize healthy tokens correctly', async () => {
      const mockPages = [
        { id: 'page1', name: 'Healthy Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 30,
        expiresAt: new Date('2025-11-10'),
      });

      const report = await checkAllTokenHealth();

      expect(report.totalPages).toBe(1);
      expect(report.healthy).toHaveLength(1);
      expect(report.healthy[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Healthy Page',
        daysUntilExpiry: 30,
      });
      expect(report.expiringSoon).toHaveLength(0);
      expect(report.expired).toHaveLength(0);
    });

    it('should categorize expiring tokens correctly', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expiring Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: true,
        daysUntilExpiry: 5,
        expiresAt: new Date('2025-10-16'),
      });

      const report = await checkAllTokenHealth();

      expect(report.expiringSoon).toHaveLength(1);
      expect(report.expiringSoon[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Expiring Page',
        daysUntilExpiry: 5,
      });
    });

    it('should categorize expired tokens correctly', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expired Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: true,
        daysUntilExpiry: -5,
        expiresAt: new Date('2025-10-06'),
      });

      const report = await checkAllTokenHealth();

      expect(report.expired).toHaveLength(1);
      expect(report.expired[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Expired Page',
        daysUntilExpiry: -5,
      });
    });

    it('should categorize unknown tokens correctly', async () => {
      const mockPages = [
        { id: 'page1', name: 'Unknown Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock).mockResolvedValue({
        isExpiring: false,
        daysUntilExpiry: 0,
        expiresAt: null,
      });

      const report = await checkAllTokenHealth();

      expect(report.unknown).toHaveLength(1);
      expect(report.unknown[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Unknown Page',
      });
    });

    it('should handle token check errors gracefully', async () => {
      const mockPages = [
        { id: 'page1', name: 'Error Page', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock).mockRejectedValue(
        new Error('Secret Manager unavailable')
      );

      const report = await checkAllTokenHealth();

      expect(report.unknown).toHaveLength(1);
      expect(report.unknown[0]).toMatchObject({
        pageId: 'page1',
        pageName: 'Error Page',
        error: 'Secret Manager unavailable',
      });
    });

    it('should sort expiring tokens by days until expiry', async () => {
      const mockPages = [
        { id: 'page1', name: 'Expires in 6 days', data: {} },
        { id: 'page2', name: 'Expires in 2 days', data: {} },
        { id: 'page3', name: 'Expires in 4 days', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock)
        .mockResolvedValueOnce({
          isExpiring: true,
          daysUntilExpiry: 6,
          expiresAt: new Date('2025-10-17'),
        })
        .mockResolvedValueOnce({
          isExpiring: true,
          daysUntilExpiry: 2,
          expiresAt: new Date('2025-10-13'),
        })
        .mockResolvedValueOnce({
          isExpiring: true,
          daysUntilExpiry: 4,
          expiresAt: new Date('2025-10-15'),
        });

      const report = await checkAllTokenHealth();

      expect(report.expiringSoon).toHaveLength(3);
      expect(report.expiringSoon[0].daysUntilExpiry).toBe(2);
      expect(report.expiringSoon[1].daysUntilExpiry).toBe(4);
      expect(report.expiringSoon[2].daysUntilExpiry).toBe(6);
    });

    it('should handle mixed token states', async () => {
      const mockPages = [
        { id: 'page1', name: 'Healthy', data: {} },
        { id: 'page2', name: 'Expiring', data: {} },
        { id: 'page3', name: 'Expired', data: {} },
        { id: 'page4', name: 'Unknown', data: {} },
      ];

      (firestoreService.getActivePages as jest.Mock).mockResolvedValue(mockPages);
      (secretManager.checkTokenExpiry as jest.Mock)
        .mockResolvedValueOnce({
          isExpiring: false,
          daysUntilExpiry: 30,
          expiresAt: new Date('2025-11-10'),
        })
        .mockResolvedValueOnce({
          isExpiring: true,
          daysUntilExpiry: 5,
          expiresAt: new Date('2025-10-16'),
        })
        .mockResolvedValueOnce({
          isExpiring: true,
          daysUntilExpiry: -3,
          expiresAt: new Date('2025-10-08'),
        })
        .mockResolvedValueOnce({
          isExpiring: false,
          daysUntilExpiry: 0,
          expiresAt: null,
        });

      const report = await checkAllTokenHealth();

      expect(report.totalPages).toBe(4);
      expect(report.healthy).toHaveLength(1);
      expect(report.expiringSoon).toHaveLength(1);
      expect(report.expired).toHaveLength(1);
      expect(report.unknown).toHaveLength(1);
    });
  });

  describe('handleTokenHealthCheck', () => {
    let mockReq: any;
    let mockRes: any;
    let mockAuthMiddleware: jest.Mock;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
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

      await handleTokenHealthCheck(mockReq, mockRes, mockAuthMiddleware);

      expect(mockAuthMiddleware).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should return health report on success', async () => {
      mockAuthMiddleware.mockResolvedValue(true);
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([]);

      await handleTokenHealthCheck(mockReq, mockRes, mockAuthMiddleware);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        report: expect.objectContaining({
          totalPages: 0,
          healthy: [],
          expiringSoon: [],
          expired: [],
          unknown: [],
          timestamp: expect.any(String),
        }),
      });
    });

    it('should return 500 on error', async () => {
      mockAuthMiddleware.mockResolvedValue(true);
      (firestoreService.getActivePages as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await handleTokenHealthCheck(mockReq, mockRes, mockAuthMiddleware);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error',
      });
    });
  });

  describe('handleScheduledTokenMonitoring', () => {
    it('should run successfully and return report', async () => {
      (firestoreService.getActivePages as jest.Mock).mockResolvedValue([]);

      const report = await handleScheduledTokenMonitoring();

      expect(report).toMatchObject({
        totalPages: 0,
        healthy: [],
        expiringSoon: [],
        expired: [],
        unknown: [],
        timestamp: expect.any(String),
      });
    });

    it('should throw error on failure', async () => {
      (firestoreService.getActivePages as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      await expect(handleScheduledTokenMonitoring()).rejects.toThrow('Service unavailable');
    });
  });
});

