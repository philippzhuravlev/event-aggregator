// @ts-nocheck
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock ErrorReporting before importing logger
const mockReport = jest.fn();
jest.mock('@google-cloud/error-reporting', () => ({
  ErrorReporting: jest.fn().mockImplementation(() => ({
    report: mockReport,
  })),
}));

describe('logger utility', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;
  let originalEnv: any;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    
    // Clear mock
    mockReport.mockClear();
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
    
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('info', () => {
    it('should log info messages with severity INFO', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('Test info message');
      
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('INFO');
      expect(loggedData.message).toBe('Test info message');
      expect(loggedData.timestamp).toBeDefined();
    });

    it('should include metadata in info logs', () => {
      const { logger } = require('../../utils/logger');
      
      logger.info('Test with metadata', { userId: '123', action: 'login' });
      
      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.userId).toBe('123');
      expect(loggedData.action).toBe('login');
    });
  });

  describe('warn', () => {
    it('should log warning messages with severity WARNING', () => {
      const { logger } = require('../../utils/logger');
      
      logger.warn('Test warning');
      
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('WARNING');
      expect(loggedData.message).toBe('Test warning');
    });

    it('should include metadata in warning logs', () => {
      const { logger } = require('../../utils/logger');
      
      logger.warn('Rate limit warning', { ip: '192.168.1.1', attempts: 5 });
      
      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(loggedData.ip).toBe('192.168.1.1');
      expect(loggedData.attempts).toBe(5);
    });
  });

  describe('error', () => {
    it('should log error messages with Error object and report to Google', () => {
      const { logger } = require('../../utils/logger');
      const testError = new Error('Test error');
      
      logger.error('Error occurred', testError, { pageId: 'page123' });
      
      // Check console.error was called
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('ERROR');
      expect(loggedData.message).toBe('Error occurred');
      expect(loggedData.error.message).toBe('Test error');
      expect(loggedData.error.stack).toBeDefined();
      expect(loggedData.error.name).toBe('Error');
      
      // Check Google Error Reporting was called
      expect(mockReport).toHaveBeenCalledWith(testError, {
        user: 'page123',
        context: JSON.stringify({ pageId: 'page123' }),
      });
    });

    it('should log error with null error parameter', () => {
      const { logger } = require('../../utils/logger');
      
      logger.error('Error without error object', null, { info: 'test' });
      
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('ERROR');
      expect(loggedData.message).toBe('Error without error object');
      expect(loggedData.error).toBeUndefined();
      expect(loggedData.errorDetails).toBeUndefined();
      
      // Should not report to Google when error is null
      expect(mockReport).not.toHaveBeenCalled();
    });

    it('should log error with non-Error object (else if branch)', () => {
      const { logger } = require('../../utils/logger');
      const nonErrorObject = { code: 500, details: 'Server error' };
      
      logger.error('Error with object', nonErrorObject as any, { pageId: 'page456' });
      
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('ERROR');
      expect(loggedData.errorDetails).toEqual(nonErrorObject);
      
      // Should not report non-Error objects to Google
      expect(mockReport).not.toHaveBeenCalled();
    });

    it('should use userId as user identifier if provided', () => {
      const { logger } = require('../../utils/logger');
      const testError = new Error('Test');
      
      logger.error('Error', testError, { userId: 'user789' });
      
      expect(mockReport).toHaveBeenCalledWith(testError, {
        user: 'user789',
        context: expect.any(String),
      });
    });

    it('should fallback to "unknown" user if no userId or pageId', () => {
      const { logger } = require('../../utils/logger');
      const testError = new Error('Test');
      
      logger.error('Error', testError, {});
      
      expect(mockReport).toHaveBeenCalledWith(testError, {
        user: 'unknown',
        context: '{}',
      });
    });

    it('should prioritize userId over pageId', () => {
      const { logger } = require('../../utils/logger');
      const testError = new Error('Test');
      
      logger.error('Error', testError, { userId: 'user1', pageId: 'page1' });
      
      expect(mockReport).toHaveBeenCalledWith(testError, {
        user: 'user1',
        context: expect.any(String),
      });
    });
  });

  describe('critical', () => {
    it('should log critical errors and report with CRITICAL priority', () => {
      const { logger } = require('../../utils/logger');
      const criticalError = new Error('Critical failure');
      
      logger.critical('Critical error occurred', criticalError, { pageId: 'page999' });
      
      // Check console.error was called
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('CRITICAL');
      expect(loggedData.message).toBe('Critical error occurred');
      expect(loggedData.error.message).toBe('Critical failure');
      
      // Check Google Error Reporting was called with CRITICAL priority
      expect(mockReport).toHaveBeenCalledWith(criticalError, {
        user: 'page999',
        context: JSON.stringify({ pageId: 'page999', priority: 'CRITICAL' }),
      });
    });

    it('should use userId in critical error reporting', () => {
      const { logger } = require('../../utils/logger');
      const error = new Error('Critical');
      
      logger.critical('Critical', error, { userId: 'admin123' });
      
      expect(mockReport).toHaveBeenCalledWith(error, {
        user: 'admin123',
        context: expect.stringContaining('admin123'),
      });
    });

    it('should fallback to unknown user in critical errors', () => {
      const { logger } = require('../../utils/logger');
      const error = new Error('Critical');
      
      logger.critical('Critical', error, {});
      
      expect(mockReport).toHaveBeenCalledWith(error, {
        user: 'unknown',
        context: expect.any(String),
      });
    });
  });

  describe('debug', () => {
    it('should log debug messages when GCLOUD_PROJECT is not set', () => {
      // Ensure GCLOUD_PROJECT is not set
      delete process.env.GCLOUD_PROJECT;
      delete process.env.FUNCTIONS_EMULATOR;
      
      // Re-import logger to pick up new env
      jest.resetModules();
      const { logger } = require('../../utils/logger');
      
      logger.debug('Debug message', { test: 'data' });
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('DEBUG');
      expect(loggedData.message).toBe('Debug message');
      expect(loggedData.test).toBe('data');
    });

    it('should log debug messages when FUNCTIONS_EMULATOR is true', () => {
      process.env.GCLOUD_PROJECT = 'test-project';
      process.env.FUNCTIONS_EMULATOR = 'true';
      
      jest.resetModules();
      const { logger } = require('../../utils/logger');
      
      logger.debug('Emulator debug');
      
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
      expect(loggedData.severity).toBe('DEBUG');
    });

    it('should NOT log debug messages in production (GCLOUD_PROJECT set)', () => {
      process.env.GCLOUD_PROJECT = 'production-project';
      delete process.env.FUNCTIONS_EMULATOR;
      
      jest.resetModules();
      const { logger } = require('../../utils/logger');
      
      logger.debug('Should not appear');
      
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });
});

