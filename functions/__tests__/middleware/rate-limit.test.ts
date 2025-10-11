// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RATE_LIMITS } from '../../utils/constants';

// Mock logger before importing rate-limit
jest.mock('../../utils/logger');

// Mock express-rate-limit to test configuration
const mockRateLimitConfigs: any[] = [];
const mockRateLimitFactory = jest.fn((config) => {
  mockRateLimitConfigs.push(config);
  return jest.fn(); // Return a mock middleware function
});

jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: mockRateLimitFactory,
}));

// Import to trigger configuration capture
import '../../middleware/rate-limit';

describe('rate-limit middleware', () => {
  let standardConfig: any;
  let webhookConfig: any;
  let oauthConfig: any;
  
  beforeEach(() => {
    // Capture all three configs from the module initialization
    standardConfig = mockRateLimitConfigs[0];
    webhookConfig = mockRateLimitConfigs[1];
    oauthConfig = mockRateLimitConfigs[2];
  });

  describe('standardRateLimiter', () => {

    it('should configure correct window and max requests', () => {
      expect(standardConfig.windowMs).toBe(RATE_LIMITS.STANDARD.WINDOW_MS);
      expect(standardConfig.max).toBe(RATE_LIMITS.STANDARD.MAX_REQUESTS);
    });

    it('should have correct message configuration', () => {
      expect(standardConfig.message).toEqual({
        error: 'Too many requests',
        message: expect.stringContaining('Rate limit exceeded'),
        retryAfter: RATE_LIMITS.STANDARD.WINDOW_MS / 1000,
      });
    });

    it('should enable standard headers and disable legacy headers', () => {
      expect(standardConfig.standardHeaders).toBe(true);
      expect(standardConfig.legacyHeaders).toBe(false);
    });

    // keyGenerator tests removed - using default IPv6-safe generator
    // The default keyGenerator from express-rate-limit properly handles IPv6

    it('should handle rate limit exceeded with proper response', () => {
      const mockReq = {
        ip: '192.168.1.1',
        path: '/api/sync',
        headers: {
          'user-agent': 'Test Agent',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      standardConfig.handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        message: expect.stringContaining('Rate limit exceeded'),
        retryAfter: RATE_LIMITS.STANDARD.WINDOW_MS / 1000,
      });
    });

    it('should log rate limit exceeded event', () => {
      const { logger } = require('../../utils/logger');
      
      const mockReq = {
        ip: '192.168.1.1',
        path: '/api/sync',
        headers: {
          'user-agent': 'Test Agent',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      standardConfig.handler(mockReq, mockRes);

      expect(logger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          ip: '192.168.1.1',
          path: '/api/sync',
          userAgent: 'Test Agent',
        })
      );
    });
  });

  describe('webhookRateLimiter', () => {
    it('should configure correct window and max requests for webhooks', () => {
      expect(webhookConfig.windowMs).toBe(RATE_LIMITS.WEBHOOK.WINDOW_MS);
      expect(webhookConfig.max).toBe(RATE_LIMITS.WEBHOOK.MAX_REQUESTS);
    });

    it('should have webhook-specific message', () => {
      expect(webhookConfig.message).toEqual({
        error: 'Webhook rate limit exceeded',
        message: expect.stringContaining('webhook'),
      });
    });

    // keyGenerator test removed - using default IPv6-safe generator

    it('should log critical error when webhook rate limit exceeded', () => {
      const { logger } = require('../../utils/logger');
      
      const mockReq = {
        ip: '192.168.1.1',
        path: '/webhooks/facebook',
        headers: {
          'user-agent': 'Facebook Bot',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      webhookConfig.handler(mockReq, mockRes);

      expect(logger.critical).toHaveBeenCalledWith(
        'Webhook rate limit exceeded - possible attack',
        expect.any(Error),
        expect.objectContaining({
          ip: '192.168.1.1',
          path: '/webhooks/facebook',
        })
      );
    });

    it('should return 429 status when webhook rate limit exceeded', () => {
      const mockReq = {
        ip: '192.168.1.1',
        path: '/webhooks/facebook',
        headers: {},
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      webhookConfig.handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Webhook rate limit exceeded',
        message: 'Too many requests',
      });
    });
  });

  describe('oauthRateLimiter', () => {
    it('should configure strict limits for OAuth', () => {
      expect(oauthConfig.windowMs).toBe(RATE_LIMITS.OAUTH.WINDOW_MS);
      expect(oauthConfig.max).toBe(RATE_LIMITS.OAUTH.MAX_REQUESTS);
    });

    it('should have OAuth-specific message', () => {
      expect(oauthConfig.message).toEqual({
        error: 'OAuth rate limit exceeded',
        message: expect.stringContaining('OAuth'),
      });
    });

    // keyGenerator test removed - using default IPv6-safe generator

    it('should log OAuth rate limit with state parameter', () => {
      const { logger } = require('../../utils/logger');
      
      const mockReq = {
        ip: '192.168.1.1',
        path: '/auth/callback',
        headers: {
          'user-agent': 'Browser',
        },
        query: {
          state: 'some-state-token',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      oauthConfig.handler(mockReq, mockRes);

      expect(logger.warn).toHaveBeenCalledWith(
        'OAuth rate limit exceeded',
        expect.objectContaining({
          ip: '192.168.1.1',
          path: '/auth/callback',
          state: 'some-state-token',
        })
      );
    });

    it('should return user-friendly OAuth rate limit message', () => {
      const mockReq = {
        ip: '192.168.1.1',
        path: '/auth/callback',
        headers: {},
        query: {},
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      oauthConfig.handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'OAuth rate limit exceeded',
        message: 'Too many authentication attempts. Please try again later.',
      });
    });
  });
});

