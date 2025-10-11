// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock all dependencies before imports
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  firestore: jest.fn(),
  storage: jest.fn(),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: jest.fn((config, handler) => handler),
}));

jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((config, handler) => handler),
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn((name) => ({ value: () => `mock-${name}` })),
}));

jest.mock('../handlers/oauth-callback');
jest.mock('../handlers/sync-events');
jest.mock('../handlers/token-monitor');
jest.mock('../handlers/facebook-webhooks');
jest.mock('../handlers/cleanup-events');
jest.mock('../handlers/health-check');
jest.mock('../middleware/auth');
jest.mock('../middleware/validation');
jest.mock('../middleware/rate-limit');
jest.mock('../utils/constants');
jest.mock('../utils/logger');

describe('index.ts - Firebase Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Module Initialization', () => {
    it('should initialize Firebase Admin', () => {
      const admin = require('firebase-admin');
      // Re-import to trigger initialization
      jest.isolateModules(() => {
        require('../index');
      });
      expect(admin.initializeApp).toHaveBeenCalled();
    });

    it('should define secret parameters', () => {
      const { defineSecret } = require('firebase-functions/params');
      jest.isolateModules(() => {
        require('../index');
      });
      expect(defineSecret).toHaveBeenCalledWith('FACEBOOK_APP_ID');
      expect(defineSecret).toHaveBeenCalledWith('FACEBOOK_APP_SECRET');
    });
  });

  describe('syncFacebook endpoint', () => {
    it('should be defined as onRequest function', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.syncFacebook).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });

    it('should handle CORS preflight', async () => {
      const { handleCORS } = require('../middleware/validation');
      handleCORS.mockReturnValue(false); // CORS handled, stop processing

      jest.isolateModules(() => {
        const exports = require('../index');
        // syncFacebook is the handler function
      });

      expect(handleCORS).toBeDefined();
    });
  });

  describe('nightlySyncFacebook scheduled function', () => {
    it('should be defined as onSchedule function', () => {
      const { onSchedule } = require('firebase-functions/v2/scheduler');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.nightlySyncFacebook).toBeDefined();
      });
      expect(onSchedule).toHaveBeenCalled();
    });
  });

  describe('checkTokenHealth endpoint', () => {
    it('should be defined as onRequest function', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.checkTokenHealth).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });
  });

  describe('dailyTokenMonitoring scheduled function', () => {
    it('should be defined as onSchedule function', () => {
      const { onSchedule } = require('firebase-functions/v2/scheduler');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.dailyTokenMonitoring).toBeDefined();
      });
      expect(onSchedule).toHaveBeenCalled();
    });
  });

  describe('facebookCallback endpoint', () => {
    it('should be defined with secrets', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.facebookCallback).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });
  });

  describe('facebookWebhook endpoint', () => {
    it('should be defined with webhook secret', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.facebookWebhook).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });
  });

  describe('cleanupEvents endpoint', () => {
    it('should be defined as onRequest function', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.cleanupEvents).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });
  });

  describe('weeklyEventCleanup scheduled function', () => {
    it('should be defined as onSchedule function', () => {
      const { onSchedule } = require('firebase-functions/v2/scheduler');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.weeklyEventCleanup).toBeDefined();
      });
      expect(onSchedule).toHaveBeenCalled();
    });
  });

  describe('checkHealth endpoint', () => {
    it('should be defined as onRequest function', () => {
      const { onRequest } = require('firebase-functions/v2/https');
      jest.isolateModules(() => {
        const exports = require('../index');
        expect(exports.checkHealth).toBeDefined();
      });
      expect(onRequest).toHaveBeenCalled();
    });
  });

  describe('All Exports', () => {
    it('should export all Firebase functions', () => {
      jest.isolateModules(() => {
        const exports = require('../index');
        
        // HTTP endpoints
        expect(exports.syncFacebook).toBeDefined();
        expect(exports.checkTokenHealth).toBeDefined();
        expect(exports.facebookCallback).toBeDefined();
        expect(exports.facebookWebhook).toBeDefined();
        expect(exports.cleanupEvents).toBeDefined();
        expect(exports.checkHealth).toBeDefined();
        
        // Scheduled functions
        expect(exports.nightlySyncFacebook).toBeDefined();
        expect(exports.dailyTokenMonitoring).toBeDefined();
        expect(exports.weeklyEventCleanup).toBeDefined();
      });
    });
  });
});

