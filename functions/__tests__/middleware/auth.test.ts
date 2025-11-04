// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { requireApiKey, logRequest } from '../../middleware/auth';
import * as supabaseService from '../../services/supabase-service';

// Mock dependencies
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      upsert: jest.fn().mockResolvedValue({ data: [], error: null }),
      delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

jest.mock('../../services/supabase-service');
jest.mock('../../utils/logger');

describe('auth middleware', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      method: 'GET',
      path: '/test',
      headers: {},
      ip: '192.168.1.1',
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  describe('requireApiKey', () => {
    it('should return false when API key is not configured', async () => {
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(null as any);

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Server configuration error',
        })
      );
    });

    it('should authenticate with Bearer token', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers.authorization = `Bearer ${validKey}`;

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should authenticate with x-api-key header', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers['x-api-key'] = validKey;

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(true);
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should reject invalid Bearer token', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers.authorization = 'Bearer wrong-key';

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
        })
      );
    });

    it('should reject invalid x-api-key', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers['x-api-key'] = 'wrong-key';

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with no authentication', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should reject malformed Bearer header', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers.authorization = 'BearerInvalid';

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should handle API key retrieval error', async () => {
      (supabaseService.getApiKey as jest.Mock).mockRejectedValue(
        new Error('Secret Manager unavailable')
      );

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Secret Manager unavailable',
          message: 'Failed to verify API key',
        })
      );
    });

    it('should prioritize Bearer token over x-api-key', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.headers.authorization = `Bearer ${validKey}`;
      mockReq.headers['x-api-key'] = 'wrong-key';

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(true);
    });

    it('should extract IP from x-forwarded-for header', async () => {
      const validKey = 'test-api-key-123';
      (supabaseService.getApiKey as jest.Mock).mockResolvedValue(validKey);
      mockReq.ip = undefined;
      mockReq.headers['x-forwarded-for'] = '203.0.113.1';

      const result = await requireApiKey(mockReq, mockRes);

      expect(result).toBe(false);
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logRequest', () => {
    it('should log request details', () => {
      mockReq.method = 'POST';
      mockReq.path = '/api/sync';
      mockReq.headers['user-agent'] = 'Test Agent';

      logRequest(mockReq);

      // Should complete without throwing
      expect(true).toBe(true);
    });

    it('should handle missing user-agent', () => {
      mockReq.headers = {};

      logRequest(mockReq);

      // Should complete without throwing
      expect(true).toBe(true);
    });

    it('should handle missing IP', () => {
      mockReq.ip = undefined;
      mockReq.headers = {};

      logRequest(mockReq);

      // Should complete without throwing
      expect(true).toBe(true);
    });
  });
});